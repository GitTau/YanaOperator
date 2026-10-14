// ─────────────────────────────────────────────────────────────────────────────
// Supabase Edge Function: rental-command
// One authorised door for rental money, pause, recovery, refund and return actions.
// Every request: verify caller → load rental → run the shared policy engine →
// check permission → write. Apps never write these tables directly.
//
// POST { action, bookingId, idempotencyKey?, ...fields }
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import {
  type Action, type Actor, can, checkPause, computeStatement, POLICY_V1, securityRefundable, unusedDaysRefund,
} from "../_shared/rental-policy.ts";
import { CommandError, createAppraisalTask, json, loadActor, loadRental, noteAppraisalTaskDone, type RentalBundle } from "../_shared/rental-data.ts";

type Body = Record<string, unknown>;

function str(b: Body, key: string, required = true): string {
  const v = b[key];
  if (typeof v === "string" && v.length > 0 && v.length <= 200) return v;
  if (!required && (v === undefined || v === null)) return "";
  throw new CommandError(400, "bad_request", `${key} is required`);
}
function num(b: Body, key: string): number {
  const v = b[key];
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  throw new CommandError(400, "bad_request", `${key} must be a non-negative number`);
}
function signed(b: Body, key: string): number {
  const v = b[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  throw new CommandError(400, "bad_request", `${key} must be a number`);
}
function paise(b: Body, key: string): number {
  const v = num(b, key);
  if (!Number.isSafeInteger(v) || v === 0) throw new CommandError(400, "bad_request", `${key} must be whole paise above zero`);
  return v;
}
function check<T extends { error: { message: string; code?: string } | null }>(r: T, what: string): T {
  if (r.error) {
    if (r.error.code === "23505") throw new CommandError(409, "duplicate", `${what}: already exists`);
    throw new CommandError(500, "db_error", `${what}: ${r.error.message}`);
  }
  return r;
}

function requirePermission(actor: Actor, action: Action, rental: RentalBundle, siteStoreId: string | null): void {
  const ok = can(actor, action, {
    bookingStoreId: rental.booking.store_id,
    siteStoreId,
    bookingCustomerId: rental.booking.customer_id,
  });
  if (!ok) throw new CommandError(403, "forbidden", `Not allowed: ${action}`);
}

async function plateOf(db: SupabaseClient, rental: RentalBundle): Promise<string> {
  if (!rental.booking.vehicle_id) return `rental ${rental.booking.id.slice(0, 8)}`;
  const v = await db.from("vehicles").select("plate_number").eq("id", rental.booking.vehicle_id).maybeSingle();
  return (v.data as { plate_number: string } | null)?.plate_number ?? `rental ${rental.booking.id.slice(0, 8)}`;
}

function canView(actor: Actor, rental: RentalBundle): boolean {
  return actor.role === "ADMIN"
    || (actor.role === "OPERATOR" && actor.storeId === rental.booking.store_id)
    || (actor.role === "OPERATOR" && rental.pauses.some((p) => p.store_id === actor.storeId))
    || (actor.role === "RIDER" && actor.customerId === rental.booking.customer_id);
}

function requireEnrolled(rental: RentalBundle): void {
  if (!rental.enrolled) {
    throw new CommandError(409, "not_enrolled", "This rental is not yet managed by the rental engine. Admin must enrol it first.");
  }
}

/** Runs one all-or-nothing database transaction (rental_tx_* functions in the migration). */
async function tx(db: SupabaseClient, fn: string, args: Record<string, unknown>, what: string): Promise<unknown> {
  const r = await db.rpc(fn, args);
  if (r.error) {
    if (r.error.code === "P0001" || r.error.code === "P0002") throw new CommandError(409, "rejected", `${what}: ${r.error.message}`);
    if (r.error.code === "23505") throw new CommandError(409, "duplicate", `${what}: already done`);
    throw new CommandError(500, "db_error", `${what}: ${r.error.message}`);
  }
  return r.data;
}

async function closeRental(db: SupabaseClient, rental: RentalBundle, at: string, assetStoreId: string | null): Promise<void> {
  await tx(db, "rental_tx_close", { p_booking_id: rental.booking.id, p_at: at, p_asset_store_id: assetStoreId }, "Close rental");
}

async function handle(db: SupabaseClient, req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") throw new CommandError(405, "method", "POST only");
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object") throw new CommandError(400, "bad_request", "JSON body required");

  const actor = await loadActor(db, req.headers.get("Authorization"));
  const action = str(body, "action");

  // Cross-store returns (D-017): the receiving Captain finds the rental by scooter number.
  if (action === "find_rental_by_plate") {
    if (actor.role !== "OPERATOR" && actor.role !== "ADMIN") throw new CommandError(403, "forbidden", "Staff only");
    const plate = str(body, "plate").trim().toUpperCase();
    const v = check(await db.from("vehicles").select("id, plate_number").ilike("plate_number", plate).limit(2), "Find scooter");
    const vehicles = (v.data ?? []) as { id: string; plate_number: string }[];
    if (vehicles.length !== 1) throw new CommandError(404, "not_found", `No scooter with number ${plate}`);
    const vehicle = vehicles[0] as { id: string; plate_number: string };
    const b = check(await db.from("bookings").select("id, store_id, status, customer:customers(name)")
      .eq("vehicle_id", vehicle.id).in("status", ["Active", "Paused"]).order("created_at", { ascending: false }).limit(1), "Find rental");
    const row = (b.data ?? [])[0] as { id: string; store_id: string; status: string; customer: { name: string } | null } | undefined;
    if (!row) throw new CommandError(404, "not_found", `${vehicle.plate_number} has no active rental`);
    const store = check(await db.from("stores").select("name").eq("store_id", row.store_id).maybeSingle(), "Store");
    const firstName = (row.customer?.name ?? "Rider").split(" ")[0] ?? "Rider";
    return json({
      ok: true, bookingId: row.id, plate: vehicle.plate_number, status: row.status, riderFirstName: firstName,
      bookingStoreId: row.store_id, bookingStoreName: (store.data as { name: string } | null)?.name ?? "",
      isMyStore: row.store_id === actor.storeId,
    });
  }

  // Rental Desk list: every live rental of the Captain's store with its statement, in one call.
  if (action === "store_quotes") {
    if (actor.role !== "OPERATOR" && actor.role !== "ADMIN") throw new CommandError(403, "forbidden", "Staff only");
    const storeId = actor.role === "ADMIN" ? str(body, "storeId") : actor.storeId;
    if (!storeId) throw new CommandError(403, "forbidden", "No store assigned");
    const list = check(await db.from("bookings").select("id").eq("store_id", storeId).in("status", ["Active", "Paused"]).limit(200), "Store rentals");
    const at = new Date().toISOString();
    const quotes = await Promise.all(((list.data ?? []) as { id: string }[]).map(async ({ id }) => {
      const r = await loadRental(db, id);
      const open = r.pauses.find((p) => p.resumed_at === null) ?? null;
      return {
        bookingId: id,
        enrolled: r.enrolled,
        statement: r.enrolled ? computeStatement(r.facts, at) : null,
        openPause: open ? { id: open.id, storeId: open.store_id, inspected: open.inspection_status === "DONE", startedAt: open.started_at } : null,
      };
    }));
    return json({ ok: true, at, quotes });
  }

  const rental = await loadRental(db, str(body, "bookingId"));
  const now = new Date().toISOString();
  const statement = computeStatement(rental.facts, now);
  const key = (): string => `${action}:${actor.userId}:${str(body, "idempotencyKey")}`;

  switch (action) {
    // ── Read ───────────────────────────────────────────────────────────────
    case "quote": {
      if (!canView(actor, rental)) throw new CommandError(403, "forbidden", "Not your rental");
      return json({ ok: true, enrolled: rental.enrolled, statement, unusedDaysRefund: unusedDaysRefund(statement), securityRefundable: securityRefundable(statement) });
    }

    // ── Money ──────────────────────────────────────────────────────────────
    case "record_cash": {
      requireEnrolled(rental);
      const site = actor.storeId;
      requirePermission(actor, "RECORD_CASH", rental, site);
      const amount = paise(body, "amountPaise");
      const r = check(await db.from("rental_ledger").insert({
        booking_id: rental.booking.id, store_id: rental.booking.store_id, entry_type: "PAYMENT", amount_paise: amount,
        method: "CASH", occurred_at: now, idempotency_key: key(), actor_id: actor.userId, note: str(body, "note", false) || null,
      }).select("id").single(), "Cash entry");
      return json({ ok: true, ledgerId: r.data?.id, statement: computeStatement(await loadRental(db, rental.booking.id).then((x) => x.facts), now) });
    }
    case "verify_cash": {
      requirePermission(actor, "VERIFY_CASH", rental, null);
      const ledgerId = str(body, "ledgerId");
      const entry = rental.ledger.find((l) => l.id === ledgerId && l.entry_type === "PAYMENT" && l.method === "CASH");
      if (!entry) throw new CommandError(404, "not_found", "Cash entry not found on this rental");
      check(await db.from("cash_verifications").insert({ ledger_id: ledgerId, verified_by: actor.userId, note: str(body, "note", false) || null }), "Verify cash");
      return json({ ok: true });
    }
    case "waive_fine": {
      requirePermission(actor, "WAIVE_FINE", rental, null);
      const fineId = str(body, "fineId");
      const fine = statement.fines.find((f) => f.id === fineId);
      if (!fine) throw new CommandError(404, "not_found", "No such fine on this rental");
      if (fine.waived) throw new CommandError(409, "already_waived", "Fine already waived");
      check(await db.from("rental_ledger").insert({
        booking_id: rental.booking.id, store_id: rental.booking.store_id, entry_type: "FINE_WAIVER", amount_paise: fine.amountPaise,
        occurred_at: now, fine_key: fineId, idempotency_key: `waive:${rental.booking.id}:${fineId}`, actor_id: actor.userId,
        note: str(body, "reason"),
      }), "Waive fine");
      return json({ ok: true });
    }

    // ── Pause (D-013, D-014) ───────────────────────────────────────────────
    case "start_pause": {
      requireEnrolled(rental);
      requirePermission(actor, "START_PAUSE", rental, null);
      // The app sends only its GPS fix. The database says which ZAP Point the rider stands at and how
      // far (lockdown J); distances sent by a client are never used (D-013, D-034).
      const accuracy = num(body, "accuracyMeters");
      const located = await db.rpc("zap_point_locate", {
        p_lat: signed(body, "latitude"), p_lng: signed(body, "longitude"), p_accuracy_m: accuracy,
      });
      if (located.error) throw new CommandError(500, "db_error", `Locate ZAP Point: ${located.error.message}`);
      const fix = located.data as {
        ok: boolean; reason: string; store_id?: string; store_name?: string; distance_m?: number; radius_m?: number;
      };
      const measured = typeof fix.distance_m === "number" && fix.reason !== "gps_accuracy" ? fix.distance_m : null;
      const result = checkPause(statement, {
        bookingStatus: rental.booking.status, now,
        riderDistanceMeters: measured,
        scooterDistanceMeters: null, // no scooter hardware yet: the Captain confirms it at inspection (P-3)
        gpsTooWeak: fix.reason === "gps_accuracy",
        radiusMeters: typeof fix.radius_m === "number" ? fix.radius_m : undefined,
        sameZapPoint: true,
      });
      if (!result.ok || !fix.store_id || measured === null) {
        return json({
          ok: false, code: "pause_blocked", message: "Pause not allowed", blocks: result.blocks,
          nearest: fix.store_name ?? null, distanceMeters: measured, radiusMeters: fix.radius_m ?? null,
        }, 409);
      }
      const pauseId = await tx(db, "rental_tx_start_pause", {
        p_booking_id: rental.booking.id, p_store_id: fix.store_id, p_at: now,
        p_rider_m: measured, p_scooter_m: null, p_key: key(), p_accuracy_m: accuracy,
      }, "Start pause");
      // Immobilization: hardware provider still open (O-015). Captain inspection task is the pause row itself.
      const appraisalTask = await createAppraisalTask(db, fix.store_id, "PAUSE_INSPECTION", String(pauseId),
        `Inspect paused scooter ${await plateOf(db, rental)}`);
      return json({ ok: true, pauseId, storeName: fix.store_name ?? null, immobilize: "requested_pending_iot", appraisalTask });
    }
    case "complete_pause_inspection": {
      const open = rental.pauses.find((p) => p.id === str(body, "pauseId"));
      if (!open) throw new CommandError(404, "not_found", "Pause not found");
      requirePermission(actor, "INSPECT_PAUSE", rental, open.store_id);
      if (open.inspection_status === "DONE") return json({ ok: true, alreadyDone: true });
      // D-023: no scooter is held during a pause — inspection returns it to the pool.
      await tx(db, "rental_tx_finish_pause_inspection", {
        p_pause_id: open.id, p_actor: actor.userId, p_at: now, p_checklist_id: str(body, "checklistId", false) || null,
      }, "Finish inspection");
      await noteAppraisalTaskDone(db, "PAUSE_INSPECTION", open.id, "Scooter and battery inspected.");
      return json({ ok: true });
    }
    case "resume": {
      requireEnrolled(rental);
      const open = rental.pauses.find((p) => p.resumed_at === null);
      if (!open) throw new CommandError(409, "not_paused", "Rental is not paused");
      const site = actor.storeId;
      requirePermission(actor, "RECEIVE_RETURN", rental, site); // a Captain at the store hands over new assets
      if (open.inspection_status !== "DONE") throw new CommandError(409, "inspection_pending", "Finish the pause inspection first");
      if (statement.unpaidFinesPaise > 0 || statement.securityTopUpPaise > 0) {
        throw new CommandError(409, "dues_unpaid", `Clear ${statement.totalDueNowPaise / 100} rupees of fines/security first`);
      }
      const vehicleId = str(body, "vehicleId");
      const batteryId = str(body, "batteryId");
      // Claims assets only if still free at this store; nothing else changes if any check fails.
      await tx(db, "rental_tx_resume", {
        p_booking_id: rental.booking.id, p_store_id: site, p_vehicle_id: vehicleId, p_battery_id: batteryId, p_at: now,
      }, "Resume");
      return json({ ok: true });
    }

    // ── Recovery (D-019, D-021) ────────────────────────────────────────────
    case "start_recovery":
    case "complete_recovery": {
      requirePermission(actor, "PERFORM_RECOVERY", rental, null);
      const taskId = str(body, "taskId");
      if (action === "start_recovery") {
        check(await db.from("recovery_tasks").update({ status: "IN_PROGRESS", started_by: actor.userId, started_at: now })
          .eq("id", taskId).eq("booking_id", rental.booking.id).eq("status", "OPEN"), "Start recovery");
        return json({ ok: true });
      }
      const done = check(await db.from("recovery_tasks").update({
        status: "COMPLETED", completed_by: actor.userId, completed_at: now, checklist_id: str(body, "checklistId", false) || null,
      }).eq("id", taskId).eq("booking_id", rental.booking.id).in("status", ["OPEN", "IN_PROGRESS"]).select("id"), "Complete recovery");
      if (!done.data || done.data.length !== 1) throw new CommandError(409, "not_open", "Recovery task is not open");
      // Scooter is back at the store: rental closes; fines stop; rider must rebook after paying (D-019).
      await closeRental(db, rental, now, rental.booking.store_id);
      await noteAppraisalTaskDone(db, "RECOVERY", taskId, "Scooter recovered to store.");
      return json({ ok: true });
    }

    // ── Returns at any store (D-017, D-026) ────────────────────────────────
    case "receive_return": {
      const site = actor.storeId;
      requirePermission(actor, "RECEIVE_RETURN", rental, site);
      const sameStore = site === rental.booking.store_id;
      const r = check(await db.from("return_handoffs").insert({
        booking_id: rental.booking.id, booking_store_id: rental.booking.store_id, receiving_store_id: site,
        received_by: actor.userId, checklist_id: str(body, "checklistId", false) || null, idempotency_key: key(),
        approval_status: sameStore ? "APPROVED" : "PENDING", approved_by: sameStore ? actor.userId : null, approved_at: sameStore ? now : null,
      }).select("id").single(), "Receive return");
      if (sameStore) await closeRental(db, rental, now, site);
      const appraisalTask = sameStore ? "not_needed" : await createAppraisalTask(db, rental.booking.store_id, "RETURN_APPROVAL",
        String(r.data?.id), `Approve return of ${await plateOf(db, rental)} received at another store`);
      return json({ ok: true, handoffId: r.data?.id, needsApprovalFromBookingStore: !sameStore, appraisalTask });
    }
    case "approve_return": {
      requirePermission(actor, "APPROVE_RETURN", rental, null);
      const approve = body["approve"] === true;
      const r = check(await db.from("return_handoffs").update({
        approval_status: approve ? "APPROVED" : "REJECTED", approved_by: actor.userId, approved_at: now, note: str(body, "note", false) || null,
      }).eq("id", str(body, "handoffId")).eq("booking_id", rental.booking.id).eq("approval_status", "PENDING").select("receiving_store_id"), "Approve return");
      if (!r.data || r.data.length !== 1) throw new CommandError(409, "not_pending", "Return is not waiting for approval");
      await noteAppraisalTaskDone(db, "RETURN_APPROVAL", str(body, "handoffId"), approve ? "Return approved." : "Return rejected.");
      if (approve) {
        const receivingStore = (r.data[0] as { receiving_store_id: string }).receiving_store_id;
        await closeRental(db, rental, now, receivingStore); // scooter now belongs to the receiving store
      }
      return json({ ok: true });
    }

    // ── Refunds (D-023, D-024, D-025) ──────────────────────────────────────
    case "request_refund": {
      // Refund amounts come from the ledger, which only an enrolled rental has (D-033).
      requireEnrolled(rental);
      requirePermission(actor, "REQUEST_REFUND", rental, null);
      const kind = str(body, "kind");
      let amount: number;
      if (kind === "SECURITY_NO_RIDE") {
        if (statement.dispatched) throw new CommandError(409, "ride_started", "Ride already started");
        amount = rental.facts.payments.reduce((s, p) => s + p.amountPaise, 0); // everything paid before a ride
      } else if (kind === "UNUSED_DAYS") {
        if (!statement.isPaused) throw new CommandError(409, "not_paused", "Unused-day refunds are for paused rentals");
        amount = unusedDaysRefund(statement).amountPaise + securityRefundable(statement);
      } else if (kind === "SECURITY_END") {
        if (!["Completed"].includes(rental.booking.status)) throw new CommandError(409, "not_closed", "Return the scooter first");
        if (statement.unpaidFinesPaise > 0) throw new CommandError(409, "dues_unpaid", "Clear fines first");
        amount = securityRefundable(statement);
      } else throw new CommandError(400, "bad_request", "kind must be SECURITY_NO_RIDE, UNUSED_DAYS or SECURITY_END");
      if (amount <= 0) throw new CommandError(409, "nothing_to_refund", "Nothing to refund");
      const r = check(await db.from("refund_requests").insert({
        booking_id: rental.booking.id, customer_id: rental.booking.customer_id, store_id: rental.booking.store_id,
        kind, amount_paise: amount, idempotency_key: key(),
      }).select("id, amount_paise").single(), "Refund request");
      return json({ ok: true, requestId: r.data?.id, amountPaise: amount });
    }
    case "decide_refund": {
      requirePermission(actor, "DECIDE_REFUND", rental, null);
      const approve = body["approve"] === true;
      const r = check(await db.from("refund_requests").update({
        status: approve ? "APPROVED" : "REJECTED", decided_by: actor.userId, decided_at: now, decision_note: str(body, "note", false) || null,
      }).eq("id", str(body, "requestId")).eq("booking_id", rental.booking.id).eq("status", "REQUESTED").select("id"), "Decide refund");
      if (!r.data || r.data.length !== 1) throw new CommandError(409, "not_requested", "Refund is not waiting for a decision");
      return json({ ok: true });
    }
    case "mark_refund_paid": {
      requirePermission(actor, "DECIDE_REFUND", rental, null);
      const requestId = str(body, "requestId");
      const reference = str(body, "payoutReference");
      const reqRow = check(await db.from("refund_requests").select("amount_paise, status")
        .eq("id", requestId).eq("booking_id", rental.booking.id).maybeSingle(), "Refund request");
      const row = reqRow.data as { amount_paise: number; status: string } | null;
      if (!row) throw new CommandError(404, "not_found", "Refund request not found");
      if (row.status === "PAID") return json({ ok: true, alreadyPaid: true });
      if (row.status !== "APPROVED") throw new CommandError(409, "not_approved", "Refund is not approved");
      // Ledger first (safe to retry: same key), then mark the request paid.
      const led = await db.from("rental_ledger").insert({
        booking_id: rental.booking.id, store_id: rental.booking.store_id, entry_type: "REFUND",
        amount_paise: row.amount_paise, method: "CREDIT_TRANSFER", occurred_at: now,
        refund_request_id: requestId, idempotency_key: `refund:${requestId}`, actor_id: actor.userId, note: reference,
      });
      if (led.error && led.error.code !== "23505") throw new CommandError(500, "db_error", `Refund ledger entry: ${led.error.message}`);
      check(await db.from("refund_requests").update({ status: "PAID", paid_at: now, payout_reference: reference })
        .eq("id", requestId).eq("status", "APPROVED"), "Mark refund paid");
      return json({ ok: true });
    }

    // ── Consent (D-027) ────────────────────────────────────────────────────
    case "accept_consent": {
      requirePermission(actor, "ACCEPT_CONSENT", rental, null);
      const sha = str(body, "termsSha256");
      if (!/^[0-9a-f]{64}$/.test(sha)) throw new CommandError(400, "bad_request", "termsSha256 must be a SHA-256 hex digest");
      const r = await db.from("consent_records").insert({
        customer_id: rental.booking.customer_id, booking_id: rental.booking.id, terms_version: str(body, "termsVersion"), terms_sha256: sha,
      });
      if (r.error && r.error.code !== "23505") throw new CommandError(500, "db_error", r.error.message);
      return json({ ok: true, alreadyAccepted: r.error?.code === "23505" });
    }

    // ── Admin: enrol an existing rental with what was already paid ─────────
    // Enrolment hands the dues decision of this rental to the engine for good (D-033). The engine replays
    // fines from the dispatch date, so an opening balance that is too low back-dates fines: Admin previews first.
    case "preview_enroll": {
      if (actor.role !== "ADMIN") throw new CommandError(403, "forbidden", "Admin only");
      if (rental.enrolled) throw new CommandError(409, "already_enrolled", "This rental is already managed by the rental engine");
      const opening = typeof body["openingPaidPaise"] === "number" ? num(body, "openingPaidPaise") : 0;
      if (!Number.isSafeInteger(opening)) throw new CommandError(400, "bad_request", "openingPaidPaise must be whole paise");
      const facts = opening > 0
        ? { ...rental.facts, payments: [...rental.facts.payments, { id: "preview-opening", amountPaise: opening, verifiedAt: rental.booking.started_at ?? now }] }
        : rental.facts;
      return json({ ok: true, preview: true, statement: computeStatement(facts, now) });
    }
    case "enroll": {
      if (actor.role !== "ADMIN") throw new CommandError(403, "forbidden", "Admin only");
      if (!["Draft", "Active", "Paused"].includes(rental.booking.status)) {
        throw new CommandError(409, "not_open", "Only a draft, active or paused rental can be enrolled");
      }
      const opening = typeof body["openingPaidPaise"] === "number" ? paise(body, "openingPaidPaise") : 0;
      check(await db.from("rental_engine_bookings").insert({ booking_id: rental.booking.id, enrolled_by: actor.userId, opening_note: str(body, "note", false) || null }), "Enrol");
      if (opening > 0) {
        check(await db.from("rental_ledger").insert({
          booking_id: rental.booking.id, store_id: rental.booking.store_id, entry_type: "PAYMENT", amount_paise: opening,
          method: "CREDIT_TRANSFER", occurred_at: rental.booking.started_at ?? now, idempotency_key: `opening:${rental.booking.id}`,
          actor_id: actor.userId, note: "Opening balance: money received before the rental engine",
        }), "Opening balance");
      }
      return json({ ok: true, statement: computeStatement((await loadRental(db, rental.booking.id)).facts, now) });
    }
    default:
      throw new CommandError(400, "unknown_action", `Unknown action: ${action}`);
  }
}

serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });
  try {
    return await handle(db, req);
  } catch (e) {
    if (e instanceof CommandError) return json({ ok: false, code: e.code, message: e.message }, e.status);
    console.error("rental-command failed", e);
    return json({ ok: false, code: "internal", message: "Something went wrong" }, 500);
  }
});

// Policy version is returned so apps can show which rules were applied.
export const POLICY_VERSION = { fineRupees: POLICY_V1.finePaise / 100, bufferMinutes: POLICY_V1.paymentBufferMinutes };
