// ─────────────────────────────────────────────────────────────────────────────
// React Query hooks — all data fetching
// All queries are store-scoped — captains only see their ZAP Point's data
// Polling: 30s refetch interval matches polling architecture in ARCHITECTURE_OPS.md
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const POLL_INTERVAL = 30_000; // 30 seconds

// ── Query Keys ────────────────────────────────────────────────────────────────
export const queryKeys = {
  stores: ['stores'] as const,
  vehicles: (storeId: string) => ['vehicles', storeId] as const,
  batteries: (storeId: string) => ['batteries', storeId] as const,
  chargers: (storeId: string) => ['chargers', storeId] as const,
  customers: (storeId: string) => ['customers', storeId] as const,
  bookings: (storeId: string) => ['bookings', storeId] as const,
  bookingsWithDetails: (storeId: string) => ['bookings', storeId, 'details'] as const,
  maintenanceJobs: (storeId: string) => ['maintenance_jobs', storeId] as const,
  globalConfig: ['global_config'] as const,
  // Appraisal / Task keys
  activeCycle: ['active_cycle'] as const,
  captainByStore: (storeId: string) => ['captain_by_store', storeId] as const,
  taskEntries: (captainId: string, date: string) => ['task_entries', captainId, date] as const,
  weeklyScores: (captainId: string, cycleId: string) => ['weekly_scores', captainId, cycleId] as const,
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
      return data ?? [];
    },
  });
}

// ── Chargers ──────────────────────────────────────────────────────────────────
export function useChargers(storeId: string | null) {
  return useQuery({
    queryKey: queryKeys.chargers(storeId ?? ''),
    enabled: !!storeId,
    refetchInterval: POLL_INTERVAL,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chargers')
        .select('*')
        .eq('store_id', storeId as string)
        .order('serial_number');
      if (error) throw new Error(error.message);
      return data ?? [];
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
      return data ?? [];
    },
  });
}

