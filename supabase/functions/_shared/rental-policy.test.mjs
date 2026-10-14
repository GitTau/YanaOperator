// Run: node --experimental-strip-types --test rental-policy.test.mjs
// Every expectation below is a founder decision from the Decision Log (D-0xx).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStatement, checkPause, unusedDaysRefund, securityRefundable, can, rupees, POLICY_V1 } from './rental-policy.ts';

// IST helper: ist('2026-10-09 10:05') → UTC ISO instant.
const ist = (s) => new Date(s.replace(' ', 'T') + ':00+05:30').toISOString();
const pay = (id, rupeesAmt, at) => ({ id, amountPaise: rupeesAmt * 100, verifiedAt: ist(at) });
const weekly = (over = {}) => ({
  plan: 'Weekly', dispatchedAt: ist('2026-10-01 08:00'), pauses: [], fineWaivers: [], closedAt: null,
  payments: [pay('start', 2750, '2026-09-30 18:00')], ...over,
});
const monthly = (over = {}) => ({
  plan: 'Monthly', dispatchedAt: ist('2026-10-01 08:00'), pauses: [], fineWaivers: [], closedAt: null,
  payments: [pay('start', 4000, '2026-09-30 18:00')], ...over,
});

test('D-002/D-001: weekly start needs ₹2,750 before dispatch', () => {
  const none = computeStatement({ ...weekly(), dispatchedAt: null, payments: [] }, ist('2026-09-30 12:00'));
  assert.equal(none.totalDueNowPaise, 275_000);
  assert.equal(none.dispatchGateCleared, false);
  const part = computeStatement({ ...weekly(), dispatchedAt: null, payments: [pay('a', 2000, '2026-09-30 11:00')] }, ist('2026-09-30 12:00'));
  assert.equal(part.securityBalancePaise, 100_000, 'security is topped up first (D-028)');
  assert.equal(part.dispatchGateCleared, false);
  const full = computeStatement({ ...weekly(), dispatchedAt: null }, ist('2026-09-30 19:00'));
  assert.equal(full.dispatchGateCleared, true);
  assert.equal(full.totalDueNowPaise, 0);
});

test('D-002: monthly start needs ₹4,000 (₹1,000 security + ₹3,000 first part)', () => {
  const st = computeStatement({ ...monthly(), dispatchedAt: null, payments: [] }, ist('2026-09-30 12:00'));
  assert.equal(st.totalDueNowPaise, 400_000);
  const ok = computeStatement({ ...monthly(), dispatchedAt: null }, ist('2026-09-30 19:00'));
  assert.equal(ok.dispatchGateCleared, true);
});

test('D-011: Day 1 is the dispatch date', () => {
  const st = computeStatement(weekly(), ist('2026-10-01 23:00'));
  assert.equal(st.currentRentalDay, 1);
  assert.equal(computeStatement(weekly(), ist('2026-10-07 09:00')).currentRentalDay, 7);
});

test('D-004: weekly reminder Day 7, grace Day 8, fine-free until 10 AM Day 9', () => {
  const d7 = computeStatement(weekly(), ist('2026-10-07 09:00'));
  assert.deepEqual(d7.notices.map((n) => n.kind), ['reminder']);
  const d8 = computeStatement(weekly(), ist('2026-10-08 09:00'));
  assert.deepEqual(d8.notices.map((n) => n.kind), ['grace']);
  const d9 = computeStatement(weekly(), ist('2026-10-09 09:59'));
  assert.equal(d9.fines.length, 0);
  assert.equal(d9.installments.find((i) => i.id === 'C2P1').status, 'grace');
  assert.equal(d9.nextFineAt, ist('2026-10-09 10:00'));
});

test('D-012: payment verified by 10:10 AM on trigger day is on time', () => {
  const st = computeStatement(weekly({ payments: [...weekly().payments, pay('w2', 1750, '2026-10-09 10:10')] }), ist('2026-10-09 18:00'));
  assert.equal(st.fines.length, 0);
  assert.equal(st.recoveryRequired, false);
});

