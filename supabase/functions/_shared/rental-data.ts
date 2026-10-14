// ─────────────────────────────────────────────────────────────────────────────
// Loads facts for the rental policy engine from Supabase (service role only).
// Shared by rental-command and rental-clock Edge Functions.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { type Actor, computeStatement, type Permission, type Plan, type RentalFacts, type Role } from "./rental-policy.ts";

export class CommandError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export interface BookingRow {
  id: string;
  customer_id: string;
  store_id: string;
  status: string;
  rental_plan: Plan;
  started_at: string | null;
  completed_at: string | null;
  vehicle_id: string | null;
  battery_id: string | null;
}

export interface LedgerRow {
  id: string;
  entry_type: "PAYMENT" | "REFUND" | "FINE" | "FINE_WAIVER";
  amount_paise: number;
  method: string | null;
  occurred_at: string;
  fine_key: string | null;
}

export interface PauseRow {
  id: string;
  store_id: string;
  started_at: string;
  resumed_at: string | null;
  inspection_status: "PENDING" | "DONE";
}

export interface RentalBundle {
  booking: BookingRow;
  enrolled: boolean;
  ledger: LedgerRow[];
  pauses: PauseRow[];
  facts: RentalFacts;
}

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new CommandError(500, "db_error", `${what}: ${result.error.message}`);
  if (result.data === null) throw new CommandError(404, "not_found", `${what} not found`);
  return result.data;
}

/** Verified caller. Client-supplied ids/roles are never trusted. */
export async function loadActor(db: SupabaseClient, authHeader: string | null): Promise<Actor & { userId: string }> {
  const jwt = authHeader?.replace(/^Bearer\s+/i, "") ?? "";
  if (!jwt) throw new CommandError(401, "unauthenticated", "Sign in required");
  const { data: userData, error } = await db.auth.getUser(jwt);
  if (error || !userData.user) throw new CommandError(401, "unauthenticated", "Invalid session");
  const user = userData.user;

  const profileResult = await db.from("profiles").select("id, role, store_id").eq("id", user.id).maybeSingle();
  // An unavailable profile lookup must never turn a Captain or Admin into "no profile, so treat as rider".
  if (profileResult.error) throw new CommandError(500, "db_error", `Profile lookup: ${profileResult.error.message}`);
  const profile = profileResult.data;
  if (profile && profile.role !== "RIDER") {
    const perms = await db.from("staff_permissions").select("permission").eq("profile_id", user.id);
    if (perms.error) throw new CommandError(500, "db_error", perms.error.message);
    return {
      userId: user.id,
      role: profile.role as Role,
      storeId: (profile.store_id as string | null) ?? null,
      customerId: null,
      permissions: (perms.data ?? []).map((p: { permission: string }) => p.permission as Permission),
    };
  }
  // Rider: only through the binding made at login (link_rider_after_login, or a Captain's rider-match
  // decision). A phone number alone is never enough: two customers can share one (lockdown A / L).
  const link = await db.from("customer_auth_links").select("customer_id").eq("auth_user_id", user.id).maybeSingle();
  if (link.error) throw new CommandError(500, "db_error", link.error.message);
  if (!link.data) throw new CommandError(403, "no_identity", "This login is not linked to a rider record yet. Ask your Captain.");
  return { userId: user.id, role: "RIDER", storeId: null, customerId: (link.data as { customer_id: string }).customer_id, permissions: [] };
}

export async function loadRental(db: SupabaseClient, bookingId: string): Promise<RentalBundle> {
  const booking = must<BookingRow>(
    await db.from("bookings")
      .select("id, customer_id, store_id, status, rental_plan, started_at, completed_at, vehicle_id, battery_id")
      .eq("id", bookingId).maybeSingle(),
    "Booking",
  );
  const [enrolment, ledger, pauses, recovery] = await Promise.all([
    db.from("rental_engine_bookings").select("booking_id").eq("booking_id", bookingId).maybeSingle(),
    db.from("rental_ledger").select("id, entry_type, amount_paise, method, occurred_at, fine_key").eq("booking_id", bookingId).order("occurred_at"),
    db.from("rental_pauses").select("id, store_id, started_at, resumed_at, inspection_status").eq("booking_id", bookingId).order("started_at"),
    db.from("recovery_tasks").select("completed_at").eq("booking_id", bookingId).eq("status", "COMPLETED").order("completed_at").limit(1),
  ]);
  for (const r of [enrolment, ledger, pauses, recovery]) if (r.error) throw new CommandError(500, "db_error", r.error.message);
  const ledgerRows = (ledger.data ?? []) as LedgerRow[];
  const pauseRows = (pauses.data ?? []) as PauseRow[];
  const recoveredAt = (recovery.data?.[0] as { completed_at: string } | undefined)?.completed_at ?? null;
  const closedCandidates = [booking.completed_at, recoveredAt].filter((x): x is string => x !== null).sort();

  const facts: RentalFacts = {
    plan: booking.rental_plan,
    dispatchedAt: booking.started_at,
    pauses: pauseRows.map((p) => ({ startedAt: p.started_at, resumedAt: p.resumed_at })),
    payments: ledgerRows
      .filter((l) => l.entry_type === "PAYMENT")
      .map((l) => ({ id: l.id, amountPaise: Number(l.amount_paise), verifiedAt: l.occurred_at })),
    fineWaivers: ledgerRows
      .filter((l) => l.entry_type === "FINE_WAIVER" && l.fine_key !== null)
      .map((l) => ({ fineId: l.fine_key as string, waivedAt: l.occurred_at })),
    closedAt: closedCandidates[0] ?? null,
  };
  return { booking, enrolled: enrolment.data !== null, ledger: ledgerRows, pauses: pauseRows, facts };
}

