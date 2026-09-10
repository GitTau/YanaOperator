// ─────────────────────────────────────────────────────────────────────────────
// Booking Service — wraps all 3 Supabase RPCs + direct mutations
// All mutations: validate inputs → call RPC → throw on error (let caller handle)
// Business rule: booking cutoff hour is configurable via global_config
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase';
import type {
  CreateBookingParams,
  GlobalConfig,
  RecordPaymentParams,
  SwapAssetsParams,
} from '../lib/database.types';

// ── Booking cutoff check ───────────────────────────────────────────────────────
// If global_config.booking_cutoff_hour is set (e.g. 17 = 5 PM IST),
// new bookings are blocked before that hour (IST = UTC+5:30).
export function isBookingAllowed(config: GlobalConfig | null | undefined): {
  allowed: boolean;
  blockedUntil?: string;
} {
  // Booking cutoff hour check is disabled per business rule updates
  return { allowed: true };
}

// ── Timezone-Safe Date Parsing & Formatting ────────────────────────────────────
export function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ── Effective End Date (Accounts for live pause extensions) ────────────────────
// For Paused bookings, pausing immediately adds +1 day extension on the pause day,
// plus +1 day for each additional calendar day it remains paused.
export function getEffectiveEndDate(
  endDateStr: string | null | undefined,
  status: string | null | undefined,
  pausedAtStr: string | null | undefined,
): Date | null {
  const baseEnd = parseLocalDate(endDateStr);
  if (!baseEnd) return null;

  if (status === 'Paused' && pausedAtStr) {
    const pauseStart = new Date(pausedAtStr);
    if (!isNaN(pauseStart.getTime())) {
      const pauseStartDate = new Date(pauseStart.getFullYear(), pauseStart.getMonth(), pauseStart.getDate());
      const now = new Date();
      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffTime = todayDate.getTime() - pauseStartDate.getTime();
      const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

      // Pause immediately adds +1 day extension minimum, +1 for each day passed
      baseEnd.setDate(baseEnd.getDate() + diffDays + 1);
    }
  }

  return baseEnd;
}

export function getEffectiveEndDateStr(
  endDateStr: string | null | undefined,
  status: string | null | undefined,
  pausedAtStr: string | null | undefined,
): string | null {
  const effectiveDate = getEffectiveEndDate(endDateStr, status, pausedAtStr);
  if (!effectiveDate) return endDateStr ?? null;
  return formatLocalDate(effectiveDate);
}


// ── Overdue Fines Calculation ───────────────────────────────────────────────
// Standard: Grace period 1 day. Fines accumulate starting day 2 (₹300/day).
// Monthly 2nd part: due date T+9 days. Grace period T+10 and T+11.
// Fines accumulate starting day 12 (T+11 or later, days late >= 2) (₹300/day).
export function calculateOverdueFines(
  rentalPlan: 'Weekly' | 'Monthly',
  startDateStr: string | null | undefined,
  endDateStr: string | null | undefined,
  totalAmount: number,
  depositAmount: number,
  amountPaid: number,
  status?: string | null,
  pausedAtStr?: string | null,
): {
  overdueFine: number;
  isSecondPartOverdue: boolean;
  secondPartDueDateStr: string | null;
} {
  if (status === 'Completed' || status === 'Cancelled' || status === 'Paused') {
    return { overdueFine: 0, isSecondPartOverdue: false, secondPartDueDateStr: null };
  }

  if (!startDateStr || !endDateStr) {
    return { overdueFine: 0, isSecondPartOverdue: false, secondPartDueDateStr: null };
  }

  const startDate = parseLocalDate(startDateStr);
  const endDate = getEffectiveEndDate(endDateStr, status, pausedAtStr);
  if (!startDate || !endDate) {
    return { overdueFine: 0, isSecondPartOverdue: false, secondPartDueDateStr: null };
  }
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let overdueFine = 0;
  let isSecondPartOverdue = false;
  let secondPartDueDateStr: string | null = null;

  // 1. Calculate standard end-date overdue fine
  if (today > endDate) {
    const diffTime = today.getTime() - endDate.getTime();
    const daysLate = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (daysLate >= 2) {
      overdueFine = daysLate * 300;
    }
  }

  // 2. Calculate monthly 2nd part overdue fine
  if (rentalPlan === 'Monthly') {
    const secondPartDueDate = new Date(startDate);
    secondPartDueDate.setDate(startDate.getDate() + 9);
    secondPartDueDateStr = formatLocalDate(secondPartDueDate);

    if (today > secondPartDueDate) {
      // The 2nd-part fine is a penalty for not paying the RENT on time.
      // The security deposit is a separate held amount — do NOT include it here.
      // Only flag overdue if the rent itself (totalAmount) is not yet fully paid.
      const rentOutstanding = totalAmount - amountPaid;
      if (rentOutstanding > 1.0) {
        isSecondPartOverdue = true;
        const diffTime = today.getTime() - secondPartDueDate.getTime();
        const daysLate2ndPart = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (daysLate2ndPart >= 2) {
          const secondPartFine = daysLate2ndPart * 300;
          overdueFine = Math.max(overdueFine, secondPartFine);
        }
      }
    }
  }

  return { overdueFine, isSecondPartOverdue, secondPartDueDateStr };
}

