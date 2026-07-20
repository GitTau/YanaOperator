// ─────────────────────────────────────────────────────────────────────────────
// Overview Screen — Ops Center v2
// Layout order: KPI grid → Goal progress → Overdue alert → Live bookings
// Premium design: no emoji icons, muted palette, clean hierarchy
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
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
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import {
  EmptyState,
  ErrorBanner,
  KPICard,
  ProgressBar,
  SkeletonCard,
  StoreLiveBadge,
} from '../../src/components/ui';
import { useBookings, useGlobalConfig, useVehicles, queryKeys, useCaptainByStore, useMyTaskEntries } from '../../src/hooks/useQueries';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import { formatCurrency, calculatePaymentGate, parseLocalDate } from '../../src/services/bookingService';
import type { BookingWithDetails } from '../../src/lib/database.types';

export default function OverviewScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const storeId = selectedStore?.store_id ?? null;
  const queryClient = useQueryClient();

  const { data: bookings, isLoading: bookingsLoading, error: bookingsError, refetch: refetchBookings } = useBookings(storeId);
  const { data: vehicles, isLoading: vehiclesLoading } = useVehicles(storeId);
  const { data: globalConfig } = useGlobalConfig();
  const { data: captain, isLoading: captainLoading } = useCaptainByStore(storeId);
  const captainId = captain?.id ?? null;
  const { data: tasks, isLoading: tasksLoading } = useMyTaskEntries(captainId, 'all');

  const isLoading = bookingsLoading || vehiclesLoading || captainLoading || tasksLoading;

  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.bookingsWithDetails(storeId ?? '') });
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles(storeId ?? '') });
    queryClient.invalidateQueries({ queryKey: queryKeys.captainByStore(storeId ?? '') });
    if (captainId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.taskEntries(captainId, 'all') });
    }
  };

  // ── Derived KPIs ─────────────────────────────────────────────────────────
  const activeBookings = (bookings as BookingWithDetails[] | undefined)?.filter((b) => b.status === 'Active').length ?? 0;

  const totalRevenueRealised = (bookings as BookingWithDetails[] | undefined)?.reduce((sum, b) => {
    const amountPaid = b.amount_paid || 0;
    const depositAmount = b.deposit_amount || 0;
    const depositCollected = Math.min(amountPaid, depositAmount);
    const rentalCollected = amountPaid - depositCollected;
    return sum + rentalCollected;
  }, 0) ?? 0;

  const captainEarnings = totalRevenueRealised * 0.03;

  // Pending tasks metrics & urgency color
  const pendingTasks = tasks?.filter((t) => t.status === 'pending') ?? [];
  const pendingTasksCount = pendingTasks.length;
  const hasEmergency = pendingTasks.some((t) => t.task_type === 'emergency');
  const hasNonRegular = pendingTasks.some((t) => t.task_type === 'non_regular');
  const tasksUrgencyColor = pendingTasksCount === 0
    ? Colors.statusActive
    : hasEmergency
    ? Colors.statusError
    : hasNonRegular
    ? Colors.statusWarning
    : Colors.brandTeal;

  const paymentsPending = (bookings as BookingWithDetails[] | undefined)
    ?.filter((b) => b.status === 'Active' || b.status === 'Paused' || b.status === 'Draft')
    .reduce((sum, b) => {
      const gate = calculatePaymentGate(
        b.rental_plan,
        b.total_amount,
        b.deposit_amount,
        b.fines_amount,
        b.amount_paid,
        b.start_date,
        b.end_date,
        b.status,
      );
      const balance = Math.max(0, gate.gateAmount - b.amount_paid);
      return sum + balance;
    }, 0) ?? 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const overdueBookings = (bookings as BookingWithDetails[] | undefined)?.filter((b) => {
    if (b.status !== 'Active') return false;
    const endDate = b.end_date ? parseLocalDate(b.end_date) : null;
    if (endDate) endDate.setHours(0, 0, 0, 0);
    const endOverdue = endDate && endDate < today;

    let secondPartOverdue = false;
    if (b.rental_plan === 'Monthly' && b.start_date) {
      const startDate = parseLocalDate(b.start_date);
      if (startDate) {
        startDate.setHours(0, 0, 0, 0);
        const secondPartDueDate = new Date(startDate);
        secondPartDueDate.setDate(startDate.getDate() + 9);
        if (today > secondPartDueDate && b.amount_paid < (b.total_amount + b.deposit_amount)) {
          secondPartOverdue = true;
        }
      }
    }

    return endOverdue || secondPartOverdue;
  }) ?? [];

  const targetRentals = selectedStore?.target_rentals ?? 10;
  const goalProgress  = targetRentals > 0 ? activeBookings / targetRentals : 0;

  if (!selectedStore) {
    return <EmptyState message="No store selected." sub="Go back and pick your ZAP Point." />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={Colors.brandTeal} />}
      >
        {/* ── Screen Header ─────────────────────────────────────────────── */}
        <View style={styles.screenHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[Typography.overline, { color: Colors.textSecondary }]}>
              ZAP POINT PERFORMANCE
            </Text>
            <Text style={[Typography.h1Screen, { color: Colors.textPrimary, marginTop: 2 }]}>
              Ops Center
            </Text>
          </View>
        </View>

        {bookingsError && (
          <ErrorBanner message="Failed to load data" onRetry={onRefresh} />
        )}

        {isLoading ? (
          <View style={{ gap: 10 }}>
            {[1, 2, 3].map((k) => <SkeletonCard key={k} height={100} />)}
          </View>
        ) : (
          <>
            {/* ── KPI Grid 2×2 ──────────────────────────────────────────── */}
            <View style={styles.kpiGrid}>
              <View style={styles.kpiRow}>
                <KPICard
                  label="ACTIVE BOOKINGS"
                  value={activeBookings}
                  accentColor={Colors.brandTeal}
                  icon="bicycle-outline"
                />
                <KPICard
                  label="PENDING TASKS"
                  value={pendingTasksCount}
                  accentColor={tasksUrgencyColor}
                  icon="checkbox-outline"
                />
              </View>
              <View style={styles.kpiRow}>
                <KPICard
                  label="CAPTAIN EARNINGS"
                  value={formatCurrency(captainEarnings)}
                  accentColor={Colors.brandTeal}
                  icon="cash-outline"
                />
                <KPICard
                  label="PENDING DUES"
                  value={paymentsPending > 0 ? formatShortCurrency(paymentsPending) : '₹0'}
                  accentColor={paymentsPending > 0 ? Colors.statusWarning : undefined}
                  icon="card-outline"
                />
              </View>
            </View>


            {/* ── Rental Goal Progress ──────────────────────────────────── */}
            <View style={styles.goalCard}>
              <View style={styles.goalHeader}>
                <Text style={[Typography.labelCaps, { color: Colors.textSecondary }]}>
                  RENTAL GOAL
                </Text>
                <Text style={[Typography.badgeText, { color: Colors.textSecondary }]}>
                  {activeBookings} / {targetRentals} · {Math.round(goalProgress * 100)}%
                </Text>
              </View>
              <View style={{ marginTop: Spacing.sm }}>
                <ProgressBar progress={goalProgress} height={6} />
              </View>
              <Text style={[Typography.caption, { color: Colors.textMuted, marginTop: 8 }]}>
                Target set by admin
              </Text>
            </View>

            {/* ── Overdue Alert ─────────────────────────────────────────── */}
            {overdueBookings.length > 0 && (
              <View style={styles.overdueCard}>
                <View style={styles.overdueHeader}>
                  <View style={styles.overdueIconWrap}>
                    <Ionicons name="warning-outline" size={18} color={Colors.statusError} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[Typography.labelCaps, { color: Colors.statusError }]}>
                      OVERDUE BOOKINGS
                    </Text>
                    <Text style={[Typography.h2Metric, { color: Colors.statusError, fontSize: 28, lineHeight: 34 }]}>
                      {overdueBookings.length}
                    </Text>
                    <Text style={[Typography.caption, { color: Colors.statusError }]}>
                      past return date
                    </Text>
                  </View>
                </View>
                {overdueBookings.slice(0, 3).map((b) => (
                  <View key={b.id} style={styles.overdueRow}>
                    <Text style={[Typography.bodySecondary, { color: Colors.textPrimary, fontWeight: '600', flex: 1 }]}>
                      {b.customer.name}
                    </Text>
                    <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>
                      {b.vehicle?.plate_number ?? 'No Vehicle'}
                    </Text>
                  </View>
                ))}
                {overdueBookings.length > 3 && (
                  <Text style={[Typography.caption, { color: Colors.statusError, marginTop: 6 }]}>
                    +{overdueBookings.length - 3} more — see Rentals tab
                  </Text>
                )}
              </View>
            )}

            {/* ── Live Bookings Summary ──────────────────────────────────── */}
            {activeBookings > 0 && (
              <View style={styles.liveSection}>
                <Text style={[Typography.labelCaps, { color: Colors.textSecondary, marginBottom: Spacing.sm }]}>
                  LIVE — {activeBookings} ACTIVE
                </Text>
                {(bookings as BookingWithDetails[] | undefined)
                  ?.filter((b) => b.status === 'Active')
                  .slice(0, 6)
                  .map((b) => (
                    <View key={b.id} style={styles.liveRow}>
                      <View style={styles.liveAvatar}>
                        <Text style={styles.liveAvatarText}>
                          {b.customer.name.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[Typography.bodyPrimary, { color: Colors.textPrimary, fontWeight: '600', fontSize: 13 }]}>
                          {b.customer.name}
                        </Text>
                        <Text style={[Typography.caption, { color: Colors.textSecondary }]}>
                          {b.vehicle?.plate_number ?? 'No Vehicle'} · {b.rental_plan}
                        </Text>
                      </View>
                      <View style={[
                        styles.liveStatusDot,
                        { backgroundColor: b.status === 'Active' ? Colors.surfaceGreen : Colors.surfaceAmber },
                      ]}>
                        <Text style={[Typography.caption, {
                          color: b.status === 'Active' ? Colors.statusActive : Colors.statusWarning,
                          fontWeight: '600',
                        }]}>
                          {b.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatShortCurrency(amount: number): string {
  if (amount >= 1000) {
    const kAmount = amount / 1000;
    const formatted = kAmount % 1 === 0 ? kAmount.toFixed(0) : kAmount.toFixed(1);
    return `₹${formatted}K`;
  }
  return `₹${amount}`;
}


const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bgApp },
  scroll:  { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  screenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  kpiGrid: {
    gap: Spacing.sm,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },


  goalCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  overdueCard: {
    backgroundColor: Colors.surfaceRed,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  overdueHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  overdueIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overdueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
  },

  liveSection: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  liveAvatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveAvatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brandTeal,
  },
  liveStatusDot: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
});
