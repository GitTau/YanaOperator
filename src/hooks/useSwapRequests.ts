// React Query hooks for rider swap requests (Captain side).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  decideSwapRequest,
  fetchSwapRequests,
  type DecideSwapResult,
  type SwapRequest,
} from '../services/swapRequestService';

const POLL_INTERVAL = 30_000; // same cadence as the other store-scoped lists

export const swapRequestKeys = {
  list: (storeId: string) => ['swap_requests', storeId] as const,
};

export function useSwapRequests(storeId: string | null) {
  return useQuery<SwapRequest[]>({
    queryKey: swapRequestKeys.list(storeId ?? ''),
    enabled: !!storeId,
    refetchInterval: POLL_INTERVAL,
    refetchOnMount: 'always',
    queryFn: () => fetchSwapRequests(storeId as string),
  });
}

/** Approve/reject, then refresh everything an approval can change (the swap moves assets). */
export function useDecideSwapRequest(storeId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<DecideSwapResult, Error, { requestId: string; approve: boolean; note?: string | null }>({
    mutationFn: ({ requestId, approve, note }) => decideSwapRequest(requestId, approve, note),
    onSettled: () => {
      const id = storeId ?? '';
      queryClient.invalidateQueries({ queryKey: swapRequestKeys.list(id) });
      queryClient.invalidateQueries({ queryKey: ['bookings', id] });
      queryClient.invalidateQueries({ queryKey: ['vehicles', id] });
      queryClient.invalidateQueries({ queryKey: ['batteries', id] });
    },
  });
}