// ── Revenue protection gate calculation ──────────────────────────────────────
// Weekly:  must pay 100% of (total + deposit + fines) before dispatch
// Monthly: must pay minimum ₹4,000 before dispatch (hard floor, not a %)
//          If total owed < ₹4,000, full amount is required.
//          If past the 2nd part due date (T+9 days), gate is 100% of total owed.
export const MONTHLY_GATE_FLOOR = 4000; // ₹ — update here if rate changes

export function calculatePaymentGate(
  rentalPlan: 'Weekly' | 'Monthly',
  totalAmount: number,
  depositAmount: number,
  finesAmount: number,
  amountPaid: number,
  startDateStr?: string | null,
  endDateStr?: string | null,
  status?: string | null,
  pausedAtStr?: string | null,
): {
  gatePct: number | null;  // null for Monthly (fixed floor, not a %)
  gateAmount: number;
  paidPct: number;
  isCleared: boolean;
  overdueFine: number;
  isSecondPartOverdue: boolean;
  secondPartDueDateStr: string | null;
} {
  const { overdueFine, isSecondPartOverdue, secondPartDueDateStr } = calculateOverdueFines(
    rentalPlan,
    startDateStr,
    endDateStr,
    totalAmount,
    depositAmount,
    amountPaid,
    status,
    pausedAtStr,
  );

  const totalFines = finesAmount + overdueFine;
  const totalOwed = totalAmount + depositAmount + totalFines;

  let gateAmount = 0;
  if (rentalPlan === 'Weekly') {
    gateAmount = totalOwed; // 100%
  } else {
    // For Monthly: 100% if 2nd part is overdue (today > T+9), otherwise ₹4,000 floor
    if (isSecondPartOverdue) {
      gateAmount = totalOwed;
    } else {
      gateAmount = Math.min(MONTHLY_GATE_FLOOR, totalOwed);
    }
  }

  const gatePct = rentalPlan === 'Weekly' ? 1.0 : (isSecondPartOverdue ? 1.0 : null);
  const paidPct = gateAmount > 0 ? Math.min(amountPaid / gateAmount, 1) : 1;

  return {
    gatePct,
    gateAmount,
    paidPct,
    isCleared: amountPaid >= gateAmount,
    overdueFine,
    isSecondPartOverdue,
    secondPartDueDateStr,
  };
}

// ── Revenue Protection — pricing breakdown ─────────────────────────────────
export function calculatePricing(
  plan: 'Weekly' | 'Monthly',
  config: GlobalConfig,
): {
  baseRent: number;
  gstAmount: number;
  subtotal: number;
  securityDeposit: number;
  dispatchLimit: number;
} {
  const baseRent = plan === 'Weekly' ? config.weekly_rate : config.monthly_rate;
  const gstAmount = baseRent * (config.gst_percentage / 100);
  const subtotal = baseRent + gstAmount;
  const securityDeposit = config.security_deposit;
  const dispatchLimit = subtotal + securityDeposit;

  return { baseRent, gstAmount, subtotal, securityDeposit, dispatchLimit };
}

