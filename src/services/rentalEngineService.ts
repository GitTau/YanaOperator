// ─────────────────────────────────────────────────────────────────────────────
// Rental engine service — YanaOperator
// Thin, typed calls to the `rental-command` Edge Function. All rules (dues, fines,
// pause, approvals) run on the server with the shared policy engine; screens
// only display results and send requests. Money is integer paise.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// The rental-engine tables (lockdown file K) are not in database.generated.ts until K is applied and the types are
// regenerated, so the table reads below use an untyped client on purpose (same as swapRequestService).
const db = supabase as unknown as SupabaseClient;
import type { RentalStatement, PauseBlock } from '../../supabase/functions/_shared/rental-policy';

export type { RentalStatement, PauseBlock };
export { rupees } from '../../supabase/functions/_shared/rental-policy';

export interface RentalQuote {
  enrolled: boolean;
  statement: RentalStatement;
  unusedDaysRefund: { unusedDays: number; amountPaise: number };
  securityRefundable: number;
}

export interface StoreQuote {
  bookingId: string;
  enrolled: boolean;
  statement: RentalStatement | null;
  openPause: { id: string; storeId: string; inspected: boolean; startedAt: string } | null;
}

export interface PlateLookup {
  bookingId: string;
  plate: string;
  status: string;
  riderFirstName: string;
  bookingStoreId: string;
  bookingStoreName: string;
  isMyStore: boolean;
}

export class RentalCommandError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly blocks: PauseBlock[] = [],
  ) {
    super(message);
  }
}

interface CommandResult {
  ok: boolean;
  code?: string;
  message?: string;
  blocks?: PauseBlock[];
  [key: string]: unknown;
}

/** One idempotency key per user tap, so a retry never records money twice. */
export function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function command<T extends CommandResult>(action: string, bookingId: string, fields: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('rental-command', {
    body: bookingId ? { action, bookingId, ...fields } : { action, ...fields },
  });
  if (error) {
    // Non-2xx: the function returns { ok:false, code, message, blocks? } in the body.
    let detail: CommandResult | null = null;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      detail = (await ctx.json().catch(() => null)) as CommandResult | null;
    }
    throw new RentalCommandError(detail?.code ?? 'network', detail?.message ?? error.message, detail?.blocks ?? []);
  }
  if (!data) throw new RentalCommandError('empty', 'No response from server');
  if (!data.ok) {
    throw new RentalCommandError(data.code ?? 'refused', data.message ?? 'Request refused', data.blocks ?? []);
  }
  return data;
}

export const rentalEngine = {
  quote: (bookingId: string) => command<CommandResult & RentalQuote>('quote', bookingId),

  // Money
  recordCash: (bookingId: string, amountPaise: number, idempotencyKey: string, note?: string) =>
    command<CommandResult & { ledgerId: string; statement: RentalStatement }>('record_cash', bookingId, { amountPaise, idempotencyKey, note }),
  /** Supervisor "Collected" button (D-025). */
  verifyCash: (bookingId: string, ledgerId: string, note?: string) =>
    command('verify_cash', bookingId, { ledgerId, note }),
  /** Admin only (D-016). */
  waiveFine: (bookingId: string, fineId: string, reason: string) =>
    command('waive_fine', bookingId, { fineId, reason }),

  // Pause (D-013) — inspection is the Captain's daily task
  finishPauseInspection: (bookingId: string, pauseId: string, checklistId?: string) =>
    command('complete_pause_inspection', bookingId, { pauseId, checklistId }),
  resume: (bookingId: string, vehicleId: string, batteryId: string) =>
    command('resume', bookingId, { vehicleId, batteryId }),

  // Recovery (D-019, D-021)
  startRecovery: (bookingId: string, taskId: string) => command('start_recovery', bookingId, { taskId }),
  completeRecovery: (bookingId: string, taskId: string, checklistId?: string) =>
    command('complete_recovery', bookingId, { taskId, checklistId }),

  // Returns at any store (D-017, D-026)
  receiveReturn: (bookingId: string, idempotencyKey: string, checklistId?: string) =>
    command<CommandResult & { handoffId: string; needsApprovalFromBookingStore: boolean }>('receive_return', bookingId, { idempotencyKey, checklistId }),
  approveReturn: (bookingId: string, handoffId: string, approve: boolean, note?: string) =>
    command('approve_return', bookingId, { handoffId, approve, note }),

  // Refunds — Admin decides (D-025)
  decideRefund: (bookingId: string, requestId: string, approve: boolean, note?: string) =>
    command('decide_refund', bookingId, { requestId, approve, note }),
  markRefundPaid: (bookingId: string, requestId: string, payoutReference: string) =>
    command('mark_refund_paid', bookingId, { requestId, payoutReference }),

  /** Every live rental of my store with its statement, in one call (Rental Desk lists). */
  storeQuotes: (storeId?: string) =>
    command<CommandResult & { at: string; quotes: StoreQuote[] }>('store_quotes', '', storeId ? { storeId } : {}),

  /** Cross-store return: find the rental on a scooter by its number (e.g. XEM12). */
  findRentalByPlate: (plate: string) =>
    command<CommandResult & PlateLookup>('find_rental_by_plate', '', { plate }),

  /** Admin: start managing an existing rental, carrying over money already received. */
  enroll: (bookingId: string, openingPaidPaise: number, note: string) =>
    command<CommandResult & { statement: RentalStatement }>('enroll', bookingId, { openingPaidPaise, note }),
};

