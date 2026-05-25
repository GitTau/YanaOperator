// ─────────────────────────────────────────────────────────────────────────────
// RentalCard v4 — Softer, more premium aesthetic
// Refined borders, shadow-like depth, tighter information hierarchy
// Checklist gate before Return/Pause (per AGENTS.md business rules)
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

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        {/* Name + phone */}
        <View style={styles.headerMid}>
          <Text style={styles.riderName} numberOfLines={1}>{booking.customer.name}</Text>
          <View style={styles.phoneRow}>
            <Ionicons name="call-outline" size={10} color={Colors.textMuted} />
            <Text style={[Typography.caption, { color: Colors.textMuted, marginLeft: 3 }]}>
              {booking.customer.phone}
            </Text>
          </View>
        </View>

        {/* Status badges */}
        <View style={styles.headerRight}>
          <StatusBadge status={booking.status} />
          <View style={{ height: 4 }} />
          <PaymentGateBadge isCleared={gate.isCleared} />
        </View>
      </View>

      {/* ── Thin separator ───────────────────────────────────────────── */}
      <View style={styles.sep} />

      {/* ── Asset + meta row ─────────────────────────────────────────── */}
      <View style={styles.metaRow}>
        <View style={styles.assetChip}>
          <Ionicons name="bicycle-outline" size={11} color={Colors.brandTeal} />
          <Text style={styles.assetChipText}>{booking.vehicle.plate_number}</Text>
        </View>
        <View style={styles.assetChip}>
          <Ionicons name="battery-charging-outline" size={11} color={Colors.brandTeal} />
          <Text style={styles.assetChipText}>{booking.battery.serial_number}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={styles.nodeId}>#{toNodeId(booking.id)}</Text>
      </View>

      {/* ── Plan + due date ──────────────────────────────────────────── */}
      <View style={styles.planRow}>
        <View style={styles.planChip}>
          <Text style={styles.planChipText}>{booking.rental_plan.toUpperCase()}</Text>
        </View>
        <Text style={styles.planGateLabel}>
          · {booking.rental_plan === 'Weekly' ? '100% gate' : 'min ₹4,000 gate'}
        </Text>
        <View style={{ flex: 1 }} />
        <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} style={{ marginRight: 3 }} />
        <Text style={styles.dueLabel}>Due {returnDue}</Text>
      </View>

      {/* ── Financial Health ──────────────────────────────────────────── */}
      <Pressable style={styles.financialRow} onPress={() => setFinancialExpanded(v => !v)}>
        <View style={[styles.finDot, { backgroundColor: barColor }]} />
        <Text style={[Typography.badgeText, { color: Colors.textSecondary, marginLeft: 6, flex: 1 }]}>
          FINANCIAL HEALTH
        </Text>
        <View style={styles.barTrackWrap}>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(paidPct * 100, 100)}%`, backgroundColor: barColor }]} />
          </View>
        </View>
        <Text style={[Typography.badgeText, { color: barColor, marginLeft: 8, minWidth: 52, textAlign: 'right' }]}>
          PAID: {paidPctLabel}
        </Text>
        <Ionicons
          name={financialExpanded ? 'chevron-up' : 'chevron-down'}
          size={11}
          color={Colors.textMuted}
          style={{ marginLeft: 4 }}
        />
      </Pressable>

      {financialExpanded && (
        <View style={styles.financialDetail}>
          <FinLine label="Base Rent"   amount={booking.total_amount} />
          <FinLine label="Deposit"     amount={booking.deposit_amount} />
          {booking.fines_amount > 0 && (
            <FinLine label="Fines" amount={booking.fines_amount} color={Colors.statusError} />
          )}
          <FinLine label="Amount Paid" amount={booking.amount_paid} color={Colors.statusActive} />
          <View style={styles.finDivider} />
          <FinLine
            label={booking.rental_plan === 'Weekly' ? 'Gate (100%)' : 'Gate (min ₹4,000)'}
            amount={gate.gateAmount}
            color={Colors.brandTeal}
          />
        </View>
      )}

      {/* ── Actions ──────────────────────────────────────────────────── */}
      {!isClosed && (
        <View style={styles.actionBlock}>
          {/* Asset pills */}
          <View style={styles.assetPillRow}>
            <Pressable style={styles.assetPill} onPress={() => onSwap(booking)}>
              <Ionicons name="bicycle-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.assetPillText}>SWAP SCOOTER</Text>
            </Pressable>
            <Pressable style={styles.assetPill} onPress={() => onSwap(booking)}>
              <Ionicons name="battery-charging-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.assetPillText}>SWAP BATTERY</Text>
            </Pressable>
          </View>

          {/* Draft → Dispatch */}
          {isDraft && (
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                gate.isCleared ? styles.primaryBtnActive : styles.primaryBtnLocked,
                { opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={() => onDispatch(booking)}
              disabled={!gate.isCleared}
            >
              <Ionicons
                name={gate.isCleared ? 'rocket-outline' : 'lock-closed-outline'}
                size={15}
                color={gate.isCleared ? Colors.brandNavy : Colors.textMuted}
                style={{ marginRight: 7 }}
              />
              <View>
                <Text style={[styles.primaryBtnText, { color: gate.isCleared ? Colors.brandNavy : Colors.textMuted }]}>
                  DISPATCH RIDE
                </Text>
                {!gate.isCleared && (
                  <Text style={styles.gateLockHint}>Clear payment gate first</Text>
                )}
              </View>
            </Pressable>
          )}

          {/* Active → Pause + Return */}
          {isActive && (
            <View style={styles.twoColRow}>
              <Pressable
                style={({ pressed }) => [styles.halfBtn, styles.halfBtnOrange, { opacity: pressed ? 0.85 : 1 }]}
                onPress={() => onPause(booking)}
              >
                <Ionicons name="pause-outline" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={[styles.halfBtnText, { color: '#FFFFFF' }]}>PAUSE</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.halfBtn, styles.halfBtnGreen, { opacity: pressed ? 0.85 : 1 }]}
                onPress={() => onReturn(booking)}
              >
                <Ionicons name="checkmark-circle-outline" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={[styles.halfBtnText, { color: '#FFFFFF' }]}>RETURN</Text>
              </Pressable>
            </View>
          )}

          {/* Paused → Return */}
          {isPaused && (
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, styles.halfBtnGreen, { opacity: pressed ? 0.85 : 1 }]}
              onPress={() => onReturn(booking)}
            >
              <Ionicons name="checkmark-circle-outline" size={15} color="#FFFFFF" style={{ marginRight: 7 }} />
              <Text style={[styles.primaryBtnText, { color: '#FFFFFF' }]}>RETURN VEHICLE</Text>
            </Pressable>
          )}

          {/* Collect cash — always */}
          <Pressable
            style={({ pressed }) => [styles.ghostBtn, { opacity: pressed ? 0.75 : 1 }]}
            onPress={() => onCollectCash(booking)}
          >
            <Ionicons name="cash-outline" size={14} color={Colors.textSecondary} style={{ marginRight: 6 }} />
            <Text style={styles.ghostBtnText}>COLLECT CASH</Text>
          </Pressable>
        </View>
      )}

      {isClosed && (
        <View style={styles.closedRow}>
          <Ionicons
            name={booking.status === 'Completed' ? 'checkmark-circle' : 'close-circle'}
            size={14}
            color={booking.status === 'Completed' ? Colors.statusActive : Colors.textMuted}
          />
          <Text style={[Typography.caption, { color: Colors.textSecondary, marginLeft: 5 }]}>
            {booking.status === 'Completed' ? 'Completed — vehicle returned' : 'Cancelled'}
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECEEF4',
    marginBottom: 12,
    // Soft shadow for depth
    shadowColor: '#B0BAD0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'visible',
  },
  cardOverdue: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.statusError,
    borderColor: '#FECACA',
  },

  // ── Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    paddingBottom: 12,
    gap: Spacing.sm,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.surfaceTeal,
    borderWidth: 1.5,
    borderColor: '#B2EBF5',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText:  { fontSize: 15, fontWeight: '800', color: Colors.brandTeal },
  headerMid:   { flex: 1, gap: 3 },
  phoneRow:    { flexDirection: 'row', alignItems: 'center' },
  riderName:   { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.2 },
  headerRight: { alignItems: 'flex-end', gap: 4 },

  sep: {
    height: 1,
    backgroundColor: '#F0F2F7',
    marginHorizontal: Spacing.md,
  },

  // ── Meta row
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  assetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDFF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#B2EBF5',
  },
  assetChipText: { ...Typography.caption, color: Colors.brandTeal, fontWeight: '700' },
  nodeId: { ...Typography.caption, color: Colors.textMuted, fontSize: 10 },

  // ── Plan row
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: 10,
    gap: 4,
  },
  planChip: {
    backgroundColor: Colors.bgApp,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  planChipText:  { ...Typography.badgeText, color: Colors.textSecondary, fontSize: 10 },
  planGateLabel: { ...Typography.caption, color: Colors.textMuted },
  dueLabel:      { ...Typography.caption, color: Colors.textSecondary, fontWeight: '600' },

  // ── Financial Health
  financialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#F0F2F7',
  },
  finDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  barTrackWrap: { flex: 1, marginHorizontal: 10 },
  barTrack: {
    height: 5,
    borderRadius: 100,
    backgroundColor: '#EDF0F7',
    overflow: 'hidden',
  },
  barFill: { height: 5, borderRadius: 100 },
  financialDetail: {
    marginHorizontal: Spacing.md,
    marginBottom: 12,
    backgroundColor: Colors.bgApp,
    borderRadius: 10,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: '#F0F2F7',
  },
  finDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 4,
  },

  // ── Actions
  actionBlock: {
    borderTopWidth: 1,
    borderTopColor: '#F0F2F7',
    padding: Spacing.md,
    paddingTop: 12,
    gap: 8,
  },

  assetPillRow: { flexDirection: 'row', gap: 8 },
  assetPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.bgApp,
  },
  assetPillText: { ...Typography.badgeText, color: Colors.textSecondary, fontSize: 10 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  primaryBtnActive: { backgroundColor: Colors.brandTeal },
  primaryBtnLocked: {
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  primaryBtnText: {
    ...Typography.buttonPrimary,
    letterSpacing: 0.5,
  },
  gateLockHint: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
    textAlign: 'center',
  },

  twoColRow: { flexDirection: 'row', gap: 8 },
  halfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
  },
  halfBtnOrange: { backgroundColor: Colors.statusWarning },
  halfBtnGreen:  { backgroundColor: Colors.statusActive },
  halfBtnText:   { ...Typography.buttonPrimary, fontSize: 12, letterSpacing: 0.3 },

  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ECEEF4',
    backgroundColor: Colors.bgApp,
  },
  ghostBtnText: { ...Typography.badgeText, color: Colors.textSecondary },

  closedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F2F7',
    gap: 5,
  },
});
