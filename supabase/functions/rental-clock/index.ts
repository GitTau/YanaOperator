// ─────────────────────────────────────────────────────────────────────────────
// Supabase Edge Function: rental-clock
// Runs on a schedule (every 10 minutes; the 10:10 AM IST run is the one that
// matters). For every rental the engine manages it:
//   • writes each fine the policy engine says is due (one per day, idempotent)
//   • opens a recovery task for the booking-store Captain when a trigger passes
//     unpaid (D-004, D-019, D-021) and records that immobilization is requested
//   • returns reminder / grace notices for the notification provider (O-013 open)
//
// Protected by a shared secret header (x-cron-secret = RENTAL_CLOCK_SECRET).
// Never charges a booking that an Admin has not enrolled.
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { computeStatement, type NoticeView, rupees } from "../_shared/rental-policy.ts";
import { createAppraisalTask, json, loadRental } from "../_shared/rental-data.ts";

serve(async (req) => {
  const secret = Deno.env.get("RENTAL_CLOCK_SECRET") ?? "";
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ ok: false, code: "forbidden" }, 403);

  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });
  const now = new Date().toISOString();
  const enrolled = await db.from("rental_engine_bookings").select("booking_id");
  if (enrolled.error) return json({ ok: false, message: enrolled.error.message }, 500);

  const report = { checked: 0, finesWritten: 0, recoveriesOpened: 0, notices: [] as (NoticeView & { bookingId: string })[], errors: [] as string[] };

  for (const row of enrolled.data ?? []) {
    const bookingId = (row as { booking_id: string }).booking_id;
    try {
      const rental = await loadRental(db, bookingId);
      if (!["Active", "Paused"].includes(rental.booking.status)) continue;
      report.checked++;
      const st = computeStatement(rental.facts, now);

      // 1. Fines → ledger (audit copy; the engine stays the source of truth).
      const known = new Set(rental.ledger.filter((l) => l.entry_type === "FINE").map((l) => l.fine_key));
      for (const f of st.fines) {
        if (known.has(f.id)) continue;
        const r = await db.from("rental_ledger").insert({
          booking_id: bookingId, store_id: rental.booking.store_id, entry_type: "FINE", amount_paise: f.amountPaise,
          occurred_at: f.chargedAt, fine_key: f.id, idempotency_key: `fine:${bookingId}:${f.id}`,
          note: `Late payment fine ${rupees(f.amountPaise)} (${rupees(f.fromSecurityPaise)} from security)`,
        });
        if (r.error && r.error.code !== "23505") throw new Error(r.error.message);
        if (!r.error) report.finesWritten++;
      }

      // 2. Recovery for the booking-store Captain (D-021); scooter must come back (D-019).
      if (st.recoveryRequired) {
        const r = await db.from("recovery_tasks").insert({
          booking_id: bookingId, store_id: rental.booking.store_id, triggered_at: st.fines[0]?.chargedAt ?? now,
          immobilize_requested_at: now,
        }).select("id").single();
        if (r.error && r.error.code !== "23505") throw new Error(r.error.message);
        if (!r.error) {
          report.recoveriesOpened++;
          await createAppraisalTask(db, rental.booking.store_id, "RECOVERY", (r.data as { id: string }).id,
            `Recover overdue scooter (rental ${bookingId.slice(0, 8)}) to the store`);
          await db.from("notifications").insert({
            store_id: rental.booking.store_id, title: "Recovery required",
            body: `Rental ${bookingId.slice(0, 8)} is overdue. Recover the scooter to the store.`,
            type: "RECOVERY", is_read: false, data: { booking_id: bookingId },
          });
        }
      }

      // 3. Reminders / grace notices (sent once a provider is chosen, O-013).
      for (const n of st.notices) report.notices.push({ ...n, bookingId });
    } catch (e) {
      report.errors.push(`${bookingId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return json({ ok: report.errors.length === 0, at: now, ...report });
});
