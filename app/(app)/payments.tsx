// ─────────────────────────────────────────────────────────────────────────────
// Payments Screen v2 — Settlements Desk
// Muted palette, Ionicons only, compact payment rows, neutral icon backgrounds.
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { PaymentModal } from '../../src/components/modals/PaymentModal';
import { EmptyState, ErrorBanner, KPICard, SkeletonCard } from '../../src/components/ui';
import { useBookings, queryKeys } from '../../src/hooks/useQueries';
import { useAuthStore } from '../../src/stores/authStore';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import { calculatePaymentGate, formatCurrency, toNodeId, parseLocalDate, getEffectiveEndDate } from '../../src/services/bookingService';
import type { BookingWithDetails } from '../../src/lib/database.types';

export default function PaymentsScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const { user } = useAuthStore();
  const storeId    = selectedStore?.store_id ?? null;
  const operatorId = user?.id ?? '';
  const queryClient = useQueryClient();

  const { data: bookings, isLoading, error, refetch } = useBookings(storeId);
  const [paymentTarget, setPaymentTarget] = useState<BookingWithDetails | null>(null);

  const paymentQueue = useMemo(() => {
    if (!bookings) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (bookings as BookingWithDetails[])
      .filter((b) => ['Draft', 'Active', 'Paused'].includes(b.status))
      .map((b) => {
        const gate = calculatePaymentGate(
          b.rental_plan,
          b.total_amount,
          b.deposit_amount,
          b.fines_amount,
          b.amount_paid,
          b.start_date,
          b.end_date,
          b.status,
          b.paused_at,
        );
        const balance = Math.max(0, gate.gateAmount - b.amount_paid);

        const endDate = getEffectiveEndDate(b.end_date, b.status, b.paused_at);
        if (endDate) endDate.setHours(0, 0, 0, 0);
        let daysLate = (b.status !== 'Paused' && endDate && endDate < today) ? Math.floor((today.getTime() - endDate.getTime()) / 86400000) : 0;

        if (b.rental_plan === 'Monthly' && daysLate === 0 && gate.isSecondPartOverdue) {
          const startDate = b.start_date ? parseLocalDate(b.start_date) : null;
          if (startDate) {
            startDate.setHours(0, 0, 0, 0);
            const secondPartDueDate = new Date(startDate);
            secondPartDueDate.setDate(startDate.getDate() + 9);
            if (today > secondPartDueDate) {
              daysLate = Math.floor((today.getTime() - secondPartDueDate.getTime()) / 86400000);
            }
          }
        }

        return { booking: b, gate, balance, daysLate };
      })
      .sort((a, b) => {
        if (a.daysLate !== b.daysLate) return b.daysLate - a.daysLate;
        if (!a.gate.isCleared && b.gate.isCleared) return -1;
        if (a.gate.isCleared && !b.gate.isCleared) return 1;
        if (a.booking.rental_plan !== b.booking.rental_plan) return a.booking.rental_plan === 'Monthly' ? -1 : 1;
        return 0;
      });
  }, [bookings]);

  const totalPending   = paymentQueue.reduce((s, q) => s + Math.max(0, q.balance), 0);
  const totalCollected = (bookings as BookingWithDetails[] | undefined)?.reduce((s, b) => s + b.amount_paid, 0) ?? 0;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.bookingsWithDetails(storeId ?? '') });

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={[Typography.overline, { color: Colors.textSecondary }]}>SETTLEMENTS & CLEARING</Text>
        <Text style={[Typography.h1Screen, { color: Colors.textPrimary, marginTop: 2 }]}>Payments Desk</Text>
      </View>

      {/* ── Summary KPIs ───────────────────────────────────────────────── */}
      <View style={styles.summaryRow}>
        <KPICard
          label="COLLECTED"
          value={formatCurrency(totalCollected)}
          valueColor={Colors.statusActive}
          backgroundColor={Colors.surfaceGreen}
          icon="trending-up-outline"
        />
        <KPICard
          label="PENDING"
          value={`${paymentQueue.length} riders`}
          valueColor={Colors.textOrange}
          backgroundColor={Colors.surfaceAmber}
          icon="time-outline"
        />
      </View>

      {error && <ErrorBanner message="Failed to load payments" onRetry={refetch} />}

      {/* ── Queue header ───────────────────────────────────────────────── */}
      <View style={styles.queueHeader}>
        <Ionicons name="download-outline" size={14} color={Colors.textOrange} style={{ marginRight: 6 }} />
        <Text style={[Typography.labelCaps, { color: Colors.textSecondary }]}>
          DUE COLLECTION ({paymentQueue.length})
        </Text>
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.md, gap: 10 }}>
          {[1, 2, 3].map((k) => <SkeletonCard key={k} height={72} />)}
        </View>
      ) : (
        <FlatList
          data={paymentQueue}
          keyExtractor={(item) => item.booking.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={invalidate} tintColor={Colors.brandTeal} />}
          ListEmptyComponent={<EmptyState message="All payments cleared." sub="Great work today." />}
          renderItem={({ item: { booking, gate, balance, daysLate } }) => (
            <View style={[styles.paymentRow, daysLate > 0 && styles.paymentRowOverdue]}>
              {/* Icon */}
              <View style={styles.rupeeIcon}>
                <Ionicons name="cash-outline" size={18} color={Colors.textSecondary} />
              </View>

              {/* Info */}
              <View style={styles.paymentInfo}>
                <Text style={[Typography.bodyPrimary, { fontWeight: '700', color: Colors.textPrimary }]}>
                  {booking.customer.name}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={[Typography.caption, { color: Colors.textMuted }]}>NODE: {toNodeId(booking.id)}</Text>
                  <View style={styles.planTag}>
                    <Text style={[Typography.badgeText, { color: Colors.textSecondary }]}>
                      {booking.rental_plan.toUpperCase()}
                    </Text>
                  </View>
                  {daysLate > 0 && (
                    <View style={styles.latePill}>
                      <Ionicons name="time-outline" size={10} color={Colors.statusError} />
                      <Text style={[Typography.caption, { color: Colors.statusError, fontWeight: '600', marginLeft: 2 }]}>
                        {daysLate}d Late
                      </Text>
                    </View>
                  )}
                </View>
                {!gate.isCleared && (
                  <Text style={[Typography.caption, { color: Colors.statusError, marginTop: 2, fontWeight: '600' }]}>
                    100% ADV. REQD
                  </Text>
                )}
              </View>

              {/* Amount + action */}
              <View style={styles.paymentRight}>
                <Text style={[Typography.bodyPrimary, { fontWeight: '800', color: Colors.textOrange }]}>
                  {formatCurrency(balance)}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => setPaymentTarget(booking)}
                  accessibilityLabel={`Collect from ${booking.customer.name}`}
                >
                  <Ionicons name="cash-outline" size={20} color={Colors.textOrange} />
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
  queueHeader: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.bgApp,
  },
  listContent: { padding: Spacing.md, gap: 8, paddingBottom: 100 },

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
  paymentRowOverdue: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.statusError,
  },

  rupeeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surfaceAmber,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
    flexShrink: 0,
  },
  rupeeText: { fontSize: 22, color: Colors.textOrange, fontWeight: '800' },
  paymentInfo: { flex: 1, gap: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  planTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  planTag: {
    borderWidth: 1, borderColor: Colors.borderInput,
    borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2,
  },
  latePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceRed, borderRadius: Radius.pill,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  paymentRight: { alignItems: 'flex-end', gap: 8 },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surfaceAmber,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
});
