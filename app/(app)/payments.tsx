// ─────────────────────────────────────────────────────────────────────────────
// Payments Screen — Payments Desk
// DESIGN_OPS.md §6.6: sorted queue, summary cards, payment action
// Sort: Overdue first → Advance required → Monthly → Weekly
// ─────────────────────────────────────────────────────────────────────────────

import { useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { PaymentModal } from '../../src/components/modals/PaymentModal';
import { EmptyState, ErrorBanner, KPICard, SkeletonCard } from '../../src/components/ui';
import { useBookings, queryKeys } from '../../src/hooks/useQueries';
import { useAuthStore } from '../../src/stores/authStore';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import { calculatePaymentGate, formatCurrency, toNodeId } from '../../src/services/bookingService';
import type { BookingWithDetails } from '../../src/lib/database.types';

export default function PaymentsScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const { user } = useAuthStore();
  const storeId = selectedStore?.store_id ?? null;
  const operatorId = user?.id ?? '';
  const queryClient = useQueryClient();

  const { data: bookings, isLoading, error, refetch } = useBookings(storeId);
  const [paymentTarget, setPaymentTarget] = useState<BookingWithDetails | null>(null);

  // Only include bookings that are actionable for payment
  const paymentQueue = useMemo(() => {
    if (!bookings) return [];
    const today = new Date();

    return (bookings as BookingWithDetails[])
      .filter((b) => ['Draft', 'Active', 'Paused'].includes(b.status))
      .map((b) => {
        const gate = calculatePaymentGate(b.rental_plan, b.total_amount, b.deposit_amount, b.fines_amount, b.amount_paid);
        const balance = b.total_amount + b.deposit_amount + b.fines_amount - b.amount_paid;
        const endDate = b.customer.end_date ? new Date(b.customer.end_date) : null;
        const daysLate = endDate && endDate < today ? Math.floor((today.getTime() - endDate.getTime()) / 86400000) : 0;
        return { booking: b, gate, balance, daysLate };
      })
      // Sort: overdue first, then advance required, Monthly before Weekly
      .sort((a, b) => {
        if (a.daysLate !== b.daysLate) return b.daysLate - a.daysLate;
        if (!a.gate.isCleared && b.gate.isCleared) return -1;
        if (a.gate.isCleared && !b.gate.isCleared) return 1;
        if (a.booking.rental_plan !== b.booking.rental_plan)
          return a.booking.rental_plan === 'Monthly' ? -1 : 1;
        return 0;
      });
  }, [bookings]);

  const totalPending = paymentQueue.reduce((s, q) => s + Math.max(0, q.balance), 0);
  const totalCollected = (bookings as BookingWithDetails[] | undefined)
    ?.reduce((s, b) => s + b.amount_paid, 0) ?? 0;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.bookingsWithDetails(storeId ?? '') });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[Typography.overline, { color: Colors.textSecondary }]}>
          SETTLEMENTS & ACCOUNT CLEARING
        </Text>
        <Text style={[Typography.h1Screen, { color: Colors.textPrimary }]}>Payments Desk</Text>
      </View>

      {/* Summary cards */}
      <View style={styles.summaryRow}>
        <KPICard
          label="TOTAL COLLECTED"
          value={formatCurrency(totalCollected)}
          valueColor={Colors.statusActive}
          icon={<Text>💚</Text>}
        />
        <KPICard
          label="TOTAL PENDING"
          value={formatCurrency(totalPending)}
          valueColor={Colors.textOrange}
          icon={<Text>🟠</Text>}
        />
      </View>

      {error && <ErrorBanner message="Failed to load payments" onRetry={refetch} />}

      {/* Queue label */}
      <View style={styles.queueHeader}>
        <Text style={[Typography.labelCaps, { color: Colors.textSecondary }]}>
          ⓪ DUE COLLECTION ({paymentQueue.length})
        </Text>
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.md, gap: 12 }}>
          {[1, 2, 3].map((k) => <SkeletonCard key={k} height={80} />)}
        </View>
      ) : (
        <FlatList
          data={paymentQueue}
          keyExtractor={(item) => item.booking.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={invalidate} tintColor={Colors.brandCyan} />}
          ListEmptyComponent={<EmptyState message="All payments are cleared! Great work. 🎉" />}
          renderItem={({ item: { booking, gate, balance, daysLate } }) => (
            <View style={styles.paymentRow}>
              {/* Left: ₹ icon */}
              <View style={styles.rupeeIcon}>
                <Text style={styles.rupeeText}>₹</Text>
              </View>

              {/* Center: info */}
              <View style={styles.paymentInfo}>
                <Text style={[Typography.bodyPrimary, { fontWeight: '700', color: Colors.textPrimary }]}>
                  {booking.customer.name}
                </Text>
                <View style={styles.paymentMeta}>
                  <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>
                    NODE: {toNodeId(booking.id)}
                  </Text>
                  {daysLate > 0 && (
                    <Text style={[Typography.bodySecondary, { color: Colors.statusOverdue, fontWeight: '600', marginLeft: 8 }]}>
                      ⏰ {daysLate}d Late
                    </Text>
                  )}
                </View>
                <View style={styles.planTag}>
                  <Text style={[Typography.badgeText, { color: Colors.textSecondary }]}>
                    {booking.rental_plan.toUpperCase()}
                  </Text>
                </View>
                {!gate.isCleared && (
                  <Text style={[Typography.badgeText, { color: Colors.statusOverdue, marginTop: 2 }]}>
                    {booking.rental_plan === 'Weekly' ? '100%' : '50%'} ADV. REQD
                  </Text>
                )}
              </View>

              {/* Right: amount + action */}
              <View style={styles.paymentRight}>
                <Text style={[Typography.bodyPrimary, { fontWeight: '800', color: Colors.textPrimary }]}>
                  {formatCurrency(balance)}
                </Text>
                <Pressable style={styles.actionBtn} onPress={() => setPaymentTarget(booking)}>
                  <Text style={styles.actionBtnText}>💳</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <PaymentModal
        visible={!!paymentTarget}
        booking={paymentTarget}
        onClose={() => setPaymentTarget(null)}
        onSuccess={() => { setPaymentTarget(null); invalidate(); }}
        storeId={storeId ?? ''}
        operatorId={operatorId}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgApp },
  header: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  summaryRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  queueHeader: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  listContent: { padding: Spacing.md, gap: 10, paddingBottom: 100 },

  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  rupeeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF3E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rupeeText: { fontSize: 20, color: Colors.textOrange, fontWeight: '800' },
  paymentInfo: { flex: 1, gap: 2 },
  paymentMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  planTag: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.borderInput,
    borderRadius: Radius.badge,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  paymentRight: { alignItems: 'flex-end', gap: 6 },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#FFF3E0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  actionBtnText: { fontSize: 18 },
});
