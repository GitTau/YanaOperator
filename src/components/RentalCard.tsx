// ─────────────────────────────────────────────────────────────────────────────
// RentalCard v3 — matches Yana web ops design exactly
// Full-width action buttons (DISPATCH RIDE, PAUSE & DELINK, RETURN, COLLECT CASH)
// Clean header: avatar circle + name/phone + status/gate badges
// Financial health bar. Asset chips for scooter/battery.
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/design';
import type { BookingWithDetails } from '../lib/database.types';
import { calculatePaymentGate, formatCurrency, toNodeId } from '../services/bookingService';
import { PaymentGateBadge, StatusBadge } from './ui';

interface RentalCardProps {
  booking:       BookingWithDetails;
  onDispatch:    (b: BookingWithDetails) => void;
  onCollectCash: (b: BookingWithDetails) => void;
  onPause:       (b: BookingWithDetails) => void;
  onReturn:      (b: BookingWithDetails) => void;
  onSwap:        (b: BookingWithDetails) => void;
}

export function RentalCard({ booking, onDispatch, onCollectCash, onPause, onReturn, onSwap }: RentalCardProps) {
  const [financialExpanded, setFinancialExpanded] = useState(false);

  const gate = calculatePaymentGate(
    booking.rental_plan, booking.total_amount,
    booking.deposit_amount, booking.fines_amount, booking.amount_paid,
  );

  const paidPct       = Math.min(gate.paidPct, 1);
  const paidPctLabel  = `${Math.round(gate.paidPct * 100)}%`;
  const barColor      = gate.isCleared ? Colors.statusActive : paidPct >= 0.5 ? Colors.statusWarning : Colors.statusError;

  const returnDue = booking.customer.end_date
    ? new Date(booking.customer.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : '—';

  const initials = booking.customer.name.slice(0, 2).toUpperCase();

  const isOverdue = (() => {
    if (booking.status !== 'Active') return false;
    const end = booking.customer.end_date ? new Date(booking.customer.end_date) : null;
    return end ? end < new Date() : false;
  })();

  const isDraft  = booking.status === 'Draft';
  const isActive = booking.status === 'Active';
  const isPaused = booking.status === 'Paused';
  const isClosed = booking.status === 'Completed' || booking.status === 'Cancelled';

  return (
    <View style={[styles.card, isOverdue && styles.cardOverdue]}>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.headerMid}>
          <Text style={styles.riderName} numberOfLines={1}>{booking.customer.name}</Text>
          <Text style={[Typography.caption, { color: Colors.textMuted }]}>{booking.customer.phone}</Text>
        </View>
        <View style={styles.headerRight}>
          <StatusBadge status={booking.status} />
          <View style={{ height: 4 }} />
          <PaymentGateBadge isCleared={gate.isCleared} />
        </View>
      </View>

      {/* ── Asset chips ──────────────────────────────────────────────── */}
      <View style={styles.assetRow}>
        <View style={styles.assetChip}>
          <Ionicons name="bicycle-outline" size={12} color={Colors.textSecondary} />
          <Text style={styles.assetChipText}>{booking.vehicle.plate_number}</Text>
        </View>
        <View style={styles.assetChip}>
          <Ionicons name="battery-charging-outline" size={12} color={Colors.textSecondary} />
          <Text style={styles.assetChipText}>{booking.battery.serial_number}</Text>
        </View>
        <Text style={[Typography.caption, { color: Colors.textMuted }]}>#{toNodeId(booking.id)}</Text>
      </View>

      {/* ── Plan + Gate + Due date ───────────────────────────────────── */}
      <View style={styles.planRow}>
        <Text style={[Typography.badgeText, { color: Colors.textSecondary }]}>
          {booking.rental_plan.toUpperCase()}
        </Text>
        <Text style={[Typography.caption, { color: Colors.textMuted }]}>
          · {booking.rental_plan === 'Weekly' ? '100%' : '50%'} PAYMENT GATE
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={[Typography.caption, { color: Colors.textSecondary }]}>
          RETURN DUE: {returnDue}
        </Text>
      </View>

      {/* ── Financial Health ─────────────────────────────────────────── */}
      <Pressable style={styles.financialRow} onPress={() => setFinancialExpanded(v => !v)}>
        <Ionicons name="bar-chart-outline" size={12} color={Colors.textSecondary} />
        <Text style={[Typography.badgeText, { color: Colors.textSecondary, marginLeft: 4 }]}>
          FINANCIAL HEALTH
        </Text>
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(paidPct * 100, 100)}%`, backgroundColor: barColor }]} />
          </View>
        </View>
        <Text style={[Typography.badgeText, { color: barColor }]}>PAID: {paidPctLabel}</Text>
        <Ionicons
          name={financialExpanded ? 'chevron-up' : 'chevron-down'}
          size={12}
          color={Colors.textMuted}
          style={{ marginLeft: 4 }}
        />
      </Pressable>

      {financialExpanded && (
        <View style={styles.financialDetail}>
          <FinLine label="Base Rent" amount={booking.total_amount} />
          <FinLine label="Deposit"   amount={booking.deposit_amount} />
          {booking.fines_amount > 0 && (
            <FinLine label="Fines" amount={booking.fines_amount} color={Colors.statusError} />
          )}
          <FinLine label="Amount Paid" amount={booking.amount_paid} color={Colors.statusActive} />
          <FinLine
            label={`Gate (${booking.rental_plan === 'Weekly' ? '100%' : '50%'})`}
            amount={gate.gateAmount}
            color={Colors.brandTeal}
          />
        </View>
      )}

      {/* ── Actions ──────────────────────────────────────────────────── */}
      {!isClosed && (
        <View style={styles.actionBlock}>
          {/* Asset nav pills (small, grey) */}
          <View style={styles.assetPillRow}>
            <Pressable style={styles.assetPill} onPress={() => onSwap(booking)}>
              <Ionicons name="bicycle-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.assetPillText}>SCOOTER</Text>
            </Pressable>
            <Pressable style={styles.assetPill} onPress={() => onSwap(booking)}>
              <Ionicons name="battery-charging-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.assetPillText}>BATTERY</Text>
            </Pressable>
          </View>

          {/* Primary ops buttons */}
          {isDraft && (
            <Pressable
              style={({ pressed }) => [
                styles.fullBtn, styles.fullBtnCyan,
                { opacity: gate.isCleared ? (pressed ? 0.85 : 1) : 0.45 },
              ]}
              onPress={() => onDispatch(booking)}
              disabled={!gate.isCleared}
            >
              <Ionicons name="rocket-outline" size={16} color={Colors.brandNavy} style={{ marginRight: 6 }} />
              <Text style={[styles.fullBtnText, { color: Colors.brandNavy }]}>DISPATCH RIDE</Text>
            </Pressable>
          )}

          {isActive && (
            <View style={styles.twoColRow}>
              <Pressable
                style={({ pressed }) => [styles.halfBtn, styles.halfBtnOrange, { opacity: pressed ? 0.85 : 1 }]}
                onPress={() => onPause(booking)}
              >
                <Ionicons name="pause-outline" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={[styles.halfBtnText, { color: '#FFFFFF' }]}>PAUSE & DELINK</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.halfBtn, styles.halfBtnGreen, { opacity: pressed ? 0.85 : 1 }]}
                onPress={() => onReturn(booking)}
              >
                <Ionicons name="checkmark-outline" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={[styles.halfBtnText, { color: '#FFFFFF' }]}>RETURN</Text>
              </Pressable>
            </View>
          )}

          {isPaused && (
            <Pressable
              style={({ pressed }) => [styles.fullBtn, styles.halfBtnGreen, { opacity: pressed ? 0.85 : 1 }]}
              onPress={() => onReturn(booking)}
            >
              <Ionicons name="checkmark-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={[styles.fullBtnText, { color: '#FFFFFF' }]}>RETURN VEHICLE</Text>
            </Pressable>
          )}

          {/* Collect cash — always available for non-closed */}
          <Pressable
            style={({ pressed }) => [styles.fullBtn, styles.fullBtnOutline, { opacity: pressed ? 0.82 : 1 }]}
            onPress={() => onCollectCash(booking)}
          >
            <Text style={[styles.fullBtnText, { color: Colors.textSecondary }]}>COLLECT CASH</Text>
          </Pressable>
        </View>
      )}

      {isClosed && (
        <View style={styles.closedRow}>
          <Ionicons
            name={booking.status === 'Completed' ? 'checkmark-circle-outline' : 'close-circle-outline'}
            size={14}
            color={booking.status === 'Completed' ? Colors.statusActive : Colors.textMuted}
          />
          <Text style={[Typography.caption, { color: Colors.textSecondary, marginLeft: 4 }]}>
            {booking.status}
          </Text>
        </View>
      )}
    </View>
  );
}

function FinLine({ label, amount, color = Colors.textPrimary }: { label: string; amount: number; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={[Typography.caption, { color: Colors.textSecondary }]}>{label}</Text>
      <Text style={[Typography.caption, { color, fontWeight: '700' }]}>{formatCurrency(amount)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  cardOverdue: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.statusError,
  },

  // Header
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: Spacing.md, paddingBottom: Spacing.sm, gap: Spacing.sm,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.bgApp, borderWidth: 1, borderColor: Colors.borderLight,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: Colors.textSecondary },
  headerMid:  { flex: 1, gap: 2 },
  riderName:  { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  headerRight:{ alignItems: 'flex-end' },

  // Assets
  assetRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    gap: 6, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
  },
  assetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.bgApp, borderRadius: Radius.sm,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  assetChipText: { ...Typography.caption, color: Colors.textPrimary, fontWeight: '600' },

  // Plan row
  planRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
  },

  // Financial health bar
  financialRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  barTrack: {
    height: 6, borderRadius: Radius.pill,
    backgroundColor: Colors.borderLight, overflow: 'hidden',
  },
  barFill: { height: 6, borderRadius: Radius.pill },
  financialDetail: {
    marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    backgroundColor: Colors.bgApp, borderRadius: Radius.sm, padding: Spacing.sm,
  },

  // Action block
  actionBlock: {
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
    padding: Spacing.md, paddingTop: Spacing.sm, gap: 8,
  },

  assetPillRow: { flexDirection: 'row', gap: 8 },
  assetPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, height: 36, borderRadius: Radius.pill,
    borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.bgApp,
  },
  assetPillText: { ...Typography.badgeText, color: Colors.textSecondary, fontSize: 11 },

  fullBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 48, borderRadius: Radius.pill,
  },
  fullBtnCyan:    { backgroundColor: Colors.brandTeal },
  fullBtnOutline: { borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: 'transparent' },
  fullBtnText:    { ...Typography.buttonPrimary, letterSpacing: 0.5 },

  twoColRow: { flexDirection: 'row', gap: 8 },
  halfBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 48, borderRadius: Radius.pill,
  },
  halfBtnOrange: { backgroundColor: Colors.statusWarning },
  halfBtnGreen:  { backgroundColor: Colors.statusActive },
  halfBtnText:   { ...Typography.buttonPrimary, fontSize: 12 },

  closedRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
});
