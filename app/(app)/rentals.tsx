// ─────────────────────────────────────────────────────────────────────────────
// Rentals Screen — Rental Center
// DESIGN_OPS.md §6.4: search, filter chips, book ride CTA, rental cards
// ─────────────────────────────────────────────────────────────────────────────

import { useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
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
import { PauseModal, ReturnModal, SwapModal } from '../../src/components/modals/OpsModals';
import { EmptyState, ErrorBanner, SearchBar, SkeletonCard } from '../../src/components/ui';
import { useBatteries, useBookings, useCustomers, useGlobalConfig, useVehicles, queryKeys } from '../../src/hooks/useQueries';
import { useAuthStore } from '../../src/stores/authStore';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import { dispatchBooking } from '../../src/services/bookingService';
import type { BookingStatus, BookingWithDetails } from '../../src/lib/database.types';

type FilterStatus = 'All' | BookingStatus;
type BoardView = 'LIVE BOARD' | 'MASTER HISTORY';

const STATUS_FILTERS: FilterStatus[] = ['All', 'Active', 'Draft', 'Paused', 'Completed', 'Cancelled'];

export default function RentalsScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const { user } = useAuthStore();
  const storeId = selectedStore?.store_id ?? null;
  const operatorId = user?.id ?? '';
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('All');
  const [boardView, setBoardView] = useState<BoardView>('LIVE BOARD');
  const [showBookRide, setShowBookRide] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<BookingWithDetails | null>(null);
  const [pauseTarget, setPauseTarget] = useState<BookingWithDetails | null>(null);
  const [returnTarget, setReturnTarget] = useState<BookingWithDetails | null>(null);
  const [swapTarget, setSwapTarget] = useState<BookingWithDetails | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: bookings, isLoading, error, refetch } = useBookings(storeId);
  const { data: customers } = useCustomers(storeId);
  const { data: vehicles } = useVehicles(storeId);
  const { data: batteries } = useBatteries(storeId);
  const { data: globalConfig } = useGlobalConfig();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.bookingsWithDetails(storeId ?? '') });
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles(storeId ?? '') });
    queryClient.invalidateQueries({ queryKey: queryKeys.batteries(storeId ?? '') });
  };

  // ── Filter logic ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!bookings) return [];
    const raw = bookings as BookingWithDetails[];

    // Board view filter
    const board = boardView === 'LIVE BOARD'
      ? raw.filter((b) => ['Draft', 'Active', 'Paused'].includes(b.status))
      : raw;

    // Status chip filter
    const byStatus = statusFilter === 'All' ? board : board.filter((b) => b.status === statusFilter);

    // Search filter
    const q = search.toLowerCase().trim();
    if (!q) return byStatus;
    return byStatus.filter((b) =>
      b.customer.name.toLowerCase().includes(q) ||
      b.customer.phone.includes(q) ||
      b.vehicle.plate_number.toLowerCase().includes(q) ||
      b.battery.serial_number.toLowerCase().includes(q),
    );
  }, [bookings, statusFilter, search, boardView]);

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

  const availableVehicles = (vehicles ?? []).filter((v) => v.status === 'Available');
  const availableBatteries = (batteries ?? []).filter((b) => b.status === 'Available');

  return (
    <SafeAreaView style={styles.safe}>
      {/* Fixed top section */}
      <View style={styles.topSection}>
        {/* Screen title */}
        <View style={styles.titleRow}>
          <Text style={[Typography.overline, { color: Colors.textSecondary }]}>
            FLEET DISPATCHER & LIFECYCLE TRACKER.
          </Text>
          <Text style={[Typography.h1Screen, { color: Colors.textPrimary, marginTop: 2 }]}>Rental Center</Text>
        </View>

        {/* Book Ride — full-width cyan pill */}
        <Pressable
          style={({ pressed }) => [styles.bookBtn, { opacity: pressed ? 0.88 : 1 }]}
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
          {(['LIVE BOARD', 'MASTER HISTORY'] as BoardView[]).map((v) => (
            <Pressable key={v} style={[styles.boardBtn, boardView === v && styles.boardBtnActive]} onPress={() => setBoardView(v)}>
              <Text style={[styles.boardBtnText, boardView === v && styles.boardBtnTextActive]}>{v}</Text>
            </Pressable>
          ))}
        </View>

        {/* Status chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
          {STATUS_FILTERS.map((f) => (
            <Pressable key={f} style={[styles.chip, statusFilter === f && styles.chipActive]} onPress={() => setStatusFilter(f)}>
              <Text style={[styles.chipText, statusFilter === f && styles.chipTextActive]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {error && <ErrorBanner message="Failed to load rentals" onRetry={refetch} />}

      {/* Rental cards list */}
      {isLoading ? (
        <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: 12 }}>
          {[1, 2, 3].map((k) => <SkeletonCard key={k} height={220} />)}
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={invalidate} tintColor={Colors.brandCyan} />}
          ListEmptyComponent={
            <EmptyState
              message={search ? 'No results for that search.' : 'No bookings yet.'}
              sub={!search ? 'Tap + BOOK RIDE to get started.' : undefined}
            />
          }
          renderItem={({ item }) => (
            <RentalCard
              booking={item}
              onDispatch={handleDispatch}
              onCollectCash={setPaymentTarget}
              onPause={setPauseTarget}
              onReturn={setReturnTarget}
              onSwap={setSwapTarget}
            />
          )}
        />
      )}

      {/* Modals */}
      <BookRideModal
        visible={showBookRide}
        onClose={() => setShowBookRide(false)}
        onSuccess={invalidate}
        storeId={storeId ?? ''}
        operatorId={operatorId}
        customers={customers ?? []}
        vehicles={vehicles ?? []}
        batteries={batteries ?? []}
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
        onClose={() => setPauseTarget(null)}
        onSuccess={invalidate}
      />
      <ReturnModal
        visible={!!returnTarget}
        booking={returnTarget}
        onClose={() => setReturnTarget(null)}
        onSuccess={invalidate}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgApp },
  topSection: { backgroundColor: Colors.bgApp, paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  titleRow: { marginBottom: Spacing.sm },
  bookBtn: {
    backgroundColor: Colors.brandTeal,
    borderRadius: Radius.pill,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  bookBtnText: { ...Typography.buttonPrimary, color: Colors.brandNavy, fontWeight: '700', fontSize: 15 },

  boardToggle: { flexDirection: 'row', gap: 8, marginBottom: Spacing.sm },
  boardBtn: { flex: 1, height: 36, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.surfaceCard, alignItems: 'center', justifyContent: 'center' },
  boardBtnActive: { backgroundColor: Colors.brandNavy, borderColor: Colors.brandNavy },
  boardBtnText: { ...Typography.badgeText, color: Colors.textSecondary, fontSize: 12 },
  boardBtnTextActive: { color: Colors.brandTeal },

  chipScroll: { marginBottom: Spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.surfaceCard },
  chipActive: { backgroundColor: Colors.surfaceTeal, borderColor: Colors.brandTeal },
  chipText: { ...Typography.badgeText, color: Colors.textSecondary, fontSize: 12 },
  chipTextActive: { color: Colors.brandTeal, fontWeight: '700' },

  listContent: { padding: Spacing.md, paddingTop: Spacing.sm, paddingBottom: 100 },
});