// ── create_booking RPC ────────────────────────────────────────────────────────
export async function createBooking(
  params: CreateBookingParams & { start_date?: string; end_date?: string; charger_id?: string | null }
): Promise<string> {
  const { start_date, end_date, charger_id, ...rpcParams } = params;

  const { data, error } = await supabase.rpc('create_booking', {
    ...rpcParams,
    p_status: 'Draft',
    p_start_date: start_date || null,
    p_end_date: end_date || null,
    p_charger_id: charger_id || null,
  });

  if (error) throw new Error(`Create booking failed: ${error.message}`);
  return data as string;
}

// ── record_payment RPC ────────────────────────────────────────────────────────
export async function recordPayment(params: RecordPaymentParams): Promise<void> {
  // Fetch booking before payment
  const { data: bookingBefore } = await supabase
    .from('bookings')
    .select('status, paused_at, end_date')
    .eq('id', params.p_booking_id)
    .single();

  const { error } = await supabase.rpc('record_payment', params);
  if (error) throw new Error(`Record payment failed: ${error.message}`);

  // Fetch booking after payment to see if it was auto-unpaused (Active)
  if (bookingBefore && bookingBefore.status === 'Paused') {
    const { data: bookingAfter } = await supabase
      .from('bookings')
      .select('status')
      .eq('id', params.p_booking_id)
      .single();

    if (bookingAfter && bookingAfter.status === 'Active' && bookingBefore.paused_at && bookingBefore.end_date) {
      const effectiveEndDateStr = getEffectiveEndDateStr(bookingBefore.end_date, 'Paused', bookingBefore.paused_at);
      if (effectiveEndDateStr && effectiveEndDateStr !== bookingBefore.end_date) {
        const { error: updateError } = await supabase
          .from('bookings')
          .update({ end_date: effectiveEndDateStr })
          .eq('id', params.p_booking_id);
        if (updateError) {
          console.error('[recordPayment] Failed to shift end_date on auto-unpause:', updateError.message);
        }
      }
    }
  }
}

// ── swap_assets RPC ───────────────────────────────────────────────────────────
export async function swapAssets(params: SwapAssetsParams): Promise<void> {
  const { error } = await supabase.rpc('swap_assets', params);
  if (error) throw new Error(`Swap assets failed: ${error.message}`);
}

// ── swap_charger (direct mutation) ────────────────────────────────────────────
export async function swapCharger(params: {
  bookingId: string;
  vehicleId?: string | null;
  oldChargerId?: string | null;
  newChargerId?: string | null;
}): Promise<void> {
  if (params.oldChargerId) {
    const { error: oldErr } = await supabase
      .from('chargers')
      .update({ status: 'Available', assigned_vehicle_id: null })
      .eq('id', params.oldChargerId);
    if (oldErr) console.warn('[swapCharger] Failed to release old charger:', oldErr.message);
  }

  if (params.newChargerId) {
    const { error: newErr } = await supabase
      .from('chargers')
      .update({ status: 'In Use', assigned_vehicle_id: params.vehicleId || null })
      .eq('id', params.newChargerId);
    if (newErr) throw new Error(`Assign new charger failed: ${newErr.message}`);
  }

  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({ charger_id: params.newChargerId || null })
    .eq('id', params.bookingId);
  if (bookingErr) throw new Error(`Update booking charger failed: ${bookingErr.message}`);
}

