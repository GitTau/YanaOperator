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
): {
  overdueFine: number;
  isSecondPartOverdue: boolean;
  secondPartDueDateStr: string | null;
} {
  if (!startDateStr || !endDateStr) {
    return { overdueFine: 0, isSecondPartOverdue: false, secondPartDueDateStr: null };
  }

  const startDate = parseLocalDate(startDateStr);
  const endDate = parseLocalDate(endDateStr);
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
      isSecondPartOverdue = true;
      // Only charge 2nd part fine if they haven't paid the base rent + deposit
      if (amountPaid < totalAmount + depositAmount) {
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
  params: CreateBookingParams & { start_date?: string; end_date?: string }
): Promise<string> {
  const { start_date, end_date, ...rpcParams } = params;
  const { data, error } = await supabase.rpc('create_booking', rpcParams);
  if (error) throw new Error(`Create booking failed: ${error.message}`);

  const bookingId = data as string;

  // The create_booking RPC marks the booking as 'Active' immediately,
  // but it must start as 'Draft' until physical dispatch occurs.
  // Reset it back to 'Draft' and clear started_at.
  const { error: bookingResetError } = await supabase
    .from('bookings')
    .update({
      status: 'Draft',
      started_at: null,
      start_date: start_date || null,
      end_date: end_date || null,
    })
    .eq('id', bookingId);
  if (bookingResetError) {
    console.error('[createBooking] Failed to reset booking status to Draft:', bookingResetError.message);
  }

  // The create_booking RPC marks vehicle + battery as 'In Use' immediately,
  // but assets must only be locked on Dispatch (when payment gate is cleared).
  // Release them back to Available now — dispatchBooking will re-lock on dispatch.
  const { error: vehicleResetError } = await supabase
    .from('vehicles')
    .update({ status: 'Available', assigned_battery_id: null })
    .eq('id', params.p_vehicle_id);
  if (vehicleResetError) {
    console.error('[createBooking] Failed to reset vehicle status:', vehicleResetError.message);
  }

  const { error: batteryResetError } = await supabase
    .from('batteries')
    .update({ status: 'Available', assigned_vehicle_id: null })
    .eq('id', params.p_battery_id);
  if (batteryResetError) {
    console.error('[createBooking] Failed to reset battery status:', batteryResetError.message);
  }

  if (start_date && end_date) {
    const { error: customerError } = await supabase
      .from('customers')
      .update({ start_date, end_date })
      .eq('id', params.p_customer_id);

    if (customerError) {
      console.error('Failed to update customer rental dates:', customerError.message);
    }
  }

  return bookingId;
}

// ── record_payment RPC ────────────────────────────────────────────────────────
export async function recordPayment(params: RecordPaymentParams): Promise<void> {
  const { error } = await supabase.rpc('record_payment', params);
  if (error) throw new Error(`Record payment failed: ${error.message}`);
}

// ── swap_assets RPC ───────────────────────────────────────────────────────────
export async function swapAssets(params: SwapAssetsParams): Promise<void> {
  const { error } = await supabase.rpc('swap_assets', params);
  if (error) throw new Error(`Swap assets failed: ${error.message}`);
}

// ── Pause booking (direct update) ─────────────────────────────────────────────
export async function pauseBooking(
  bookingId: string,
  vehicleId: string,
  batteryId: string,
  pauseReason: string,
  hasIssues?: boolean,
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
}

// ── Complete / Return booking (direct update) ────────────────────────────────
export async function completeBooking(
  bookingId: string,
  vehicleId: string,
  batteryId: string,
  hasIssues?: boolean,
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
}

// ── Dispatch booking (Draft → Active) ─────────────────────────────────────────
export async function dispatchBooking(
  bookingId: string,
  vehicleId: string,
  batteryId: string,
): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'Active',
      started_at: new Date().toISOString(),
    })
    .eq('id', bookingId);
  if (error) throw new Error(`Dispatch failed: ${error.message}`);

  const { error: vehicleError } = await supabase
    .from('vehicles')
    .update({ status: 'In Use', assigned_battery_id: batteryId })
    .eq('id', vehicleId);
  if (vehicleError) throw new Error(`Vehicle status update failed: ${vehicleError.message}`);

  const { error: batteryError } = await supabase
    .from('batteries')
    .update({ status: 'In Use', assigned_vehicle_id: vehicleId })
    .eq('id', batteryId);
  if (batteryError) throw new Error(`Battery status update failed: ${batteryError.message}`);
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

