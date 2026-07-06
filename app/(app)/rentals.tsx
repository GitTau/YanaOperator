// ─────────────────────────────────────────────────────────────────────────────
// Rentals Screen — Rental Center
// DESIGN_OPS.md §6.4: search, filter chips, book ride CTA, rental cards
// AGENTS.md: checklist MANDATORY before return/pause (business rule)
// Master History: all ride statuses when MASTER HISTORY tab selected
// ─────────────────────────────────────────────────────────────────────────────

import { useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  LayoutAnimation,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { RentalCard } from '../../src/components/RentalCard';
import { BookRideModal } from '../../src/components/modals/BookRideModal';
import { PaymentModal } from '../../src/components/modals/PaymentModal';
import { ChecklistModal } from '../../src/components/modals/ChecklistModal';
import { PauseModal, ReturnModal, SwapModal } from '../../src/components/modals/OpsModals';
import { RenewModal } from '../../src/components/modals/RenewModal';
import { EmptyState, ErrorBanner, SearchBar, SkeletonCard } from '../../src/components/ui';
import { useBatteries, useBookings, useCustomers, useGlobalConfig, useVehicles, queryKeys } from '../../src/hooks/useQueries';
import { useAuthStore } from '../../src/stores/authStore';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import { dispatchBooking } from '../../src/services/bookingService';
import type { BookingStatus, BookingWithDetails } from '../../src/lib/database.types';

type FilterStatus = 'All' | BookingStatus;
type BoardView = 'LIVE BOARD' | 'MASTER HISTORY';

// ── Status filter configs per board ──────────────────────────────────────────

const LIVE_FILTERS: FilterStatus[] = ['All', 'Draft', 'Active', 'Paused'];
const HISTORY_FILTERS: FilterStatus[] = ['All', 'Active', 'Paused', 'Completed', 'Cancelled'];

const STATUS_COLORS: Partial<Record<FilterStatus, { active: string; bg: string }>> = {
  Active:    { active: Colors.statusActive,  bg: '#F0FDF4' },
  Draft:     { active: Colors.textSecondary, bg: '#F3F4F6' },
  Paused:    { active: Colors.statusWarning, bg: '#FFFBEB' },
  Completed: { active: Colors.blueText,      bg: '#EFF6FF' },
  Cancelled: { active: Colors.textMuted,     bg: '#F9FAFB' },
};

// ── History summary card ─────────────────────────────────────────────────────

function HistorySummaryCard({ bookings }: { bookings: BookingWithDetails[] }) {
  const counts = {
    Active:    0,
    Paused:    0,
    Completed: 0,
    Cancelled: 0,
  };

  bookings.forEach((b) => {
    if (b.status === 'Active') counts.Active++;
    else if (b.status === 'Paused') counts.Paused++;
    else if (b.status === 'Completed') counts.Completed++;
    else if (b.status === 'Cancelled') counts.Cancelled++;
  });

  return (
    <View style={summaryStyles.card}>
      <Text style={summaryStyles.title}>Fleet Lifecycle Overview</Text>
      <View style={summaryStyles.grid}>
        {Object.entries(counts).map(([status, count]) => {
          const cfg = STATUS_COLORS[status as FilterStatus] ?? { active: Colors.textMuted, bg: Colors.bgApp };
          return (
            <View key={status} style={[summaryStyles.tile, { backgroundColor: cfg.bg }]}>
              <Text style={[summaryStyles.tileCount, { color: cfg.active }]}>{count}</Text>
              <Text style={[summaryStyles.tileLabel, { color: cfg.active }]}>{status.toUpperCase()}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
    marginBottom: 12,
    shadowColor: '#B0BAD0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 1,
  },
  title: { ...Typography.labelCaps, color: Colors.textSecondary, marginBottom: 10 },
  grid:  { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: 'transparent',
  },
  tileCount: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  tileLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function RentalsScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const { user } = useAuthStore();
  const storeId   = selectedStore?.store_id ?? null;
  const operatorId = user?.id ?? '';
  const queryClient = useQueryClient();

  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('All');
  const [boardView, setBoardView]       = useState<BoardView>('LIVE BOARD');
  const [showBookRide, setShowBookRide] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<BookingWithDetails | null>(null);
  const [pauseTarget, setPauseTarget]     = useState<BookingWithDetails | null>(null);
  const [returnTarget, setReturnTarget]   = useState<BookingWithDetails | null>(null);
  const [swapTarget, setSwapTarget]       = useState<BookingWithDetails | null>(null);
  const [renewTarget, setRenewTarget]     = useState<BookingWithDetails | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Checklist gate state ─────────────────────────────────────────────────
  // Checklist must be completed before pause/return can proceed
  const [checklistBooking, setChecklistBooking] = useState<BookingWithDetails | null>(null);
  const [checklistType, setChecklistType]       = useState<'return' | 'pause'>('return');
  const [showChecklist, setShowChecklist]       = useState(false);
  // Damage fines from checklist — forwarded to ReturnModal for deposit calc
  const [checklistFines, setChecklistFines]     = useState(0);
  const [checklistHasIssues, setChecklistHasIssues] = useState(false);

  const { data: bookings, isLoading, error, refetch } = useBookings(storeId);
  const { data: customers }   = useCustomers(storeId);
  const { data: vehicles }    = useVehicles(storeId);
  const { data: batteries }   = useBatteries(storeId);
  const { data: globalConfig } = useGlobalConfig();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.bookingsWithDetails(storeId ?? '') });
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles(storeId ?? '') });
    queryClient.invalidateQueries({ queryKey: queryKeys.batteries(storeId ?? '') });
  };

  // ── Filter logic ─────────────────────────────────────────────────────────
  const currentFilters = boardView === 'LIVE BOARD' ? LIVE_FILTERS : HISTORY_FILTERS;

  const filtered = useMemo(() => {
    if (!bookings) return [];
    const raw = bookings as BookingWithDetails[];

    // Board view filter
    const board = boardView === 'LIVE BOARD'
      ? raw.filter(b => ['Draft', 'Active', 'Paused'].includes(b.status))
      : raw; // Master History = all statuses

    // Status chip filter
    const byStatus = statusFilter === 'All' ? board : board.filter(b => b.status === statusFilter);

    // Search filter
    const q = search.toLowerCase().trim();
    if (!q) return byStatus;
    return byStatus.filter(b =>
      b.customer.name.toLowerCase().includes(q) ||
      b.customer.phone.includes(q) ||
      (b.vehicle?.plate_number ?? '').toLowerCase().includes(q) ||
      (b.battery?.serial_number ?? '').toLowerCase().includes(q)
    );
  }, [bookings, statusFilter, search, boardView]);

  // ── Action handlers ───────────────────────────────────────────────────────

  const handleDispatch = async (booking: BookingWithDetails) => {
    setActionLoading(booking.id);
    try {
      await dispatchBooking(booking.id, booking.vehicle_id, booking.battery_id);
      invalidate();
    } catch (e) {
      console.error('[Rentals] dispatch failed:', e);
    } finally {
      setActionLoading(null);
    }
  };

  // Resume a paused booking — re-activates without another checklist
  const handleResume = async (booking: BookingWithDetails) => {
    setActionLoading(booking.id);
    try {
      await dispatchBooking(booking.id, booking.vehicle_id, booking.battery_id);
      invalidate();
    } catch (e) {
      console.error('[Rentals] resume failed:', e);
    } finally {
      setActionLoading(null);
    }
  };

  // Pause directly opens PauseModal (checklist is only for return/renew)
  const handlePauseRequest = (booking: BookingWithDetails) => {
    setPauseTarget(booking);
  };

  // Return requires checklist first (AGENTS.md business rule)
  const handleReturnRequest = (booking: BookingWithDetails) => {
    setChecklistBooking(booking);
    setChecklistType('return');
    setShowChecklist(true);
  };

  // Checklist completed → proceed to actual pause/return modal
  // totalDamageFines flows from ChecklistModal → ReturnModal for deposit deduction display
  const handleChecklistComplete = (hasIssues: boolean, totalDamageFines: number) => {
    setShowChecklist(false);
    setChecklistFines(totalDamageFines);
    setChecklistHasIssues(hasIssues);
    if (checklistType === 'pause') {
      setPauseTarget(checklistBooking);
    } else {
      setReturnTarget(checklistBooking);
    }
    setChecklistBooking(null);
  };

  const allBookings = (bookings ?? []) as BookingWithDetails[];

  const busyCustomerIds = useMemo(() => {
    const ids = new Set<string>();
    allBookings.forEach(b => {
      if (b.status === 'Draft' || b.status === 'Active' || b.status === 'Paused') {
        ids.add(b.customer_id);
      }
    });
    return ids;
  }, [allBookings]);

  const busyVehicleIds = useMemo(() => {
    const ids = new Set<string>();
    allBookings.forEach(b => {
      if (b.status === 'Draft' || b.status === 'Active' || b.status === 'Paused') {
        ids.add(b.vehicle_id);
      }
    });
    return ids;
  }, [allBookings]);

  const busyBatteryIds = useMemo(() => {
    const ids = new Set<string>();
    allBookings.forEach(b => {
      if (b.status === 'Draft' || b.status === 'Active' || b.status === 'Paused') {
        ids.add(b.battery_id);
      }
    });
    return ids;
  }, [allBookings]);

  const availableVehicles = useMemo(() => {
    return (vehicles ?? []).filter(v => v.status === 'Available' && !busyVehicleIds.has(v.id));
  }, [vehicles, busyVehicleIds]);

  const availableBatteries = useMemo(() => {
    return (batteries ?? []).filter(b => b.status === 'Available' && !busyBatteryIds.has(b.id));
  }, [batteries, busyBatteryIds]);

  // Switch board view — reset status chip to All
  const handleBoardSwitch = (view: BoardView) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBoardView(view);
    setStatusFilter('All');
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Fixed top section */}
      <View style={styles.topSection}>
        {/* Screen title */}
        <View style={styles.titleRow}>
          <View>
            <Text style={[Typography.overline, { color: Colors.textSecondary }]}>
              FLEET DISPATCHER & LIFECYCLE TRACKER
            </Text>
            <Text style={[Typography.h1Screen, { color: Colors.textPrimary, marginTop: 2 }]}>Rental Center</Text>
          </View>
        </View>

        {/* Book Ride — full-width cyan pill */}
        <Pressable
          style={({ pressed }) => [
            styles.bookBtn,
            {
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
          ]}
          onPress={() => setShowBookRide(true)}
          accessibilityRole="button"
          accessibilityLabel="Book a new ride"
        >
          <Ionicons name="add-circle-outline" size={18} color={Colors.brandNavy} style={{ marginRight: 6 }} />
          <Text style={styles.bookBtnText}>Book Ride</Text>
        </Pressable>

        {/* Search */}
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, plate, phone, battery..."
          style={{ marginBottom: Spacing.sm }}
        />

        {/* Board toggle */}
        <View style={styles.boardToggle}>
          {(['LIVE BOARD', 'MASTER HISTORY'] as BoardView[]).map(v => (
            <Pressable
              key={v}
              style={({ pressed }) => [
                styles.boardBtn,
                boardView === v && styles.boardBtnActive,
                { transform: [{ scale: pressed ? 0.96 : 1 }] },
              ]}
              onPress={() => handleBoardSwitch(v)}
            >
              <Ionicons
                name={v === 'LIVE BOARD' ? 'radio-outline' : 'time-outline'}
                size={13}
                color={boardView === v ? Colors.brandTeal : Colors.textSecondary}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.boardBtnText, boardView === v && styles.boardBtnTextActive]}>{v}</Text>
            </Pressable>
          ))}
        </View>

        {/* Status filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}
        >
          {currentFilters.map(f => {
            const cfg = f !== 'All' ? STATUS_COLORS[f] : null;
            const isActive = statusFilter === f;
            return (
              <Pressable
                key={f}
                style={({ pressed }) => [
                  styles.chip,
                  isActive && (cfg ? { backgroundColor: cfg.bg, borderColor: cfg.active } : styles.chipActiveDefault),
                  { transform: [{ scale: pressed ? 0.95 : 1 }] },
                ]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setStatusFilter(f);
                }}
              >
                {f !== 'All' && cfg && isActive && (
                  <View style={[styles.chipDot, { backgroundColor: cfg.active }]} />
                )}
                <Text style={[
                  styles.chipText,
                  isActive && (cfg ? { color: cfg.active, fontWeight: '700' } : styles.chipTextActiveDefault),
                ]}>
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {error && <ErrorBanner message="Failed to load rentals" onRetry={refetch} />}

      {/* Rental cards list */}
      {isLoading ? (
        <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: 12 }}>
          {[1, 2, 3].map(k => <SkeletonCard key={k} height={240} />)}
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={invalidate} tintColor={Colors.brandTeal} />}
          ListHeaderComponent={
            boardView === 'MASTER HISTORY' && allBookings.length > 0 ? (
              <HistorySummaryCard bookings={allBookings} />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              message={
                boardView === 'MASTER HISTORY'
                  ? (search ? 'No results for that search.' : 'No ride history yet.')
                  : (search ? 'No results for that search.' : 'No active bookings.')
              }
              sub={
                boardView === 'LIVE BOARD' && !search
                  ? 'Tap + BOOK RIDE to get started.'
                  : undefined
              }
            />
          }
          renderItem={({ item }) => (
            <RentalCard
              booking={item}
              onDispatch={handleDispatch}
              onCollectCash={setPaymentTarget}
              onPause={handlePauseRequest}
              onResume={handleResume}
              onReturn={handleReturnRequest}
              onSwap={setSwapTarget}
              onRenew={setRenewTarget}
            />
          )}
        />
      )}

      {/* ── Modals ─────────────────────────────────────────────────────── */}

      {/* Checklist — gates Return/Pause */}
      <ChecklistModal
        visible={showChecklist}
        booking={checklistBooking}
        checklistType={checklistType}
        onClose={() => { setShowChecklist(false); setChecklistBooking(null); }}
        onComplete={handleChecklistComplete}
      />

      <BookRideModal
        visible={showBookRide}
        onClose={() => setShowBookRide(false)}
        onSuccess={invalidate}
        storeId={storeId ?? ''}
        operatorId={operatorId}
        customers={customers ?? []}
        busyCustomerIds={busyCustomerIds}
        vehicles={availableVehicles}
        batteries={availableBatteries}
        globalConfig={globalConfig ?? null}
      />
      <PaymentModal
        visible={!!paymentTarget}
        booking={paymentTarget}
        onClose={() => setPaymentTarget(null)}
        onSuccess={invalidate}
        storeId={storeId ?? ''}
        operatorId={operatorId}
      />
      <PauseModal
        visible={!!pauseTarget}
        booking={pauseTarget}
        onClose={() => { setPauseTarget(null); setChecklistHasIssues(false); }}
        onSuccess={invalidate}
        hasIssues={checklistHasIssues}
      />
      <ReturnModal
        visible={!!returnTarget}
        booking={returnTarget}
        damageFines={checklistFines}
        onClose={() => { setReturnTarget(null); setChecklistFines(0); setChecklistHasIssues(false); }}
        onSuccess={invalidate}
        hasIssues={checklistHasIssues}
      />
      <SwapModal
        visible={!!swapTarget}
        booking={swapTarget}
        onClose={() => setSwapTarget(null)}
        onSuccess={invalidate}
        storeId={storeId ?? ''}
        operatorId={operatorId}
        availableVehicles={availableVehicles}
        availableBatteries={availableBatteries}
      />
      <RenewModal
        visible={!!renewTarget}
        booking={renewTarget}
        onClose={() => setRenewTarget(null)}
        onSuccess={invalidate}
        storeId={storeId ?? ''}
        operatorId={operatorId}
        availableVehicles={availableVehicles}
        availableBatteries={availableBatteries}
        globalConfig={globalConfig ?? null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: Colors.bgApp },
  topSection: {
    backgroundColor: Colors.bgApp,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  titleRow: { marginBottom: Spacing.sm },

  bookBtn: {
    backgroundColor: Colors.brandTeal,
    borderRadius: 14,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    shadowColor: Colors.brandTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  bookBtnText: { ...Typography.buttonPrimary, color: Colors.brandNavy, fontWeight: '800', fontSize: 15 },

  boardToggle: { flexDirection: 'row', gap: 8, marginBottom: Spacing.sm },
  boardBtn: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  boardBtnActive:     { backgroundColor: Colors.brandNavy, borderColor: Colors.brandNavy },
  boardBtnText:       { ...Typography.badgeText, color: Colors.textSecondary, fontSize: 11 },
  boardBtnTextActive: { color: Colors.brandTeal },

  chipScroll: { marginBottom: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceCard,
    gap: 5,
  },
  chipActiveDefault:     { backgroundColor: Colors.surfaceTeal, borderColor: Colors.brandTeal },
  chipDot:               { width: 6, height: 6, borderRadius: 3 },
  chipText:              { ...Typography.badgeText, color: Colors.textSecondary, fontSize: 11 },
  chipTextActiveDefault: { color: Colors.brandTeal, fontWeight: '700' } as const,

  listContent: { padding: Spacing.md, paddingTop: Spacing.sm, paddingBottom: 100 },
});
