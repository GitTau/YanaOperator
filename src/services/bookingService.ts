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
  const cutoff = config?.booking_cutoff_hour;
  if (cutoff === null || cutoff === undefined) return { allowed: true };

  // Convert current UTC time to IST
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const currentHour = nowIST.getHours();

  if (currentHour < cutoff) {
    const ampm = cutoff >= 12 ? 'PM' : 'AM';
    const displayHour = cutoff > 12 ? cutoff - 12 : cutoff;
    return {
      allowed: false,
      blockedUntil: `${displayHour}:00 ${ampm} IST`,
    };
  }
  return { allowed: true };
}

// ── Revenue protection gate calculation ──────────────────────────────────────
// Weekly:  must pay 100% of (total + deposit + fines) before dispatch
// Monthly: must pay minimum ₹4,000 before dispatch (hard floor, not a %)
//          If total owed < ₹4,000, full amount is required.
export const MONTHLY_GATE_FLOOR = 4000; // ₹ — update here if rate changes

export function calculatePaymentGate(
  rentalPlan: 'Weekly' | 'Monthly',
  totalAmount: number,
  depositAmount: number,
  finesAmount: number,
  amountPaid: number,
): {
  gatePct: number | null;  // null for Monthly (fixed floor, not a %)
  gateAmount: number;
  paidPct: number;
  isCleared: boolean;
} {
  const totalOwed = totalAmount + depositAmount + finesAmount;
  const gateAmount =
    rentalPlan === 'Weekly'
      ? totalOwed                                        // 100%
      : Math.min(MONTHLY_GATE_FLOOR, totalOwed);        // ₹4,000 floor
  const gatePct = rentalPlan === 'Weekly' ? 1.0 : null;
  const paidPct = totalOwed > 0 ? amountPaid / totalOwed : 1;
  return {
    gatePct,
    gateAmount,
    paidPct,
    isCleared: amountPaid >= gateAmount,
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
    .update({ status: 'Draft', started_at: null })
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

  // Step 2: Release vehicle back to Available (delink battery)
  const { error: vehicleError } = await supabase
    .from('vehicles')
    .update({ status: 'Available', assigned_battery_id: null })
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
export async function completeBooking(bookingId: string, vehicleId: string, batteryId: string): Promise<void> {
  const { error: bookingError } = await supabase
    .from('bookings')
    .update({
      status: 'Completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', bookingId);
  if (bookingError) throw new Error(`Complete booking failed: ${bookingError.message}`);

  // Release vehicle
  const { error: vehicleError } = await supabase
    .from('vehicles')
    .update({ status: 'Available', assigned_battery_id: null })
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
    .insert(customer)
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
