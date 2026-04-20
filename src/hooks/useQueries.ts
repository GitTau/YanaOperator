// ─────────────────────────────────────────────────────────────────────────────
// React Query hooks — all data fetching
// All queries are store-scoped — captains only see their ZAP Point's data
// Polling: 30s refetch interval matches polling architecture in ARCHITECTURE_OPS.md
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const POLL_INTERVAL = 30_000; // 30 seconds

// ── Query Keys ────────────────────────────────────────────────────────────────
export const queryKeys = {
  stores: ['stores'] as const,
  vehicles: (storeId: string) => ['vehicles', storeId] as const,
  batteries: (storeId: string) => ['batteries', storeId] as const,
  customers: (storeId: string) => ['customers', storeId] as const,
  bookings: (storeId: string) => ['bookings', storeId] as const,
  bookingsWithDetails: (storeId: string) => ['bookings', storeId, 'details'] as const,
  maintenanceJobs: (storeId: string) => ['maintenance_jobs', storeId] as const,
  globalConfig: ['global_config'] as const,
};

// ── Stores (ZAP Points) ───────────────────────────────────────────────────────
export function useStores() {
  return useQuery({
    queryKey: queryKeys.stores,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

// ── Vehicles ─────────────────────────────────────────────────────────────────
export function useVehicles(storeId: string | null) {
  return useQuery({
    queryKey: queryKeys.vehicles(storeId ?? ''),
    enabled: !!storeId,
    refetchInterval: POLL_INTERVAL,
    queryFn: async () => {
      if (!storeId) return [];
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('store_id', storeId)
        .order('plate_number');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

// ── Batteries ─────────────────────────────────────────────────────────────────
export function useBatteries(storeId: string | null) {
  return useQuery({
    queryKey: queryKeys.batteries(storeId ?? ''),
    enabled: !!storeId,
    refetchInterval: POLL_INTERVAL,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batteries')
        .select('*')
        .eq('store_id', storeId as string)
        .order('serial_number');
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

// ── Customers (Riders) ────────────────────────────────────────────────────────
export function useCustomers(storeId: string | null) {
  return useQuery({
    queryKey: queryKeys.customers(storeId ?? ''),
    enabled: !!storeId,
    refetchInterval: POLL_INTERVAL,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('store_id', storeId as string)
        .order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

// ── Bookings with joined customer + vehicle + battery ─────────────────────────
export function useBookings(storeId: string | null) {
  return useQuery({
    queryKey: queryKeys.bookingsWithDetails(storeId ?? ''),
    enabled: !!storeId,
    refetchInterval: POLL_INTERVAL,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:customers(*),
          vehicle:vehicles(*),
          battery:batteries(*)
        `)
        .eq('store_id', storeId as string)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

// ── Maintenance Jobs ──────────────────────────────────────────────────────────
export function useMaintenanceJobs(storeId: string | null) {
  return useQuery({
    queryKey: queryKeys.maintenanceJobs(storeId ?? ''),
    enabled: !!storeId,
    refetchInterval: POLL_INTERVAL,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_jobs')
        .select('*, vehicle:vehicles(plate_number, status)')
        .eq('store_id', storeId as string)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

// ── Global Config (singleton, cached until manually invalidated) ──────────────
export function useGlobalConfig() {
  return useQuery({
    queryKey: queryKeys.globalConfig,
    staleTime: 5 * 60 * 1000, // config changes rarely — cache 5 min
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_config')
        .select('*')
        .eq('id', 1)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}
