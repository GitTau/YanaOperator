// ─────────────────────────────────────────────────────────────────────────────
// Rider swap requests — Captain side.
// A rider asks for a battery/vehicle swap (Rider app → request_asset_swap RPC); the Captain of
// the booking's hub approves or rejects here (decide_swap_request RPC). The RPC re-checks the
// Captain's role and hub, so this client never decides anything on its own.
//
// swap_requests and these RPCs are not in database.generated.ts yet (they ship with the
// lockdown SQL "I"). Until the types are regenerated after that goes live, this file uses an
// untyped client on purpose; switch to `supabase` once the types include them.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const db = supabase as unknown as SupabaseClient;

export type SwapKind = 'battery' | 'vehicle';
export type SwapRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface SwapRequest {
  id: string;
  booking_id: string;
  kind: SwapKind;
  status: SwapRequestStatus;
  reason: string | null;
  has_issue: boolean;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
  riderName: string;
  riderPhone: string | null;
  /** Serial (battery) or plate (vehicle) the rider has now. */
  currentLabel: string | null;
  /** Serial (battery) or plate (vehicle) the rider asked for. */
  requestedLabel: string | null;
}

export interface DecideSwapResult {
  status: 'Approved' | 'Rejected';
  /** Booking status after approval. 'Paused' means the rental was under-paid and got auto-paused. */
  booking_status?: string;
}

type RawRow = {
  id: string;
  booking_id: string;
  kind: SwapKind;
  status: SwapRequestStatus;
  reason: string | null;
  has_issue: boolean;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
  customer: { name: string | null; phone: string | null } | null;
  booking: {
    vehicle: { plate_number: string | null } | null;
    battery: { serial_number: string | null } | null;
  } | null;
  new_battery: { serial_number: string | null } | null;
  new_vehicle: { plate_number: string | null } | null;
};

const SELECT = `
  id, booking_id, kind, status, reason, has_issue, decision_note, created_at, decided_at,
  customer:customers(name, phone),
  booking:bookings(vehicle:vehicles(plate_number), battery:batteries(serial_number)),
  new_battery:batteries!swap_requests_new_battery_id_fkey(serial_number),
  new_vehicle:vehicles!swap_requests_new_vehicle_id_fkey(plate_number)
`;

/** Requests for one hub, newest first. Row-level security limits an Operator to their own hub. */
export async function fetchSwapRequests(storeId: string): Promise<SwapRequest[]> {
  const { data, error } = await db
    .from('swap_requests')
    .select(SELECT)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as RawRow[]).map((r) => ({
    id: r.id,
    booking_id: r.booking_id,
    kind: r.kind,
    status: r.status,
    reason: r.reason,
    has_issue: r.has_issue,
    decision_note: r.decision_note,
    created_at: r.created_at,
    decided_at: r.decided_at,
    riderName: r.customer?.name ?? 'Rider',
    riderPhone: r.customer?.phone ?? null,
    currentLabel:
      r.kind === 'battery'
        ? r.booking?.battery?.serial_number ?? null
        : r.booking?.vehicle?.plate_number ?? null,
    requestedLabel:
      r.kind === 'battery'
        ? r.new_battery?.serial_number ?? null
        : r.new_vehicle?.plate_number ?? null,
  }));
}

/** Approve or reject. Throws with the server's plain-English reason when it refuses. */
export async function decideSwapRequest(
  requestId: string,
  approve: boolean,
  note?: string | null,
): Promise<DecideSwapResult> {
  const { data, error } = await db.rpc('decide_swap_request', {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  return data as DecideSwapResult;
}