/** Plain-English reasons for a refused pause, for Captain and rider screens. */
export const PAUSE_BLOCK_TEXT: Record<PauseBlock, string> = {
  not_active: 'This rental is not active.',
  already_paused: 'This rental is already paused.',
  fines_started: 'Fines have started — clear dues first. Pause is not available.',
  rider_too_far: 'Rider must be at the ZAP Point (within its radius, 10 m by default).',
  scooter_too_far: 'Scooter must be within 10 m of the ZAP Point.',
  location_unknown: 'Location not available. Turn on GPS and try again.',
  gps_weak: 'GPS signal is too weak. Move to open sky and try again.',
  different_zap_points: 'Rider and scooter must be at the same ZAP Point.',
  after_cutoff: 'Pause is only available before 10 AM.',
};

// ── Captain task lists (read-only tables; RLS limits rows to the Captain's store) ──

export interface PauseInspectionTask { id: string; booking_id: string; started_at: string; store_id: string }
export interface RecoveryTask { id: string; booking_id: string; status: 'OPEN' | 'IN_PROGRESS'; triggered_at: string; immobilize_requested_at: string | null }
export interface ReturnApprovalTask { id: string; booking_id: string; receiving_store_id: string; received_at: string; receiving_store: { name: string } | null }
export interface CashEntry { id: string; booking_id: string; amount_paise: number; occurred_at: string; actor_id: string | null }

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new RentalCommandError('db_error', error.message);
  return (Array.isArray(data) ? data : []) as T[];
}

/** Daily task: pauses at my ZAP Point still waiting for inspection (D-013). */
export const listPendingPauseInspections = (storeId: string) =>
  rows<PauseInspectionTask>(db.from('rental_pauses').select('id, booking_id, started_at, store_id')
    .eq('store_id', storeId).eq('inspection_status', 'PENDING').order('started_at').limit(100));

/** Recoveries owned by my store (D-021). */
export const listRecoveryTasks = (storeId: string) =>
  rows<RecoveryTask>(db.from('recovery_tasks').select('id, booking_id, status, triggered_at, immobilize_requested_at')
    .eq('store_id', storeId).in('status', ['OPEN', 'IN_PROGRESS']).order('triggered_at').limit(100));

/** Returns received at other stores that I (booking-store Captain) must approve (D-026). */
export const listReturnsAwaitingMyApproval = (storeId: string) =>
  rows<ReturnApprovalTask>(db.from('return_handoffs')
    .select('id, booking_id, receiving_store_id, received_at, receiving_store:stores!return_handoffs_receiving_store_id_fkey(name)')
    .eq('booking_store_id', storeId).eq('approval_status', 'PENDING').order('received_at').limit(100));

/** Cash entries for a store that nobody has confirmed with "Collected" yet (D-025). */
export async function listUnverifiedCash(): Promise<(CashEntry & { store: { name: string } | null })[]> {
  // RLS decides the scope: Supervisor/Admin see every store, a Captain sees their own.
  const entries = await rows<CashEntry & { store: { name: string } | null; cash_verifications: unknown[] | null }>(db.from('rental_ledger')
    .select('id, booking_id, amount_paise, occurred_at, actor_id, store:stores(name), cash_verifications(ledger_id)')
    .eq('entry_type', 'PAYMENT').eq('method', 'CASH')
    .order('occurred_at', { ascending: false }).limit(200));
  return entries.filter((e) => !Array.isArray(e.cash_verifications) || e.cash_verifications.length === 0);
}

/** Extra staff powers granted to me (e.g. VERIFY_CASH for the Captain Supervisor). */
export async function listMyPermissions(profileId: string): Promise<string[]> {
  const perms = await rows<{ permission: string }>(db.from('staff_permissions').select('permission').eq('profile_id', profileId));
  return perms.map((p) => p.permission);
}