/**
 * What an ENROLLED rental owes right now, in paise. The only dues figure for such a rental: the
 * statement from rental-policy.ts over the ledger (fines, security top-up, rent due). SQL has no
 * dues formula for enrolled rentals (lockdown C: booking_amount_due refuses them).
 */
export async function engineAmountDuePaise(db: SupabaseClient, bookingId: string): Promise<number> {
  const rental = await loadRental(db, bookingId);
  return computeStatement(rental.facts, new Date().toISOString()).totalDueNowPaise;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

// ── Appraisal tasks (Captain Performance → Tasks) ───────────────────────────
// Rental work becomes a task_entries row for the responsible Captain so Admin can
// rate it in the normal appraisal flow. Best effort: a failure here never blocks
// the rental action itself; it is reported back as `appraisalTask: "failed"`.

export type RentalTaskSource = "PAUSE_INSPECTION" | "RECOVERY" | "RETURN_APPROVAL";
const TASK_TYPE: Record<RentalTaskSource, "regular" | "non_regular" | "emergency"> = {
  PAUSE_INSPECTION: "regular",
  RECOVERY: "emergency",
  RETURN_APPROVAL: "non_regular",
};

function istToday(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

export async function createAppraisalTask(
  db: SupabaseClient, storeId: string, source: RentalTaskSource, sourceId: string, taskName: string,
): Promise<"created" | "exists" | "no_captain" | "failed"> {
  try {
    const existing = await db.from("rental_task_links").select("task_entry_id").eq("source_type", source).eq("source_id", sourceId).maybeSingle();
    if (existing.data) return "exists";
    const cap = await db.from("captains").select("id").eq("store_id", storeId).ilike("status", "active").limit(1).maybeSingle();
    if (!cap.data) return "no_captain";
    const cycle = await db.from("appraisal_cycles").select("id, start_date").eq("status", "active")
      .order("start_date", { ascending: false }).limit(1).maybeSingle();
    const today = istToday();
    const c = cycle.data as { id: string; start_date: string } | null;
    const week = c ? Math.max(1, Math.floor((Date.parse(today) - Date.parse(c.start_date)) / (7 * 86_400_000)) + 1) : 1;
    const task = await db.from("task_entries").insert({
      captain_id: (cap.data as { id: string }).id, cycle_id: c?.id ?? null, week_number: week, date: today,
      task_type: TASK_TYPE[source], task_name: `[Rental] ${taskName}`, status: "pending", is_recurring: false,
    }).select("id").single();
    if (task.error || !task.data) return "failed";
    const link = await db.from("rental_task_links").insert({ source_type: source, source_id: sourceId, task_entry_id: (task.data as { id: string }).id });
    return link.error ? "failed" : "created";
  } catch {
    return "failed";
  }
}

/** Marks the linked task as completed in the app; Admin still validates and gives stars. */
export async function noteAppraisalTaskDone(db: SupabaseClient, source: RentalTaskSource, sourceId: string, note: string): Promise<void> {
  try {
    const link = await db.from("rental_task_links").select("task_entry_id").eq("source_type", source).eq("source_id", sourceId).maybeSingle();
    const id = (link.data as { task_entry_id: string } | null)?.task_entry_id;
    if (!id) return;
    const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    await db.from("task_entries").update({ operator_remarks: `Completed in Rental Desk ${when}. ${note}`.trim() }).eq("id", id);
  } catch {
    // best effort
  }
}
