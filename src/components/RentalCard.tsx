// ─────────────────────────────────────────────────────────────────────────────
// RentalCard — primary operational card for Rentals screen
// Spec: DESIGN_OPS.md §5.6
// Shows: rider info, vehicle+battery, plan, due date, payment gate, actions
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/design';
import type { BookingWithDetails } from '../lib/database.types';
import {
  calculatePaymentGate,
  formatCurrency,
  maskAadhaar,
  toNodeId,
} from '../services/bookingService';
import { Divider, PaymentGateBadge, StatusBadge, YanaButton } from './ui';

interface RentalCardProps {
  booking: BookingWithDetails;
  onDispatch: (booking: BookingWithDetails) => void;
  onCollectCash: (booking: BookingWithDetails) => void;
  onPause: (booking: BookingWithDetails) => void;
  onReturn: (booking: BookingWithDetails) => void;
  onSwap: (booking: BookingWithDetails) => void;
}

export function RentalCard({
  booking,
  onDispatch,
  onCollectCash,
  onPause,
  onReturn,
  onSwap,
}: RentalCardProps) {
  const [financialExpanded, setFinancialExpanded] = useState(false);

  const gate = calculatePaymentGate(
    booking.rental_plan,
    booking.total_amount,
    booking.deposit_amount,
    booking.fines_amount,
    booking.amount_paid,
  );

  const paidPctDisplay = Math.round(gate.paidPct * 100);
  const paidColor =
    gate.isCleared
      ? Colors.statusActive
      : gate.paidPct >= 0.5
        ? Colors.amber
        : Colors.statusOverdue;

  const returnDue = booking.customer.end_date
    ? new Date(booking.customer.end_date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    })
    : '—';

  // Avatar initials
  const initials = booking.customer.name.slice(0, 2).toUpperCase();

  return (
    <View style={styles.card}>
      {/* ── Header Row: Avatar + Name + Status Badge ────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={[Typography.bodyPrimary, styles.riderName]} numberOfLines={1}>
            {booking.customer.name}
          </Text>
          <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>
            {booking.customer.phone}
          </Text>
        </View>
        <View style={styles.headerBadges}>
          <StatusBadge status={booking.status} />
          <View style={{ marginTop: 4 }}>
            <PaymentGateBadge isCleared={gate.isCleared} />
          </View>
        </View>
      </View>

      <Divider />

      {/* ── Vehicle + Battery ────────────────────────────────────────────── */}
      <View style={styles.assetRow}>
        <View style={styles.assetChip}>
          <Text style={styles.assetIcon}>🛵</Text>
          <Text style={[Typography.bodySecondary, { color: Colors.textPrimary, fontWeight: '600' }]}>
            {booking.vehicle.plate_number}
          </Text>
        </View>
        <View style={styles.assetChip}>
          <Text style={styles.assetIcon}>⚡</Text>
          <Text style={[Typography.bodySecondary, { color: Colors.textPrimary, fontWeight: '600' }]}>
            {booking.battery.serial_number}
          </Text>
        </View>
        <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>
          NODE: {toNodeId(booking.id)}
        </Text>
      </View>

      {/* ── Plan + Gate + Due Date ─────────────────────────────────────── */}
      <View style={styles.planRow}>
        <View style={styles.planChip}>
          <Text style={[Typography.badgeText, { color: Colors.textSecondary }]}>
            {booking.rental_plan.toUpperCase()}
          </Text>
        </View>
        <Text style={[Typography.badgeText, { color: Colors.textSecondary }]}>
          {booking.rental_plan === 'Weekly' ? '100%' : '50%'} PAYMENT GATE
        </Text>
      </View>

      <View style={styles.dueDateRow}>
        <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>
          📅 Return Due: <Text style={{ color: Colors.textPrimary, fontWeight: '600' }}>{returnDue}</Text>
        </Text>
      </View>

      {/* ── Financial Health Expandable ────────────────────────────────── */}
      <Pressable style={styles.financialRow} onPress={() => setFinancialExpanded((v) => !v)}>
        <Text style={[Typography.badgeText, { color: Colors.statusActive }]}>
          💚 FINANCIAL HEALTH
        </Text>
        <Text style={[Typography.badgeText, { color: paidColor, marginLeft: 'auto' }]}>
          PAID: {paidPctDisplay}% {financialExpanded ? '▲' : '▼'}
        </Text>
      </Pressable>

      {financialExpanded && (
        <View style={styles.financialExpanded}>
          <FinancialLine label="Total Rent" amount={booking.total_amount} />
          <FinancialLine label="Security Deposit" amount={booking.deposit_amount} />
          <FinancialLine label="Fines" amount={booking.fines_amount} valueColor={booking.fines_amount > 0 ? Colors.statusOverdue : undefined} />
          <FinancialLine label="Amount Paid" amount={booking.amount_paid} valueColor={Colors.statusActive} />
          <FinancialLine
            label={`Gate Limit (${booking.rental_plan === 'Weekly' ? '100%' : '50%'})`}
            amount={gate.gateAmount}
            valueColor={Colors.brandCyan}
          />
        </View>
      )}

      <Divider />

      {/* ── Action Buttons ─────────────────────────────────────────────── */}
      <View style={styles.actions}>
        {booking.status === 'Draft' && (
          <YanaButton
            label={gate.isCleared ? 'DISPATCH RIDE' : 'DISPATCH RIDE'}
            variant={gate.isCleared ? 'primary' : 'secondary'}
            disabled={!gate.isCleared}
            onPress={() => onDispatch(booking)}
          />
        )}

        {booking.status === 'Active' && (
          <View style={styles.actionGroup}>
            <YanaButton
              label="⏸ PAUSE & DELINK"
              variant="warning"
              onPress={() => onPause(booking)}
              style={styles.halfButton}
            />
            <YanaButton
              label="✅ RETURN"
              variant="success"
              onPress={() => onReturn(booking)}
              style={styles.halfButton}
            />
          </View>
        )}

        {(booking.status === 'Draft' || booking.status === 'Active' || booking.status === 'Paused') && (
          <YanaButton
            label="💵 COLLECT CASH"
            variant="secondary"
            onPress={() => onCollectCash(booking)}
            style={styles.collectBtn}
          />
        )}

        {booking.status === 'Active' && (
          <YanaButton
            label="SWAP VEHICLE/BATTERY"
            variant="ghost"
            onPress={() => onSwap(booking)}
          />
        )}

        {(booking.status === 'Completed' || booking.status === 'Cancelled') && (
          <View style={styles.completedNote}>
            <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>
              {booking.status === 'Completed' ? '✅ Booking completed' : '❌ Booking cancelled'}
              {booking.completed_at ? ` on ${new Date(booking.completed_at).toLocaleDateString('en-IN')}` : ''}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function FinancialLine({
  label,
  amount,
  valueColor = Colors.textPrimary,
}: {
  label: string;
  amount: number;
  valueColor?: string;
}) {
  return (
    <View style={styles.financialLine}>
      <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>{label}</Text>
      <Text style={[Typography.bodySecondary, { color: valueColor, fontWeight: '600' }]}>
        {formatCurrency(amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.brandCyan,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: Colors.brandNavy,
    fontWeight: '800',
    fontSize: 16,
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  riderName: {
    fontWeight: '700',
    color: Colors.textPrimary,
    fontSize: 15,
  },
  headerBadges: {
    alignItems: 'flex-end',
    gap: 4,
  },

  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  assetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bgApp,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  assetIcon: {
    fontSize: 13,
  },

  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  planChip: {
    borderRadius: Radius.badge,
    borderWidth: 1,
    borderColor: Colors.borderInput,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dueDateRow: {
    marginBottom: Spacing.sm,
  },

  financialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  financialExpanded: {
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  financialLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },

  actions: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  actionGroup: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  halfButton: {
    flex: 1,
  },
  collectBtn: {
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
  },
  completedNote: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
});
