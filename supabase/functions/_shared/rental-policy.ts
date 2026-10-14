// ─────────────────────────────────────────────────────────────────────────────
// Yana rental policy engine — v1 (12 October 2026)
//
// ONE place that decides money, fines, pause and approval rules for every app.
// Pure TypeScript: no imports, no I/O, no clock. Runs in Deno (Edge Functions),
// Node (tests) and React Native (Operator). Money is integer paise. Time is
// ISO-8601 instants; rental days are counted on India (IST) calendar dates.
//
// Founder decisions encoded here (YanaOS/docs/Decision Log.md):
//   D-001/D-002/D-003  prices (GST-inclusive), ₹1,000 security
//   D-004              trigger day 10 AM IST: weekly Day 9, monthly Day 12
//   D-011              monthly = 30-day cycle; Day 1 = dispatch date;
//                      2nd ₹3,000 installment due by Day 10
//   D-012              payment verified by 10:10 AM counts as on time
//   D-013/D-014        pause rules; no pause once fines start
//   D-020              ₹300 again at 10 AM each following day while unpaid
//   D-023              paused days shift deadlines; unused-day refunds
//   D-028              partial payment clears fines → security top-up → rent
//   D-016/D-021/D-025/D-026  who may approve what (see `can`)
//
// Assumptions still to confirm with the founder are marked ASSUMPTION.
// ─────────────────────────────────────────────────────────────────────────────

export type Plan = 'Weekly' | 'Monthly';

export interface InstallmentRule {
  /** Rental day by which this part is due, counted inside its cycle (0 = at start of cycle). */
  readonly dueOffsetDays: number;
  readonly amountPaise: number;
}

export interface PlanRule {
  readonly cycleDays: number;
  readonly installments: readonly InstallmentRule[];
  /** Used only for unused-day refunds (D-023). */
  readonly rentPerDayPaise: number;
  /** Rental days of the due day on which reminders are sent, relative to the due day. */
  readonly reminderOffsets: readonly number[];
}

export interface Policy {
  readonly istOffsetMinutes: number;
  readonly securityTargetPaise: number;
  readonly finePaise: number;
  readonly fineHourIst: number;
  readonly paymentBufferMinutes: number;
  /** Trigger day = due day + this many rental days (D-004: weekly 7→9, monthly 10→12). */
  readonly triggerAfterDueDays: number;
  readonly pauseRadiusMeters: number;
  /**
   * Scooter position must be measured to start a pause. FALSE in v1 (P-3 / D-034): no scooter
   * hardware yet (O-015), so only the rider's phone is checked by the server and the Captain
   * confirms the scooter at the pause inspection. Switch on when the IoT location arrives.
   */
  readonly scooterLocationRequired: boolean;
  /** ASSUMPTION: original vision "pause only before 10 AM" kept. Set null to switch off. */
  readonly pauseCutoffHourIst: number | null;
  readonly plans: Readonly<Record<Plan, PlanRule>>;
}

export const POLICY_V1: Policy = {
  istOffsetMinutes: 330,
  securityTargetPaise: 100_000,
  finePaise: 30_000,
  fineHourIst: 10,
  paymentBufferMinutes: 10,
  triggerAfterDueDays: 2,
  pauseRadiusMeters: 10,
  scooterLocationRequired: false,
  pauseCutoffHourIst: 10,
  plans: {
    Weekly: {
      cycleDays: 7,
      installments: [{ dueOffsetDays: 0, amountPaise: 175_000 }],
      rentPerDayPaise: 25_000,
      reminderOffsets: [0],
    },
    Monthly: {
      cycleDays: 30,
      installments: [
        { dueOffsetDays: 0, amountPaise: 300_000 },
        { dueOffsetDays: 10, amountPaise: 300_000 },
      ],
      rentPerDayPaise: 20_000,
      reminderOffsets: [-1, 0],
    },
  },
};

// ── Inputs ───────────────────────────────────────────────────────────────────

export interface PaymentFact {
  readonly id: string;
  readonly amountPaise: number;
  /** When the money was verified (gateway capture / Captain cash entry). */
  readonly verifiedAt: string;
}

export interface PauseFact {
  readonly startedAt: string;
  readonly resumedAt: string | null;
}

export interface FineWaiverFact {
  readonly fineId: string;
  readonly waivedAt: string;
}