// ── Pause booking (direct update) ─────────────────────────────────────────────
export async function pauseBooking(
  bookingId: string,
  vehicleId: string,
  batteryId: string,
  pauseReason: string,
  hasIssues?: boolean,
  chargerId?: string | null,
): Promise<void> {
  // Step 1: Update booking to Paused
  const { error: bookingError } = await supabase
    .from('bookings')
    .update({
      status: 'Paused',
      paused_at: new Date().toISOString(),
      pause_reason: pauseReason,
    })
    .eq('id', bookingId);
  if (bookingError) throw new Error(`Pause booking failed: ${bookingError.message}`);

  // Step 2: Release vehicle back to Available or Maintenance (delink battery)
  const finalStatus = hasIssues ? 'Maintenance' : 'Available';
  const { error: vehicleError } = await supabase
    .from('vehicles')
    .update({ status: finalStatus, assigned_battery_id: null })
    .eq('id', vehicleId);
  if (vehicleError) throw new Error(`Release vehicle failed: ${vehicleError.message}`);

  // Step 3: Release battery back to Available (delink vehicle)
  const { error: batteryError } = await supabase
    .from('batteries')
    .update({ status: 'Available', assigned_vehicle_id: null })
    .eq('id', batteryId);
  if (batteryError) throw new Error(`Release battery failed: ${batteryError.message}`);

  // Step 4: Release charger if assigned
  if (chargerId) {
    const { error: chargerError } = await supabase
      .from('chargers')
      .update({ status: 'Available', assigned_vehicle_id: null })
      .eq('id', chargerId);
    if (chargerError) console.warn('[pauseBooking] Release charger failed:', chargerError.message);
  }
}