// ── Bookings with joined customer + vehicle + battery + charger ───────────────
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
          battery:batteries(*),
          charger:chargers(*)
        `)
        .eq('store_id', storeId as string)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
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

// ── Checklist Templates ───────────────────────────────────────────────────────
// Fetched once and cached aggressively. Admin changes take effect on next app
// restart (staleTime = 10 min). Filtered by flow type ('return' | 'pause').
export type ChecklistTemplateItem = {
  id: number;
  item_key: string;
  label: string;
  description: string;
  icon_name: string;
  sort_order: number;
  is_active: boolean;
  applies_to: string[];
  /** Fine in ₹ deducted from security deposit when item is DAMAGED. 0 = no fine. */
  fine_amount: number;
};

export function useChecklistTemplate(flow: 'return' | 'pause') {
  return useQuery({
    queryKey: ['checklist_templates', flow] as const,
    staleTime: 10 * 60 * 1000, // 10 min — changes rarely
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_templates')
        .select('id, item_key, label, description, icon_name, sort_order, is_active, applies_to, fine_amount')
        .eq('is_active', true)
        .contains('applies_to', [flow])
        .order('sort_order', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ChecklistTemplateItem[];
    },
  });
}

// ── Maintenance Vehicles — vehicles under Maintenance or Inactive (Dead) ──────
export function useMaintenanceVehicles(storeId: string | null) {
  return useQuery({
    queryKey: ['maintenance_vehicles', storeId ?? ''] as const,
    enabled: !!storeId,
    refetchInterval: POLL_INTERVAL,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('store_id', storeId as string)
        .in('status', ['Maintenance', 'Inactive'])
        .order('plate_number');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

// ── Parts Inventory — all parts (global catalog) ──────────────────────────────
export function usePartsInventory() {
  return useQuery({
    queryKey: ['parts_inventory'] as const,
    staleTime: 5 * 60 * 1000, // 5 min — changes rarely between repairs
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parts_inventory')
        .select('*')
        .order('part_name', { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

// ── Vehicle Latest Checklist — most recent checklist row for a vehicle ─────────
export function useVehicleLatestChecklist(vehicleId: string | null) {
  return useQuery({
    queryKey: ['vehicle_latest_checklist', vehicleId ?? ''] as const,
    enabled: !!vehicleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_checklists')
        .select('*')
        .eq('vehicle_id', vehicleId as string)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data; // null if no checklist history
    },
  });
}

// ── Open Maintenance Tickets — per store ──────────────────────────────────────
export function useOpenMaintenanceTickets(storeId: string | null) {
  return useQuery({
    queryKey: ['open_maintenance_tickets', storeId ?? ''] as const,
    enabled: !!storeId,
    refetchInterval: POLL_INTERVAL,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_jobs')
        .select('*, vehicle:vehicles(plate_number, status)')
        .eq('store_id', storeId as string)
        .neq('status', 'Closed')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
// ── EOD Helpers ───────────────────────────────────────────────────────────────

/**
 * Returns true when the current IST time is at or past 22:00 (10 PM).
 * Re-evaluated every minute so the header button glows automatically.
 */
export function useIsEodTime(): boolean {
  const [isEod, setIsEod] = React.useState(() => {
    const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    return nowIst.getUTCHours() >= 22;
  });

  React.useEffect(() => {
    const check = () => {
      const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      setIsEod(nowIst.getUTCHours() >= 22);
    };
    const id = setInterval(check, 60_000); // check every minute
    return () => clearInterval(id);
  }, []);

  return isEod;
}

// ── EOD Report types (computed client-side from cached query data) ─────────────

export interface EodActiveRental {
  bookingId: string;
  riderName: string;
  vehicleNumber: string;
  rentalPlan: string;
  startDate: string | null;
  endDate: string | null;
  daysRemaining: number | null;
  totalRentCollected: number;
  cashCollected: number;
  onlineCollected: number;
  pendingAmount: number;
  pendingDueDate: string | null;
  status: string;
}

export interface EodKpis {
  totalActiveRentals: number;
  totalRevenueCollectedToday: number;
  totalRenewalsToday: number;
  totalNewBookingsToday: number;
  totalCashReceivedToday: number;
  totalRidersOnPause: number;
  totalIdleScooters: number;
  totalUnderMaintenanceToday: number;
  totalReturnsToday: number;
}

// ── Appraisal / Task Types ────────────────────────────────────────────────────

export interface AppraisalCycle {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string | null;
}

export interface TaskEntry {
  id: string;
  captain_id: string;
  cycle_id: string | null;
  week_number: number;
  date: string;
  task_type: 'regular' | 'non_regular' | 'emergency';
  task_name: string;
  status: 'pending' | 'done';
  stars: number | null;
  rated_by: string | null;
  remarks: string | null;
  is_override_zero: boolean;
  override_reason: string | null;
  operator_remarks: string | null;
  is_recurring: boolean;
  created_at: string | null;
}

export interface WeeklyScore {
  id: string;
  captain_id: string;
  cycle_id: string;
  week_number: number;
  avg_stars_regular: number;
  avg_stars_non_regular: number;
  avg_stars_emergency: number;
  overall_avg: number;
  performance_group: 'E' | 'M' | 'A';
  bonus_eligibility: number;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string | null;
}

// ── Appraisal / Task Hooks ────────────────────────────────────────────────────

/** Fetches the single active appraisal cycle. Cached 5 min — changes rarely. */
export function useActiveCycle() {
  return useQuery<AppraisalCycle | null>({
    queryKey: queryKeys.activeCycle,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appraisal_cycles')
        .select('*')
        .eq('status', 'active')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as AppraisalCycle) ?? null;
    },
  });
}

/** Fetches the captain record for the currently selected store. */
export function useCaptainByStore(storeId: string | null) {
  return useQuery<{ id: string; name: string; store_id: string; zap_point: string | null; push_token: string | null } | null>({
    queryKey: queryKeys.captainByStore(storeId ?? ''),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!storeId) return null;
      const { data, error } = await supabase
        .from('captains')
        .select('id, name, store_id, zap_point, push_token')
        .eq('store_id', storeId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
  });
}

/** Fetches task entries for a captain — all pending + recent done (last 30 days). Polled every 30s. */
export function useMyTaskEntries(captainId: string | null, _date?: string) {
  return useQuery<TaskEntry[]>({
    queryKey: queryKeys.taskEntries(captainId ?? '', 'all'),
    enabled: !!captainId,
    refetchInterval: POLL_INTERVAL,
    queryFn: async () => {
      if (!captainId) return [];

      // Fetch all pending tasks (any date) + done tasks from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('task_entries')
        .select('*')
        .eq('captain_id', captainId)
        .or(`status.eq.pending,and(status.eq.done,date.gte.${cutoff})`)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data as TaskEntry[]) ?? [];
    },
  });
}

/** Fetches weekly scores for a captain within a cycle. */
export function useMyWeeklyScores(captainId: string | null, cycleId: string | null) {
  return useQuery<WeeklyScore[]>({
    queryKey: queryKeys.weeklyScores(captainId ?? '', cycleId ?? ''),
    enabled: !!captainId && !!cycleId,
    refetchInterval: POLL_INTERVAL,
    queryFn: async () => {
      if (!captainId || !cycleId) return [];
      const { data, error } = await supabase
        .from('weekly_scores')
        .select('*')
        .eq('captain_id', captainId)
        .eq('cycle_id', cycleId)
        .order('week_number', { ascending: true });
      if (error) throw new Error(error.message);
      return (data as WeeklyScore[]) ?? [];
    },
  });
}

// ── Notification Types & Hooks ────────────────────────────────────────────────
export interface NotificationItem {
  id: string;
  captain_id: string | null;
  store_id: string | null;
  title: string;
  body: string;
  type: string;
  data: any;
  is_read: boolean;
  created_at: string;
}

/** Fetches notifications for a store/captain. Polled every 30s. */
export function useMyNotifications(storeId: string | null, captainId: string | null) {
  return useQuery<NotificationItem[]>({
    queryKey: ['notifications', storeId ?? '', captainId ?? ''],
    enabled: true,
    refetchInterval: POLL_INTERVAL,
    queryFn: async () => {
      const filters: string[] = ['captain_id.is.null', 'store_id.is.null'];
      if (captainId) filters.push(`captain_id.eq.${captainId}`);
      if (storeId) filters.push(`store_id.eq.${storeId}`);

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .or(filters.join(','))
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw new Error(error.message);
      return (data as NotificationItem[]) ?? [];
    },
  });
}