export interface RentalFacts {
  readonly plan: Plan;
  /** Handover instant. Null = not yet dispatched. Day 1 = its IST date (D-011). */
  readonly dispatchedAt: string | null;
  readonly pauses: readonly PauseFact[];
  readonly payments: readonly PaymentFact[];
  readonly fineWaivers: readonly FineWaiverFact[];
  /** Return accepted / recovery completed / rental closed. Fines stop after this. */
  readonly closedAt: string | null;
}

// ── Outputs ──────────────────────────────────────────────────────────────────

export type InstallmentStatus = 'paid' | 'upcoming' | 'due' | 'grace' | 'overdue' | 'on_hold';

export interface InstallmentView {
  readonly id: string;
  readonly cycle: number;
  readonly part: number;
  readonly dueDay: number;
  /** IST date (YYYY-MM-DD) of the due day; null while the rental is paused before it. */
  readonly dueDate: string | null;
  /** First fine instant (10 AM IST on trigger day); null for the start payment or while paused. */
  readonly triggerAt: string | null;
  readonly amountPaise: number;
  readonly paidPaise: number;
  readonly status: InstallmentStatus;
}

export interface FineView {
  readonly id: string;
  readonly date: string;
  readonly chargedAt: string;
  readonly amountPaise: number;
  /** Portion taken from the security balance. */
  readonly fromSecurityPaise: number;
  /** Portion the rider still owes. */
  readonly unpaidPaise: number;
  readonly waived: boolean;
}

export interface NoticeView {
  readonly kind: 'reminder' | 'grace';
  readonly installmentId: string;
  readonly rentalDay: number;
  readonly date: string;
}

export interface RentalStatement {
  readonly asOf: string;
  readonly plan: Plan;
  readonly dispatched: boolean;
  readonly isPaused: boolean;
  /** Rental day today; null before dispatch or while paused. */
  readonly currentRentalDay: number | null;
  /** Rental days actually used up to now (paused days excluded). */
  readonly rentalDaysUsed: number;
  readonly installments: readonly InstallmentView[];
  readonly fines: readonly FineView[];
  readonly securityBalancePaise: number;
  readonly securityTopUpPaise: number;
  readonly unpaidFinesPaise: number;
  /** Rent that is due now (due day reached, incl. the start payment). */
  readonly rentDuePaise: number;
  /** What the rider must pay now: fines + security top-up + rent due. */
  readonly totalDueNowPaise: number;
  readonly creditPaise: number;
  readonly rentPaidPaise: number;
  /** Start payment cleared: full security held and first rent part paid (non-negotiable gate). */
  readonly dispatchGateCleared: boolean;
  /** A trigger passed unpaid and dues remain: immobilize and recover (D-004, D-014, D-019). */
  readonly recoveryRequired: boolean;
  /** Next instant at which a new fine will be charged if nothing is paid. */
  readonly nextFineAt: string | null;
  readonly notices: readonly NoticeView[];
}

// ── IST calendar helpers ─────────────────────────────────────────────────────

const MINUTE = 60_000;
const DAY = 86_400_000;

function ms(iso: string): number {
  const v = Date.parse(iso);
  if (Number.isNaN(v)) throw new Error(`Invalid instant: ${iso}`);
  return v;
}

/** IST calendar day number (days since 1970-01-01 IST). */
export function istDay(instantMs: number, p: Policy = POLICY_V1): number {
  return Math.floor((instantMs + p.istOffsetMinutes * MINUTE) / DAY);
}

/** UTC instant of hh:mm IST on an IST day number. */
export function istInstant(day: number, hour: number, minute: number, p: Policy = POLICY_V1): number {
  return day * DAY - p.istOffsetMinutes * MINUTE + hour * 3_600_000 + minute * MINUTE;
}