// ── Complete / Return booking (direct update) ────────────────────────────────
export async function completeBooking(
  bookingId: string,
  vehicleId: string,
  batteryId: string,
  hasIssues?: boolean,
  chargerId?: string | null,
): Promise<void> {
  const { error: bookingError } = await supabase
    .from('bookings')
    .update({
      status: 'Completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', bookingId);
  if (bookingError) throw new Error(`Complete booking failed: ${bookingError.message}`);

  // Release vehicle to Available or Maintenance
  const finalStatus = hasIssues ? 'Maintenance' : 'Available';
  const { error: vehicleError } = await supabase
    .from('vehicles')
    .update({ status: finalStatus, assigned_battery_id: null })
    .eq('id', vehicleId);
  if (vehicleError) throw new Error(`Release vehicle failed: ${vehicleError.message}`);

  // Release battery
  const { error: batteryError } = await supabase
    .from('batteries')
    .update({ status: 'Available', assigned_vehicle_id: null })
    .eq('id', batteryId);
  if (batteryError) throw new Error(`Release battery failed: ${batteryError.message}`);

  // Release charger
  if (chargerId) {
    const { error: chargerError } = await supabase
      .from('chargers')
      .update({ status: 'Available', assigned_vehicle_id: null })
      .eq('id', chargerId);
    if (chargerError) console.warn('[completeBooking] Release charger failed:', chargerError.message);
  }
}

// ── Renew Booking (v1.9) ──────────────────────────────────────────────────────
export interface RenewBookingParams {
  oldBookingId: string;
  oldVehicleId: string;
  oldBatteryId: string;
  newVehicleId: string;
  newBatteryId: string;
  newPlan: 'Weekly' | 'Monthly';
  newRentAmount: number;
  newDepositAmount: number;
  cashAmountCollected: number;
  onlineAmountCollected: number;
  oldBookingBalance: number;
  customerId: string;
  operatorId: string;
  storeId: string;
  startDate: string;
  endDate: string;
  hasIssues?: boolean;
}

export async function renewBooking(params: RenewBookingParams): Promise<string> {
  const totalCollected = params.cashAmountCollected + params.onlineAmountCollected;
  const paymentToOldBooking = Math.min(params.oldBookingBalance, totalCollected);
  const paymentToNewBooking = Math.max(0, totalCollected - paymentToOldBooking);

  // Pro-rate payment to old booking cash/online splits
  let oldCash = 0;
  let oldOnline = 0;
  if (paymentToOldBooking > 0 && totalCollected > 0) {
    const ratio = paymentToOldBooking / totalCollected;
    oldCash = Math.round(params.cashAmountCollected * ratio * 100) / 100;
    oldOnline = Math.round(params.onlineAmountCollected * ratio * 100) / 100;
  }

  // Record payment on old booking if outstanding dues
  if (paymentToOldBooking > 0) {
    const { error: paymentError } = await supabase.rpc('record_payment', {
      p_booking_id: params.oldBookingId,
      p_store_id: params.storeId,
      p_cash_amount: oldCash,
      p_online_amount: oldOnline,
      p_operator_id: params.operatorId,
    });
    if (paymentError) throw new Error(`Failed to clear old booking dues: ${paymentError.message}`);
  }

  // Update old booking to Completed
  const { error: oldBookingCompleteError } = await supabase
    .from('bookings')
    .update({
      status: 'Completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', params.oldBookingId);
  if (oldBookingCompleteError) {
    throw new Error(`Failed to complete old booking: ${oldBookingCompleteError.message}`);
  }

  // Release old assets if swapped
  const isVehicleSwapped = params.oldVehicleId !== params.newVehicleId;
  const isBatterySwapped = params.oldBatteryId !== params.newBatteryId;

  if (isVehicleSwapped) {
    const finalVehicleStatus = params.hasIssues ? 'Maintenance' : 'Available';
    const { error: vehicleError } = await supabase
      .from('vehicles')
      .update({ status: finalVehicleStatus, assigned_battery_id: null })
      .eq('id', params.oldVehicleId);
    if (vehicleError) throw new Error(`Release old vehicle failed: ${vehicleError.message}`);
  }

  if (isBatterySwapped) {
    const { error: batteryError } = await supabase
      .from('batteries')
      .update({ status: 'Available', assigned_vehicle_id: null })
      .eq('id', params.oldBatteryId);
    if (batteryError) throw new Error(`Release old battery failed: ${batteryError.message}`);
  }

  // Create new booking via RPC
  const { data: newBookingId, error: createError } = await supabase.rpc('create_booking', {
    p_customer_id: params.customerId,
    p_vehicle_id: params.newVehicleId,
    p_battery_id: params.newBatteryId,
    p_store_id: params.storeId,
    p_rental_plan: params.newPlan,
    p_total_amount: params.newRentAmount,
    p_deposit_amount: params.newDepositAmount,
    p_amount_paid: 0, // set manually below with deposit carryover
    p_operator_id: params.operatorId,
  });

  if (createError || !newBookingId) {
    throw new Error(`Create renewed booking failed: ${createError?.message ?? 'Unknown error'}`);
  }

  // Fetch old booking to check how the deposit was originally paid (cash vs online)
  const { data: oldBooking } = await supabase
    .from('bookings')
    .select('amount_paid_cash, amount_paid_online')
    .eq('id', params.oldBookingId)
    .single();

  const oldBookingPaidCash = oldBooking?.amount_paid_cash ?? 0;
  const wasDepositPaidCash = oldBookingPaidCash >= params.newDepositAmount;

  // Splits for new booking (incorporating the carried-over security deposit)
  let newCash = Math.max(0, params.cashAmountCollected - oldCash);
  let newOnline = Math.max(0, params.onlineAmountCollected - oldOnline);

  if (wasDepositPaidCash) {
    newCash += params.newDepositAmount;
  } else {
    newOnline += params.newDepositAmount;
  }

  // Update new booking dates & payment details (security deposit transfers over)
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      start_date: params.startDate,
      end_date: params.endDate,
      started_at: new Date().toISOString(),
      status: 'Active',
      amount_paid: params.newDepositAmount + paymentToNewBooking,
      amount_paid_cash: newCash,
      amount_paid_online: newOnline,
      notes: `Renewed from booking ${params.oldBookingId}`,
    })
    .eq('id', newBookingId);

  if (updateError) {
    throw new Error(`Failed to initialize renewed booking details: ${updateError.message}`);
  }

  // Also tag old booking as renewed into the new booking
  await supabase
    .from('bookings')
    .update({
      notes: `Renewed into booking ${newBookingId}`,
    })
    .eq('id', params.oldBookingId);

  // Record audit log for payment collected on the new booking
  const newCashCollected = Math.max(0, params.cashAmountCollected - oldCash);
  const newOnlineCollected = Math.max(0, params.onlineAmountCollected - oldOnline);
  if (paymentToNewBooking > 0) {
    await supabase.from('audit_logs').insert({
      store_id: params.storeId,
      operator_id: params.operatorId,
      type: 'BOOKING',
      message: `Payment of Rs.${paymentToNewBooking} recorded for booking ${newBookingId}`,
      reason: `Breakdown: Cash: ${newCashCollected} | Online: ${newOnlineCollected} | Renewal payment (carried deposit: ${params.newDepositAmount})`,
    });
  }

  // Record audit log for renewal event
  await supabase.from('audit_logs').insert({
    store_id: params.storeId,
    operator_id: params.operatorId,
    type: 'BOOKING',
    message: `Booking Renewed: ${newBookingId}`,
    reason: `Renewed from prior booking ${params.oldBookingId}`,
  });

  return newBookingId;
}