test('D-004/D-012: payment at 10:11 AM is late — first ₹300 fine, taken from security', () => {
  const st = computeStatement(weekly({ payments: [...weekly().payments, pay('w2', 1750, '2026-10-09 10:11')] }), ist('2026-10-09 18:00'));
  assert.equal(st.fines.length, 1);
  assert.equal(st.fines[0].chargedAt, ist('2026-10-09 10:00'));
  assert.equal(st.fines[0].fromSecurityPaise, 30_000);
  // ₹1,750 paid: ₹300 restores security first (D-028), so ₹300 of rent stays unpaid.
  assert.equal(st.securityBalancePaise, 100_000);
  assert.equal(st.rentDuePaise, 30_000);
  assert.equal(st.recoveryRequired, true);
});

test('D-020: unpaid → another ₹300 at 10 AM each following day; security runs out then rider owes', () => {
  const st = computeStatement(weekly(), ist('2026-10-12 12:00'));
  assert.deepEqual(st.fines.map((f) => f.date), ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']);
  assert.equal(st.securityBalancePaise, 0);
  assert.equal(st.fines[3].fromSecurityPaise, 10_000);
  assert.equal(st.unpaidFinesPaise, 20_000);
  assert.equal(st.securityTopUpPaise, 100_000);
  assert.equal(st.totalDueNowPaise, 20_000 + 100_000 + 175_000);
  assert.equal(st.recoveryRequired, true);
  assert.equal(st.nextFineAt, ist('2026-10-13 10:00'));
});

test('D-028: partial payment clears fines, then security top-up, then rent', () => {
  // Two fines (₹600 from security). Pays ₹1,750 at 11:00 on Day 10.
  const st = computeStatement(weekly({ payments: [...weekly().payments, pay('p', 1750, '2026-10-10 11:00')] }), ist('2026-10-10 12:00'));
  assert.equal(st.fines.length, 2);
  assert.equal(st.securityBalancePaise, 100_000);
  assert.equal(st.rentDuePaise, 60_000);
  // Still short → a fine again next day.
  const next = computeStatement(weekly({ payments: [...weekly().payments, pay('p', 1750, '2026-10-10 11:00')] }), ist('2026-10-11 10:30'));
  assert.equal(next.fines.length, 3);
});

test('Paying everything owed stops fines and recovery', () => {
  const payments = [...weekly().payments, pay('p', 2350, '2026-10-10 11:00')]; // ₹600 security + ₹1,750 rent
  const st = computeStatement(weekly({ payments }), ist('2026-10-12 12:00'));
  assert.equal(st.fines.length, 2);
  assert.equal(st.totalDueNowPaise, 0);
  assert.equal(st.recoveryRequired, false);
});

test('D-016: Admin fine waiver gives the security back', () => {
  const base = computeStatement(weekly(), ist('2026-10-09 12:00'));
  const id = base.fines[0].id;
  const st = computeStatement(weekly({
    payments: [...weekly().payments, pay('p', 1750, '2026-10-09 15:00')],
    fineWaivers: [{ fineId: id, waivedAt: ist('2026-10-09 16:00') }],
  }), ist('2026-10-09 17:00'));
  assert.equal(st.fines[0].waived, true);
  assert.equal(st.securityBalancePaise, 100_000);
  assert.equal(st.totalDueNowPaise, 0);
  assert.equal(st.creditPaise, 0);
});

test('D-011: monthly 2nd ₹3,000 due Day 10 — reminders Day 9 & 10, grace Day 11, fine 10 AM Day 12', () => {
  assert.deepEqual(computeStatement(monthly(), ist('2026-10-09 09:00')).notices.map((n) => n.kind), ['reminder']);
  assert.deepEqual(computeStatement(monthly(), ist('2026-10-10 09:00')).notices.map((n) => n.kind), ['reminder']);
  assert.deepEqual(computeStatement(monthly(), ist('2026-10-11 09:00')).notices.map((n) => n.kind), ['grace']);
  const before = computeStatement(monthly(), ist('2026-10-12 09:00'));
  assert.equal(before.fines.length, 0);
  assert.equal(before.installments.find((i) => i.id === 'C1P2').triggerAt, ist('2026-10-12 10:00'));
  const onTime = computeStatement(monthly({ payments: [...monthly().payments, pay('m2', 3000, '2026-10-12 10:09')] }), ist('2026-10-12 20:00'));
  assert.equal(onTime.fines.length, 0);
  const late = computeStatement(monthly(), ist('2026-10-12 10:20'));
  assert.equal(late.fines.length, 1);
});

test('D-011: monthly is a 30-day cycle — next month due Day 30, fine 10 AM Day 32', () => {
  const payments = [...monthly().payments, pay('m2', 3000, '2026-10-10 12:00')];
  const st = computeStatement(monthly({ payments }), ist('2026-10-30 09:00'));
  const next = st.installments.find((i) => i.id === 'C2P1');
  assert.equal(next.dueDay, 30);
  assert.equal(next.dueDate, '2026-10-30');
  assert.equal(next.triggerAt, ist('2026-11-01 10:00'));
  assert.equal(st.installments.find((i) => i.id === 'C2P2').dueDay, 40);
});

test('D-023: paused days shift every deadline', () => {
  // Paused 5 Oct (not counted), resumed 8 Oct → 5, 6, 7 Oct skipped.
  const facts = weekly({ pauses: [{ startedAt: ist('2026-10-05 09:00'), resumedAt: ist('2026-10-08 12:00') }] });
  const st = computeStatement(facts, ist('2026-10-10 09:00'));
  assert.equal(st.currentRentalDay, 7);
  assert.equal(st.installments.find((i) => i.id === 'C2P1').triggerAt, ist('2026-10-12 10:00'));
  assert.equal(computeStatement(facts, ist('2026-10-12 10:30')).fines.length, 1);
});

test('D-013/D-023: while paused nothing becomes due and no fines are charged', () => {
  const facts = weekly({ pauses: [{ startedAt: ist('2026-10-05 09:00'), resumedAt: null }] });
  const st = computeStatement(facts, ist('2026-10-20 12:00'));
  assert.equal(st.isPaused, true);
  assert.equal(st.currentRentalDay, null);
  assert.equal(st.rentalDaysUsed, 4);
  assert.equal(st.fines.length, 0);
  assert.equal(st.installments.find((i) => i.id === 'C2P1').status, 'on_hold');
});

test('D-023: refund for unused paid days after a pause', () => {
  const facts = weekly({ pauses: [{ startedAt: ist('2026-10-04 09:00'), resumedAt: null }] });
  const st = computeStatement(facts, ist('2026-10-10 12:00'));
  assert.equal(st.rentalDaysUsed, 3);
  assert.deepEqual(unusedDaysRefund(st), { unusedDays: 4, amountPaise: 100_000 });
  assert.equal(securityRefundable(st), 100_000);
});

test('Fines stop once the rental is closed (return / recovery completed)', () => {
  const st = computeStatement(weekly({ closedAt: ist('2026-10-10 15:00') }), ist('2026-10-15 12:00'));
  assert.equal(st.fines.length, 2);
  assert.equal(st.recoveryRequired, false);
});

test('D-005/D-013/D-014: pause checks', () => {
  const st = computeStatement(weekly(), ist('2026-10-04 08:00'));
  const ok = { bookingStatus: 'Active', now: ist('2026-10-04 08:00'), riderDistanceMeters: 4, scooterDistanceMeters: 6, sameZapPoint: true };
  assert.deepEqual(checkPause(st, ok), { ok: true, blocks: [] });
  assert.ok(checkPause(st, { ...ok, riderDistanceMeters: 11 }).blocks.includes('rider_too_far'));
  // v1 (P-3 / D-034): no scooter hardware, so the scooter position is not checked by the server.
  assert.equal(POLICY_V1.scooterLocationRequired, false);
  assert.deepEqual(checkPause(st, { ...ok, scooterDistanceMeters: null }), { ok: true, blocks: [] });
  // A scooter distance that WAS measured still counts even though it is not required.
  assert.ok(checkPause(st, { ...ok, scooterDistanceMeters: 25 }).blocks.includes('scooter_too_far'));
  assert.ok(checkPause(st, { ...ok, scooterDistanceMeters: Number.NaN }).blocks.includes('location_unknown'));
  assert.ok(checkPause(st, { ...ok, scooterDistanceMeters: -1 }).blocks.includes('location_unknown'));
  assert.ok(checkPause(st, { ...ok, scooterDistanceMeters: undefined }).blocks.includes('location_unknown'));
  assert.ok(checkPause(st, { ...ok, riderDistanceMeters: null }).blocks.includes('location_unknown'));
  assert.ok(checkPause(st, { ...ok, riderDistanceMeters: null, gpsTooWeak: true }).blocks.includes('gps_weak'));
  // When scooter hardware arrives the same check is switched on by policy, not by code.
  const strict = { ...POLICY_V1, scooterLocationRequired: true };
  assert.ok(checkPause(st, { ...ok, scooterDistanceMeters: 25 }, strict).blocks.includes('scooter_too_far'));
  assert.ok(checkPause(st, { ...ok, scooterDistanceMeters: null }, strict).blocks.includes('location_unknown'));
  assert.ok(checkPause(st, { ...ok, sameZapPoint: false }).blocks.includes('different_zap_points'));
  assert.ok(checkPause(st, { ...ok, now: ist('2026-10-04 10:00') }).blocks.includes('after_cutoff'));
  const fined = computeStatement(weekly(), ist('2026-10-09 10:15'));
  assert.ok(checkPause(fined, { ...ok, now: ist('2026-10-10 08:00') }).blocks.includes('fines_started'));
});

test('Approvals: D-016, D-021, D-025, D-026', () => {
  const ctx = { bookingStoreId: 'OD03', siteStoreId: 'OD04', bookingCustomerId: 'cust-1' };
  const admin = { role: 'ADMIN', storeId: null, customerId: null, permissions: [] };
  const capOD03 = { role: 'OPERATOR', storeId: 'OD03', customerId: null, permissions: [] };
  const capOD04 = { role: 'OPERATOR', storeId: 'OD04', customerId: null, permissions: [] };
  const supervisor = { role: 'OPERATOR', storeId: 'OD02', customerId: null, permissions: ['VERIFY_CASH'] };
  const rider = { role: 'RIDER', storeId: null, customerId: 'cust-1', permissions: [] };
  const otherRider = { ...rider, customerId: 'cust-2' };
  assert.equal(can(admin, 'WAIVE_FINE', ctx), true);
  assert.equal(can(capOD03, 'WAIVE_FINE', ctx), false);
  assert.equal(can(admin, 'DECIDE_REFUND', ctx), true);
  assert.equal(can(capOD03, 'DECIDE_REFUND', ctx), false);
  assert.equal(can(capOD04, 'RECEIVE_RETURN', ctx), true);
  assert.equal(can(capOD04, 'APPROVE_RETURN', ctx), false);
  assert.equal(can(capOD03, 'APPROVE_RETURN', ctx), true);
  assert.equal(can(capOD03, 'PERFORM_RECOVERY', ctx), true);
  assert.equal(can(capOD04, 'PERFORM_RECOVERY', ctx), false);
  assert.equal(can(supervisor, 'VERIFY_CASH', ctx), true);
  assert.equal(can(capOD03, 'VERIFY_CASH', ctx), false);
  assert.equal(can(rider, 'REQUEST_REFUND', ctx), true);
  assert.equal(can(otherRider, 'REQUEST_REFUND', ctx), false);
  assert.equal(can(rider, 'START_PAUSE', ctx), true);
});

test('Bad money input is refused, never guessed', () => {
  assert.throws(() => computeStatement(weekly({ payments: [pay('x', 10.555, '2026-10-01 09:00')] }), ist('2026-10-02 09:00')));
  assert.throws(() => computeStatement(weekly({ payments: [pay('x', 10, '2026-10-01 09:00'), pay('x', 10, '2026-10-01 09:00')] }), ist('2026-10-02 09:00')));
  assert.equal(rupees(175_000), '₹1,750');
});