export function istDateString(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

function iso(instantMs: number): string {
  return new Date(instantMs).toISOString();
}

function assertPaise(n: number, what: string): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${what} must be a non-negative integer number of paise`);
}

// ── Rental-day calendar (handles pauses, D-023) ─────────────────────────────

interface PausedRange { readonly from: number; readonly to: number } // IST days, [from, to)

class RentalCalendar {
  readonly d0: number;
  private readonly paused: readonly PausedRange[];

  constructor(dispatchedAtMs: number, pauses: readonly PauseFact[], p: Policy) {
    this.d0 = istDay(dispatchedAtMs, p);
    this.paused = pauses.map((x) => ({
      from: istDay(ms(x.startedAt), p),
      to: x.resumedAt === null ? Number.POSITIVE_INFINITY : istDay(ms(x.resumedAt), p),
    }));
  }

  isPaused(day: number): boolean {
    return this.paused.some((r) => day >= r.from && day < r.to);
  }

  /** Rental day number of an IST day; null if paused or before Day 1. */
  rentalDayOf(day: number): number | null {
    if (day < this.d0 || this.isPaused(day)) return null;
    let n = 0;
    for (let d = this.d0; d <= day; d++) if (!this.isPaused(d)) n++;
    return n;
  }

  /** Count of rental days used from Day 1 through `day` inclusive. */
  daysUsedThrough(day: number): number {
    let n = 0;
    for (let d = this.d0; d <= day; d++) if (!this.isPaused(d)) n++;
    return n;
  }

  /** IST day on which rental day `n` falls; null if an open pause comes first. */
  dayOfRentalDay(n: number): number | null {
    if (n < 1) return null;
    let count = 0;
    for (let d = this.d0; d < this.d0 + 20_000; d++) {
      if (this.isPaused(d)) {
        if (this.paused.some((r) => d >= r.from && r.to === Number.POSITIVE_INFINITY)) return null;
        continue;
      }
      count++;
      if (count === n) return d;
    }
    return null;
  }
}

// ── Statement engine ────────────────────────────────────────────────────────

interface MutableInstallment {
  id: string; cycle: number; part: number; dueDay: number; amountPaise: number; paidPaise: number;
  dueIstDay: number | null; triggerIstDay: number | null;
}
interface MutableFine {
  id: string; istDay: number; chargedAtMs: number; amountPaise: number;
  fromSecurityPaise: number; unpaidPaise: number; waived: boolean;
}

type TimedEvent =
  | { kind: 'payment'; at: number; order: number; fact: PaymentFact }
  | { kind: 'waiver'; at: number; order: number; fact: FineWaiverFact };

export function computeStatement(facts: RentalFacts, asOf: string, p: Policy = POLICY_V1): RentalStatement {
  const asOfMs = ms(asOf);
  const plan = p.plans[facts.plan];
  if (!plan) throw new Error(`Unknown plan: ${String(facts.plan)}`);
  for (const pay of facts.payments) assertPaise(pay.amountPaise, `payment ${pay.id}`);
  const seenPayments = new Set<string>();
  for (const pay of facts.payments) {
    if (seenPayments.has(pay.id)) throw new Error(`Duplicate payment id ${pay.id}`);
    seenPayments.add(pay.id);
  }

  const dispatchedMs = facts.dispatchedAt === null ? null : ms(facts.dispatchedAt);
  const cal = dispatchedMs === null ? null : new RentalCalendar(dispatchedMs, facts.pauses, p);
  const today = istDay(asOfMs, p);
  const isPaused = cal !== null && cal.isPaused(today) && today >= cal.d0;
  const currentRentalDay = cal === null ? null : cal.rentalDayOf(today);
  const rentalDaysUsed = cal === null || today < cal.d0 ? 0 : cal.daysUsedThrough(isPaused ? today - 1 : today);

  // Build installments up to one cycle beyond the current rental day.
  const horizonDay = Math.max(rentalDaysUsed, 0) + plan.cycleDays;
  const installments: MutableInstallment[] = [];
  for (let cycle = 1; cycle <= 1000; cycle++) {
    const cycleStart = (cycle - 1) * plan.cycleDays;
    if (cycle > 1 && cycleStart > horizonDay) break;
    plan.installments.forEach((rule, i) => {
      const dueDay = cycleStart + rule.dueOffsetDays;
      const isStartPayment = cycle === 1 && rule.dueOffsetDays === 0;
      const dueIstDay = cal === null ? null : dueDay < 1 ? cal.d0 : cal.dayOfRentalDay(dueDay);
      const triggerIstDay = isStartPayment || cal === null ? null : cal.dayOfRentalDay(dueDay + p.triggerAfterDueDays);
      installments.push({
        id: `C${cycle}P${i + 1}`, cycle, part: i + 1, dueDay, amountPaise: rule.amountPaise, paidPaise: 0,
        dueIstDay, triggerIstDay,
      });
    });
  }

  // Money state.
  let security = 0;
  let credit = 0;
  const fines: MutableFine[] = [];

  const allocate = (amount: number): void => {
    let left = amount;
    for (const f of fines) { // 1. fines (D-028)
      if (left === 0) break;
      const take = Math.min(left, f.unpaidPaise);
      f.unpaidPaise -= take; left -= take;
    }
    const topUp = Math.min(left, p.securityTargetPaise - security); // 2. security top-up
    security += topUp; left -= topUp;
    for (const inst of installments) { // 3. rent, oldest first
      if (left === 0) break;
      const take = Math.min(left, inst.amountPaise - inst.paidPaise);
      inst.paidPaise += take; left -= take;
    }
    credit += left; // 4. anything extra stays as credit
  };

  const applyEvent = (e: TimedEvent): void => {
    if (e.kind === 'payment') { allocate(e.fact.amountPaise); return; }
    const fine = fines.find((f) => f.id === e.fact.fineId);
    if (!fine || fine.waived) return; // unknown or already waived: no effect
    fine.waived = true;
    fine.unpaidPaise = 0;
    const restore = fine.fromSecurityPaise;
    const back = Math.min(restore, p.securityTargetPaise - security);
    security += back;
    if (restore - back > 0) allocate(restore - back);
  };

  const events: TimedEvent[] = [
    ...facts.payments.map((fact, order) => ({ kind: 'payment' as const, at: ms(fact.verifiedAt), order, fact })),
    ...facts.fineWaivers.map((fact, order) => ({ kind: 'waiver' as const, at: ms(fact.waivedAt), order: 100_000 + order, fact })),
  ].filter((e) => e.at <= asOfMs).sort((a, b) => a.at - b.at || a.order - b.order);
  let next = 0;
  const applyUntil = (limitMs: number): void => {
    for (let e = events[next]; e !== undefined && e.at <= limitMs; e = events[next]) {
      applyEvent(e);
      next++;
    }
  };

  // Daily fine checkpoints (D-004, D-012, D-020).
  const closedMs = facts.closedAt === null ? null : ms(facts.closedAt);
  const triggers = installments.map((x) => x.triggerIstDay).filter((d): d is number => d !== null);
  let nextFineAt: number | null = null;
  if (cal !== null && triggers.length > 0) {
    const firstTrigger = Math.min(...triggers);
    for (let day = firstTrigger; day <= today + 1; day++) {
      if (cal.isPaused(day)) continue;
      const fineAt = istInstant(day, p.fineHourIst, 0, p);
      const decideAt = fineAt + p.paymentBufferMinutes * MINUTE;
      if (closedMs !== null && fineAt >= closedMs) break;
      // Waivers are applied with other events; a fine can only be waived after it exists,
      // so apply events strictly before the decision instant, then decide.
      if (decideAt > asOfMs) {
        // Not decided yet. If this day has an overdue trigger, it is the next fine instant.
        applyUntil(asOfMs);
        const overdueSoon = installments.some((x) => x.triggerIstDay !== null && x.triggerIstDay <= day && x.paidPaise < x.amountPaise);
        if (overdueSoon && nextFineAt === null) nextFineAt = fineAt;
        break;
      }
      applyUntil(decideAt);
      const overdue = installments.some((x) => x.triggerIstDay !== null && x.triggerIstDay <= day && x.paidPaise < x.amountPaise);
      if (!overdue) continue;
      const fromSecurity = Math.min(security, p.finePaise);
      security -= fromSecurity;
      fines.push({
        id: `F${istDateString(day)}`, istDay: day, chargedAtMs: fineAt, amountPaise: p.finePaise,
        fromSecurityPaise: fromSecurity, unpaidPaise: p.finePaise - fromSecurity, waived: false,
      });
    }
  }
  applyUntil(asOfMs);

  // Views.
  const dayNow = currentRentalDay ?? rentalDaysUsed;
  const instViews: InstallmentView[] = installments.map((x) => {
    let status: InstallmentStatus;
    const triggerMs = x.triggerIstDay === null ? null : istInstant(x.triggerIstDay, p.fineHourIst, 0, p);
    if (x.paidPaise >= x.amountPaise) status = 'paid';
    else if (cal === null) status = x.dueDay === 0 ? 'due' : 'upcoming';
    else if (triggerMs !== null && asOfMs >= triggerMs + p.paymentBufferMinutes * MINUTE) status = 'overdue';
    else if (isPaused && x.dueDay > rentalDaysUsed) status = 'on_hold';
    else if (x.dueDay <= 0 || dayNow >= x.dueDay + 1) status = x.dueDay <= 0 ? 'due' : 'grace';
    else if (dayNow === x.dueDay) status = 'due';
    else status = 'upcoming';
    return {
      id: x.id, cycle: x.cycle, part: x.part, dueDay: x.dueDay,
      dueDate: x.dueIstDay === null ? null : istDateString(x.dueIstDay),
      triggerAt: triggerMs === null ? null : iso(triggerMs),
      amountPaise: x.amountPaise, paidPaise: x.paidPaise, status,
    };
  });

  const unpaidFines = fines.reduce((s, f) => s + f.unpaidPaise, 0);
  const securityTopUp = p.securityTargetPaise - security;
  const rentDue = installments
    .filter((x) => x.dueDay <= dayNow)
    .reduce((s, x) => s + (x.amountPaise - x.paidPaise), 0);
  const rentPaid = installments.reduce((s, x) => s + x.paidPaise, 0);
  const startPart = installments[0];
  const recoveryRequired = closedMs === null && instViews.some((x) => x.status === 'overdue');

  const notices: NoticeView[] = [];
  if (cal !== null && !isPaused && currentRentalDay !== null) {
    for (const x of installments) {
      if (x.dueDay <= 0 || x.paidPaise >= x.amountPaise) continue;
      for (const off of plan.reminderOffsets) {
        if (x.dueDay + off === currentRentalDay) notices.push({ kind: 'reminder', installmentId: x.id, rentalDay: currentRentalDay, date: istDateString(today) });
      }
      if (x.dueDay + 1 === currentRentalDay) notices.push({ kind: 'grace', installmentId: x.id, rentalDay: currentRentalDay, date: istDateString(today) });
    }
  }

  return {
    asOf: iso(asOfMs), plan: facts.plan, dispatched: cal !== null, isPaused,
    currentRentalDay, rentalDaysUsed,
    installments: instViews,
    fines: fines.map((f) => ({
      id: f.id, date: istDateString(f.istDay), chargedAt: iso(f.chargedAtMs), amountPaise: f.amountPaise,
      fromSecurityPaise: f.fromSecurityPaise, unpaidPaise: f.unpaidPaise, waived: f.waived,
    })),
    securityBalancePaise: security,
    securityTopUpPaise: securityTopUp,
    unpaidFinesPaise: unpaidFines,
    rentDuePaise: rentDue,
    totalDueNowPaise: unpaidFines + securityTopUp + rentDue,
    creditPaise: credit,
    rentPaidPaise: rentPaid,
    dispatchGateCleared: startPart !== undefined && security >= p.securityTargetPaise && startPart.paidPaise >= startPart.amountPaise,
    recoveryRequired,
    nextFineAt: nextFineAt === null ? null : iso(nextFineAt),
    notices,
  };
}

// ── Pause (D-005, D-013, D-014) ─────────────────────────────────────────────

export interface PauseRequest {
  readonly bookingStatus: string;
  readonly now: string;
  /** Server-measured distance of the rider's phone to the ZAP Point; null = no usable fix. */
  readonly riderDistanceMeters: number | null;
  /** Null while no scooter hardware exists; only enforced when `scooterLocationRequired`. */
  readonly scooterDistanceMeters: number | null;
  /** The phone's GPS fix was too weak to trust (server rejected it); no distance was measured. */
  readonly gpsTooWeak?: boolean;
  /** Radius of the ZAP Point the rider was measured against; defaults to the policy radius. */
  readonly radiusMeters?: number;
  /** Rider and scooter measured against the same ZAP Point. */
  readonly sameZapPoint: boolean;
}

export type PauseBlock =
  | 'not_active' | 'already_paused' | 'fines_started' | 'rider_too_far' | 'scooter_too_far'
  | 'location_unknown' | 'gps_weak' | 'different_zap_points' | 'after_cutoff';

export function checkPause(st: RentalStatement, req: PauseRequest, p: Policy = POLICY_V1): { ok: boolean; blocks: PauseBlock[] } {
  const blocks: PauseBlock[] = [];
  if (req.bookingStatus !== 'Active' || !st.dispatched) blocks.push('not_active');
  if (st.isPaused) blocks.push('already_paused');
  // D-014: once fines start (owed, or taken from security and not yet restored) pause is closed.
  if (st.unpaidFinesPaise > 0 || st.recoveryRequired || st.securityTopUpPaise > 0) blocks.push('fines_started');
  // Distances must be real, finite, non-negative measurements. NaN, a negative number or a missing (undefined)
  // field fail closed. `null` means "not measured": allowed for the scooter while no scooter hardware exists
  // (P-3 / D-034), never for the rider's own phone.
  const measured = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (req.gpsTooWeak) blocks.push('gps_weak');
  else {
    const scooterGiven = req.scooterDistanceMeters !== null;
    if (
      !measured(req.riderDistanceMeters) ||
      (scooterGiven && !measured(req.scooterDistanceMeters)) ||
      (p.scooterLocationRequired && !measured(req.scooterDistanceMeters))
    ) {
      blocks.push('location_unknown');
    } else {
      const radius = req.radiusMeters ?? p.pauseRadiusMeters;
      if (req.riderDistanceMeters > radius) blocks.push('rider_too_far');
      if (measured(req.scooterDistanceMeters) && req.scooterDistanceMeters > radius) blocks.push('scooter_too_far');
    }
  }
  if (!req.sameZapPoint) blocks.push('different_zap_points');
  if (p.pauseCutoffHourIst !== null) {
    const nowMs = ms(req.now);
    const cutoff = istInstant(istDay(nowMs, p), p.pauseCutoffHourIst, 0, p);
    if (nowMs >= cutoff) blocks.push('after_cutoff');
  }
  return { ok: blocks.length === 0, blocks };
}

// ── Refunds (D-023, D-024) ─────────────────────────────────────────────────

/** Refund for paid-but-unused rental days, e.g. when a paused rider gives up waiting. */
export function unusedDaysRefund(st: RentalStatement, p: Policy = POLICY_V1): { unusedDays: number; amountPaise: number } {
  const perDay = p.plans[st.plan].rentPerDayPaise;
  const paidDays = Math.floor(st.rentPaidPaise / perDay);
  const unusedDays = Math.max(0, paidDays - st.rentalDaysUsed);
  return { unusedDays, amountPaise: unusedDays * perDay };
}

/** Security refundable to the rider: the balance actually held, minus fines still owed. */
export function securityRefundable(st: RentalStatement): number {
  return Math.max(0, st.securityBalancePaise - st.unpaidFinesPaise);
}

// ── Permissions (D-016, D-021, D-025, D-026) ───────────────────────────────

export type Role = 'ADMIN' | 'OPERATOR' | 'MECHANIC' | 'RIDER';
export type Permission = 'VERIFY_CASH';

export interface Actor {
  readonly role: Role;
  readonly storeId: string | null;
  /** For riders: the customer record they are verified as. */
  readonly customerId: string | null;
  readonly permissions: readonly Permission[];
}

export type Action =
  | 'START_PAUSE' | 'REQUEST_REFUND' | 'ACCEPT_CONSENT'
  | 'INSPECT_PAUSE' | 'RECEIVE_RETURN' | 'APPROVE_RETURN' | 'PERFORM_RECOVERY' | 'RECORD_CASH'
  | 'VERIFY_CASH' | 'WAIVE_FINE' | 'DECIDE_REFUND';

export interface ActionContext {
  /** Store the rental was booked at. */
  readonly bookingStoreId: string;
  /** Store where the action physically happens (pause/return point). */
  readonly siteStoreId: string | null;
  readonly bookingCustomerId: string;
}

export function can(actor: Actor, action: Action, ctx: ActionContext): boolean {
  const isStoreStaff = (store: string | null): boolean => actor.role === 'OPERATOR' && store !== null && actor.storeId === store;
  switch (action) {
    case 'START_PAUSE':
    case 'REQUEST_REFUND':
    case 'ACCEPT_CONSENT':
      return actor.role === 'RIDER' && actor.customerId !== null && actor.customerId === ctx.bookingCustomerId;
    case 'INSPECT_PAUSE':
    case 'RECEIVE_RETURN':
      return isStoreStaff(ctx.siteStoreId); // the Captain where the scooter physically is
    case 'APPROVE_RETURN': // D-026: original booking-store Captain approves
    case 'PERFORM_RECOVERY': // D-021: booking-store Captain recovers
      return isStoreStaff(ctx.bookingStoreId);
    case 'RECORD_CASH': // the Captain of the hub the rental was booked at (or Admin); never another hub
      return isStoreStaff(ctx.bookingStoreId) || actor.role === 'ADMIN';
    case 'VERIFY_CASH': // D-025: Supervisor "Collected" button
      return actor.role === 'ADMIN' || actor.permissions.includes('VERIFY_CASH');
    case 'WAIVE_FINE': // D-016
    case 'DECIDE_REFUND': // D-025
      return actor.role === 'ADMIN';
    default: {
      // Exhaustive at compile time; at run time an unknown action is always denied.
      const unknownAction: never = action;
      void unknownAction;
      return false;
    }
  }
}

/** ₹ display helper: 175000 → "₹1,750". */
export function rupees(paise: number): string {
  const r = paise / 100;
  return '₹' + r.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 });
}