// ── Dispatch booking (Draft / Paused → Active) ────────────────────────────────
export async function dispatchBooking(
  bookingId: string,
  vehicleId: string,
  batteryId: string,
  chargerId?: string | null,
  operatorId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('dispatch_booking', {
    p_booking_id: bookingId,
    p_vehicle_id: vehicleId,
    p_battery_id: batteryId,
    p_charger_id: chargerId || null,
    p_operator_id: operatorId || null,
  });

  if (error) throw new Error(`Dispatch failed: ${error.message}`);
}

// ── Create customer (Rider) ───────────────────────────────────────────────────
export async function createCustomer(
  customer: {
    store_id: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    aadhar_no?: string;
    pan_no?: string;
    emergency_contact_1?: string;
    emergency_contact_2?: string;
    bank_name?: string;
    account_holder_name?: string;
    account_number?: string;
    ifsc_code?: string;
    upi_id?: string;
    dob?: string;
  }
): Promise<string> {
  const { data, error } = await supabase
    .from('customers')
    .insert({ ...customer, kyc_status: true })
    .select('id')
    .single();
  if (error) throw new Error(`Create rider failed: ${error.message}`);
  return data.id;
}

// ── Format Aadhaar for display (always masked) ─────────────────────────────
// Never show full Aadhaar in UI. Always mask first 8 digits.
export function maskAadhaar(aadhaar: string | null): string {
  if (!aadhaar) return '—';
  const digits = aadhaar.replace(/\D/g, '');
  if (digits.length < 4) return 'XXXX-XXXX-XXXX';
  return `XXXX-XXXX-${digits.slice(-4)}`;
}

// ── Format currency for display ───────────────────────────────────────────────
export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

