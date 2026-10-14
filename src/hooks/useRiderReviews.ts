// React Query hooks for the Captain's KYC check and rider-match screens.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchKycDuplicates,
  fetchKycQueue,
  fetchLinkReviews,
  resolveLinkReview,
  reviewKyc,
  type KycDuplicate,
  type KycRider,
  type LinkReview,
  type ReviewKycInput,
} from '../services/riderReviewService';

const POLL_INTERVAL = 30_000; // same cadence as the other store-scoped lists

export const riderReviewKeys = {
  kyc: (storeId: string) => ['kyc_queue', storeId] as const,
  duplicates: (customerId: string) => ['kyc_duplicates', customerId] as const,
  links: ['link_reviews'] as const,
};

export function useKycQueue(storeId: string | null) {
  return useQuery<KycRider[]>({
    queryKey: riderReviewKeys.kyc(storeId ?? ''),
    enabled: !!storeId,
    refetchInterval: POLL_INTERVAL,
    refetchOnMount: 'always',
    queryFn: () => fetchKycQueue(storeId as string),
  });
}

export function useKycDuplicates(customerId: string | null) {
  return useQuery<KycDuplicate[]>({
    queryKey: riderReviewKeys.duplicates(customerId ?? ''),
    enabled: !!customerId,
    queryFn: () => fetchKycDuplicates(customerId as string),
  });
}

export function useReviewKyc(storeId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, ReviewKycInput>({
    mutationFn: reviewKyc,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: riderReviewKeys.kyc(storeId ?? '') });
      queryClient.invalidateQueries({ queryKey: ['customers', storeId ?? ''] });
    },
  });
}

export function useLinkReviews(enabled: boolean) {
  return useQuery<LinkReview[]>({
    queryKey: riderReviewKeys.links,
    enabled,
    refetchInterval: POLL_INTERVAL,
    refetchOnMount: 'always',
    queryFn: fetchLinkReviews,
  });
}

export function useResolveLinkReview() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { reviewId: string; customerId: string | null }>({
    mutationFn: ({ reviewId, customerId }) => resolveLinkReview(reviewId, customerId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: riderReviewKeys.links }),
  });
}
