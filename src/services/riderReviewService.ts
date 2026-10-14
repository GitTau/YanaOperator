// ─────────────────────────────────────────────────────────────────────────────
// Rider reviews — Captain side: KYC check and rider-match.
// Both are decided by the server (lockdown file L: review_customer_kyc, kyc_duplicates,
// list_pending_link_reviews; resolve_customer_link_review is live). This file only asks and shows;
// the database re-checks role, hub and the one-Aadhaar-one-rider rule (D-018).
//
// These RPCs and kyc_reviews are not in database.generated.ts until L is applied and the types are
// regenerated, so this file uses an untyped client on purpose (same as swapRequestService).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const db = supabase as unknown as SupabaseClient;

// ── KYC ─────────────────────────────────────────────────────────────────────

export interface KycRider {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  aadhar_no: string | null;
  pan_no: string | null;
  emergency_contact_1: string | null;
  created_at: string;
  /** Latest rejection, if the rider was turned down before. */
  rejection: { reason: string | null; reviewed_at: string } | null;
}

export interface KycDuplicate {
  customer_id: string;
  name: string | null;
  store_name: string | null;
  has_open_rental: boolean;
}

export const DUPLICATE_AADHAAR_CODE = 'DUPLICATE_AADHAAR';

/** Riders of this hub whose KYC is not verified yet, newest first, with any earlier rejection. */
export async function fetchKycQueue(storeId: string): Promise<KycRider[]> {
  const { data, error } = await db
    .from('customers')
    .select('id, name, phone, address, aadhar_no, pan_no, emergency_contact_1, created_at')
    .eq('store_id', storeId)
    .eq('kyc_status', false)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const riders = (data ?? []) as Omit<KycRider, 'rejection'>[];
  if (riders.length === 0) return [];

  // kyc_reviews does not exist before lockdown file L: treat that as "no rejections yet".
  const rejections = new Map<string, { reason: string | null; reviewed_at: string }>();
  const reviews = await db
    .from('kyc_reviews')
    .select('customer_id, decision, reason, reviewed_at')
    .in('customer_id', riders.map((r) => r.id))
    .order('reviewed_at', { ascending: false });
  if (!reviews.error) {
    const seen = new Set<string>();
    for (const row of (reviews.data ?? []) as { customer_id: string; decision: string; reason: string | null; reviewed_at: string }[]) {
      if (seen.has(row.customer_id)) continue; // newest decision wins
      seen.add(row.customer_id);
      if (row.decision === 'REJECTED') rejections.set(row.customer_id, { reason: row.reason, reviewed_at: row.reviewed_at });
    }
  }
  return riders.map((r) => ({ ...r, rejection: rejections.get(r.id) ?? null }));
}

export async function fetchKycDuplicates(customerId: string): Promise<KycDuplicate[]> {
  const { data, error } = await db.rpc('kyc_duplicates', { p_customer_id: customerId });
  if (error) throw new Error(error.message);
  return (data ?? []) as KycDuplicate[];
}

export interface ReviewKycInput {
  customerId: string;
  approve: boolean;
  /** Required by the server when rejecting; the rider sees it. */
  note?: string | null;
  /** Admin only: approve an Aadhaar number another rider also uses. */
  overrideReason?: string | null;
}

export async function reviewKyc({ customerId, approve, note, overrideReason }: ReviewKycInput): Promise<void> {
  const { error } = await db.rpc('review_customer_kyc', {
    p_customer_id: customerId,
    p_approve: approve,
    p_note: note ?? null,
    p_override_reason: overrideReason ?? null,
  });
  if (error) throw new Error(error.message);
}

/** 123456789012 → "1234 5678 9012" for the Captain comparing the card in hand. */
export function formatAadhaar(raw: string | null): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length === 12 ? digits.replace(/(\d{4})(?=\d)/g, '$1 ') : (raw ?? '—');
}

// ── Rider match ─────────────────────────────────────────────────────────────

export interface LinkCandidate {
  customer_id: string;
  name: string | null;
  store_name: string | null;
  since: string;
  has_open_rental: boolean;
}

export interface LinkReview {
  review_id: string;
  /** The phone number the rider verified with the OTP. */
  phone: string;
  reason: string | null;
  created_at: string;
  candidates: LinkCandidate[];
}

export async function fetchLinkReviews(): Promise<LinkReview[]> {
  const { data, error } = await db.rpc('list_pending_link_reviews');
  if (error) throw new Error(error.message);
  return (data ?? []) as LinkReview[];
}

/** customerId = null rejects the review ("none of these"); the rider stays unlinked. */
export async function resolveLinkReview(reviewId: string, customerId: string | null): Promise<void> {
  const { error } = await db.rpc('resolve_customer_link_review', { p_review_id: reviewId, p_customer_id: customerId });
  if (error) throw new Error(error.message);
}