// ── Shorten UUID to NODE ID for display ───────────────────────────────────────
export function toNodeId(uuid: string): string {
  return uuid.slice(-4).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance Service Functions (v1.9)
// ─────────────────────────────────────────────────────────────────────────────

// ── Update vehicle status (Maintenance operations only) ───────────────────────
// Allowed transitions: Available ↔ Maintenance, Available ↔ Inactive.
// 'In Use' is NEVER set here — that's handled by dispatchBooking.
export async function updateVehicleStatus(
  vehicleId: string,
  status: 'Available' | 'Maintenance' | 'Inactive',
): Promise<void> {
  const { error } = await supabase
    .from('vehicles')
    .update({ status })
    .eq('id', vehicleId);
  if (error) throw new Error(`Vehicle status update failed: ${error.message}`);
}

// ── Save vehicle checklist (maintenance / return / pause flows) ───────────────
export async function saveVehicleChecklist(params: {
  vehicleId: string;
  storeId: string;
  bookingId: string | null;
  flow: 'return' | 'pause' | 'maintenance';
  itemStates: Record<string, string>;
  itemNotes: Record<string, string>;
  submittedBy: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('vehicle_checklists')
    .insert({
      vehicle_id:  params.vehicleId,
      store_id:    params.storeId,
      booking_id:  params.bookingId,
      flow:        params.flow,
      item_states: params.itemStates,
      item_notes:  params.itemNotes,
      submitted_by: params.submittedBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Save checklist failed: ${error.message}`);
  return data.id;
}

// ── Open a maintenance ticket for a vehicle ───────────────────────────────────
export async function openMaintenanceTicket(params: {
  vehicleId: string;
  storeId: string;
  description: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('maintenance_jobs')
    .insert({
      vehicle_id:  params.vehicleId,
      store_id:    params.storeId,
      status:      'Open',
      description: params.description,
      labour_cost: 0,
      parts_cost:  0,
      parts_used:  [],
    })
    .select('id')
    .single();
  if (error) throw new Error(`Open maintenance ticket failed: ${error.message}`);
  return data.id;
}

// ── Log repair cost, deduct parts, and close ticket → vehicle goes Available ──
export async function logRepairAndClose(params: {
  ticketId: string;
  vehicleId: string;
  labourCost: number;
  partsCost: number;
  partsUsed: Array<{ part_id: string; part_name: string; qty: number; unit_cost: number }>;
  resolutionNotes: string;
  resolvedBy: string | null;
}): Promise<void> {
  // Step 1: Close the maintenance ticket with cost data
  const { error: ticketError } = await supabase
    .from('maintenance_jobs')
    .update({
      status:           'Closed',
      labour_cost:      params.labourCost,
      parts_cost:       params.partsCost,
      parts_used:       params.partsUsed,
      resolution_notes: params.resolutionNotes,
      resolved_at:      new Date().toISOString(),
      resolved_by:      params.resolvedBy,
      closed_at:        new Date().toISOString(),
    })
    .eq('id', params.ticketId);
  if (ticketError) throw new Error(`Close ticket failed: ${ticketError.message}`);

  // Step 2: Deduct stock and update assumed_cost for each part used
  for (const part of params.partsUsed) {
    if (part.qty <= 0) continue;
    // decrement_part_stock RPC: stock_qty = MAX(0, stock_qty - qty), assumed_cost = unit_cost
    const { error: invError } = await supabase.rpc('decrement_part_stock', {
      p_part_id: part.part_id,
      p_qty:     part.qty,
      p_cost:    part.unit_cost,
    });
    if (invError) {
      // Non-fatal — log and continue (inventory deduct is best-effort for now)
      console.warn(`[logRepairAndClose] Failed to deduct stock for part ${part.part_name}:`, invError.message);
    }
  }

  // Step 3: Move vehicle back to Available
  const { error: vehicleError } = await supabase
    .from('vehicles')
    .update({ status: 'Available' })
    .eq('id', params.vehicleId);
  if (vehicleError) throw new Error(`Release vehicle to Available failed: ${vehicleError.message}`);
}

// ── Complete Captain Task ─────────────────────────────────────────────────────
export async function completeCaptainTask(taskId: string, operatorRemarks: string | null): Promise<void> {
  const { error } = await supabase
    .from('task_entries')
    .update({
      status: 'done',
      operator_remarks: operatorRemarks ? operatorRemarks.trim() : null,
    })
    .eq('id', taskId);
  if (error) throw new Error(`Complete task failed: ${error.message}`);
}

// ── Update Captain Push Token ──────────────────────────────────────────────────
export async function updateCaptainPushToken(captainId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('captains')
    .update({ push_token: token })
    .eq('id', captainId);
  if (error) throw new Error(`Update push token failed: ${error.message}`);
}

export async function updateStoreCaptainsPushToken(storeId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('captains')
    .update({ push_token: token })
    .eq('store_id', storeId);
  if (error) throw new Error(`Update store captains push token failed: ${error.message}`);
}

// ── Notifications Mutations ────────────────────────────────────────────────────
export async function markNotificationAsRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);
  if (error) throw new Error(`Mark notification read failed: ${error.message}`);
}

export async function markAllNotificationsAsRead(storeId: string | null, captainId: string | null): Promise<void> {
  let query = supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
  if (captainId) {
    query = query.eq('captain_id', captainId);
  } else if (storeId) {
    query = query.eq('store_id', storeId);
  }
  const { error } = await query;
  if (error) throw new Error(`Mark all notifications read failed: ${error.message}`);
}


