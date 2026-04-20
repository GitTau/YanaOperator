// ─────────────────────────────────────────────────────────────────────────────
// Overview Screen — Ops Center
// DESIGN_OPS.md §6.3: KPI cards, Rental Goal Progress, Overdue alert
// ─────────────────────────────────────────────────────────────────────────────

import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, Spacing, Typography } from '../../src/constants/design';
import {
  EmptyState,
  ErrorBanner,
  KPICard,
  ProgressBar,
  SectionHeader,
  SkeletonCard,
  StoreLiveBadge,
} from '../../src/components/ui';
import { useBookings, useGlobalConfig, useVehicles, queryKeys } from '../../src/hooks/useQueries';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import { formatCurrency } from '../../src/services/bookingService';
import { calculatePaymentGate } from '../../src/services/bookingService';
import type { BookingWithDetails } from '../../src/lib/database.types';

export default function OverviewScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const storeId = selectedStore?.store_id ?? null;
  const queryClient = useQueryClient();

  const { data: bookings, isLoading: bookingsLoading, error: bookingsError, refetch: refetchBookings } = useBookings(storeId);
  const { data: vehicles, isLoading: vehiclesLoading } = useVehicles(storeId);
  const { data: globalConfig } = useGlobalConfig();

  const isLoading = bookingsLoading || vehiclesLoading;

  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.bookingsWithDetails(storeId ?? '') });
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles(storeId ?? '') });
  };

  // ── Derived KPIs ─────────────────────────────────────────────────────────
  const activeBookings = (bookings as BookingWithDetails[] | undefined)?.filter((b) => b.status === 'Active').length ?? 0;
  const totalBookings = bookings?.length ?? 0;

  const vehiclesIdle = vehicles?.filter((v) => v.status === 'Available').length ?? 0;

  // Payments pending = sum of balance due on active + paused bookings
  const paymentsPending = (bookings as BookingWithDetails[] | undefined)
    ?.filter((b) => b.status === 'Active' || b.status === 'Paused' || b.status === 'Draft')
    .reduce((sum, b) => {
      const balance = b.total_amount + b.deposit_amount + b.fines_amount - b.amount_paid;
      return sum + Math.max(0, balance);
    }, 0) ?? 0;

  // Overdue = active bookings where ride end date has passed
  const today = new Date();
  const overdueBookings = (bookings as BookingWithDetails[] | undefined)?.filter((b) => {
    if (b.status !== 'Active') return false;
    const endDate = b.customer.end_date ? new Date(b.customer.end_date) : null;
    return endDate && endDate < today;
  }) ?? [];

  const targetRentals = selectedStore?.target_rentals ?? 10;
  const goalProgress = targetRentals > 0 ? activeBookings / targetRentals : 0;

  if (!selectedStore) {
    return <EmptyState message="No store selected." sub="Go back and pick your ZAP Point." />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={Colors.brandCyan} />}
      >
        {/* ── Screen Header ─────────────────────────────────────────────── */}
        <View style={styles.screenHeader}>
          <View>
            <Text style={[Typography.overline, { color: Colors.textSecondary }]}>
              ZAP POINT PERFORMANCE OVERVIEW
            </Text>
            <Text style={[Typography.h1Screen, { color: Colors.textPrimary }]}>Ops Center</Text>
          </View>
          <StoreLiveBadge />
        </View>

        {bookingsError && (
          <ErrorBanner message="Failed to load data" onRetry={onRefresh} />
        )}

        {isLoading ? (
          <View style={{ gap: 12 }}>
            {[1, 2, 3].map((k) => <SkeletonCard key={k} height={110} />)}
          </View>
        ) : (
          <>
            {/* ── KPI Row 1 ─────────────────────────────────────────────── */}
            <View style={styles.kpiRow}>
              <KPICard
                label="TOTAL BOOKINGS"
                value={totalBookings}
                icon={<Text style={{ fontSize: 20 }}>📋</Text>}
              />
              <KPICard
                label="VEHICLES IDLE"
                value={vehiclesIdle}
                valueColor={Colors.textCyan}
                icon={<Text style={{ fontSize: 20 }}>🛵</Text>}
              />
            </View>

            {/* ── Rental Goal Progress ──────────────────────────────────── */}
            <View style={styles.goalCard}>
              <View style={styles.goalHeader}>
                <Text style={[Typography.labelCaps, { color: Colors.textSecondary }]}>
                  ◎ RENTAL GOAL PROGRESS
                </Text>
                <View style={styles.goalBadge}>
                  <Text style={styles.goalBadgeText}>
                    {activeBookings} / {targetRentals} Active — {Math.round(goalProgress * 100)}%
                  </Text>
                </View>
              </View>
              <View style={{ marginVertical: Spacing.sm }}>
                <ProgressBar progress={goalProgress} />
              </View>
              <Text style={[Typography.overline, { color: Colors.textSecondary, fontStyle: 'italic' }]}>
                * TARGET DEFINED BY ADMIN CONSOLE
              </Text>
            </View>

            {/* ── KPI Row 2: Payments Pending ───────────────────────────── */}
            <KPICard
              label="PAYMENTS PENDING"
              value={formatCurrency(paymentsPending)}
              valueColor={Colors.textOrange}
              icon={<Text style={{ fontSize: 20 }}>💰</Text>}
            />

            {/* ── Overdue Alert ─────────────────────────────────────────── */}
            {overdueBookings.length > 0 && (
              <View style={styles.overdueCard}>
                <View style={styles.overdueHeader}>
                  <Text style={{ fontSize: 22 }}>⚠️</Text>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[Typography.labelCaps, { color: Colors.statusOverdue }]}>
                      OVERDUE STATUS
                    </Text>
                    <Text style={styles.overdueCount}>{overdueBookings.length}</Text>
                    <Text style={[Typography.bodySecondary, { color: Colors.statusOverdue }]}>
                      bookings past return date
                    </Text>
                  </View>
                </View>
                {overdueBookings.slice(0, 3).map((b) => (
                  <View key={b.id} style={styles.overdueRow}>
                    <Text style={[Typography.bodySecondary, { color: Colors.statusOverdue, fontWeight: '600', flex: 1 }]}>
                      {b.customer.name}
                    </Text>
                    <Text style={[Typography.bodySecondary, { color: Colors.statusOverdue }]}>
                      {b.vehicle.plate_number}
                    </Text>
                  </View>
                ))}
                {overdueBookings.length > 3 && (
                  <Text style={[Typography.bodySecondary, { color: Colors.statusOverdue, marginTop: 4 }]}>
                    +{overdueBookings.length - 3} more — check Rentals tab
                  </Text>
                )}
              </View>
            )}

            {/* ── Active booking list summary ───────────────────────────── */}
            <View style={styles.activeSummary}>
              <Text style={[Typography.labelCaps, { color: Colors.textSecondary }]}>
                LIVE BOOKINGS — {activeBookings}
              </Text>
              {(bookings as BookingWithDetails[] | undefined)
                ?.filter((b) => b.status === 'Active')
                .slice(0, 5)
                .map((b) => (
                  <View key={b.id} style={styles.activeSummaryRow}>
                    <Text style={[Typography.bodySecondary, { color: Colors.textPrimary, fontWeight: '600', flex: 1 }]}>
                      {b.customer.name}
                    </Text>
                    <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>
                      {b.vehicle.plate_number} · {b.rental_plan}
                    </Text>
                  </View>
                ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgApp },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  screenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },

  kpiRow: { flexDirection: 'row', gap: Spacing.sm },

  goalCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
  },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalBadge: {
    backgroundColor: Colors.brandNavy,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  goalBadgeText: { ...Typography.badgeText, color: Colors.brandCyan },

  overdueCard: {
    backgroundColor: Colors.overdueCardBg,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.statusOverdue,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  overdueHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  overdueCount: { fontSize: 36, fontWeight: '800', color: Colors.statusOverdue },
  overdueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,23,68,0.15)',
  },

  activeSummary: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  activeSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
});
