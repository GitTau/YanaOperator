// ─────────────────────────────────────────────────────────────────────────────
// React Query hooks — Rental engine (Rental Desk screen)
// Reads go to read-only tables / the quote command; every change goes through
// `rental-command`. After any change, all rental-engine queries refresh.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import {
  listMyPermissions,
  listPendingPauseInspections,
  listRecoveryTasks,
  listReturnsAwaitingMyApproval,
  listUnverifiedCash,
  rentalEngine,
  RentalCommandError,
} from '../services/rentalEngineService';
import { queryKeys } from './useQueries';

const POLL_INTERVAL = 30_000;

export const rentalKeys = {
  all: ['rental_engine'] as const,
  quote: (bookingId: string) => ['rental_engine', 'quote', bookingId] as const,
  inspections: (storeId: string) => ['rental_engine', 'inspections', storeId] as const,
  recoveries: (storeId: string) => ['rental_engine', 'recoveries', storeId] as const,
  returns: (storeId: string) => ['rental_engine', 'returns', storeId] as const,
  cash: ['rental_engine', 'cash'] as const,
  storeQuotes: (storeId: string) => ['rental_engine', 'store_quotes', storeId] as const,
  permissions: (profileId: string) => ['rental_engine', 'permissions', profileId] as const,
};

export function useRentalQuote(bookingId: string | null) {
  return useQuery({
    queryKey: rentalKeys.quote(bookingId ?? ''),
    enabled: !!bookingId,
    refetchInterval: POLL_INTERVAL,
    retry: false,
    queryFn: () => rentalEngine.quote(bookingId as string),
  });
}

/** All live rentals of the store with their statements, in one server call. */
export function useStoreQuotes(storeId: string | null) {
  return useQuery({
    queryKey: rentalKeys.storeQuotes(storeId ?? ''),
    enabled: !!storeId,
    refetchInterval: POLL_INTERVAL,
    retry: false,
    queryFn: async () => {
      const res = await rentalEngine.storeQuotes();
      return new Map(res.quotes.map((q) => [q.bookingId, q]));
    },
  });
}

export function usePendingPauseInspections(storeId: string | null) {
  return useQuery({
    queryKey: rentalKeys.inspections(storeId ?? ''),
    enabled: !!storeId,
    refetchInterval: POLL_INTERVAL,
    queryFn: () => listPendingPauseInspections(storeId as string),
  });
}

export function useRecoveryTasks(storeId: string | null) {
  return useQuery({
    queryKey: rentalKeys.recoveries(storeId ?? ''),
    enabled: !!storeId,
    refetchInterval: POLL_INTERVAL,
    queryFn: () => listRecoveryTasks(storeId as string),
  });
}

export function useReturnsAwaitingApproval(storeId: string | null) {
  return useQuery({
    queryKey: rentalKeys.returns(storeId ?? ''),
    enabled: !!storeId,
    refetchInterval: POLL_INTERVAL,
    queryFn: () => listReturnsAwaitingMyApproval(storeId as string),
  });
}

export function useUnverifiedCash(enabled: boolean) {
  return useQuery({
    queryKey: rentalKeys.cash,
    enabled,
    refetchInterval: POLL_INTERVAL,
    queryFn: () => listUnverifiedCash(),
  });
}

export function useMyStaffPermissions(profileId: string | null) {
  return useQuery({
    queryKey: rentalKeys.permissions(profileId ?? ''),
    enabled: !!profileId,
    staleTime: 5 * 60_000,
    queryFn: () => listMyPermissions(profileId as string),
  });
}

/**
 * Runs one rental command with a busy flag and a readable error, then refreshes
 * rental-engine data and the store's bookings (status may have changed).
 */
export function useRentalAction(storeId: string | null) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<RentalCommandError | null>(null);

  const run = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T | null> => {
      setBusy(label);
      setError(null);
      try {
        const result = await fn();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: rentalKeys.all }),
          storeId ? queryClient.invalidateQueries({ queryKey: queryKeys.bookingsWithDetails(storeId) }) : Promise.resolve(),
          storeId ? queryClient.invalidateQueries({ queryKey: queryKeys.vehicles(storeId) }) : Promise.resolve(),
          storeId ? queryClient.invalidateQueries({ queryKey: queryKeys.batteries(storeId) }) : Promise.resolve(),
        ]);
        return result;
      } catch (e) {
        setError(e instanceof RentalCommandError ? e : new RentalCommandError('unknown', e instanceof Error ? e.message : 'Something went wrong'));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [queryClient, storeId],
  );

  return { run, busy, error, clearError: () => setError(null) };
}

/** Turns server error codes into Captain-friendly text. */
export function rentalErrorText(e: RentalCommandError | Error | null): string | null {
  if (!e) return null;
  const code = e instanceof RentalCommandError ? e.code : '';
  if (code === 'not_enrolled') return 'This rental is not on the new rental system yet. Ask Admin to add it.';
  if (code === 'network' || code === 'empty') return 'Could not reach the server. Check internet and try again.';
  if (code === 'forbidden') return 'You are not allowed to do this for this rental.';
  return e.message;
}
