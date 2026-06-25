// ─────────────────────────────────────────────────────────────────────────────
// PaymentModal — records a payment via record_payment RPC
// Shows current gate status before + after payment
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/design';
import type { BookingWithDetails } from '../../lib/database.types';
import {
  calculatePaymentGate,
  formatCurrency,
  recordPayment,
} from '../../services/bookingService';
import { Divider, YanaButton } from '../ui';

interface PaymentModalProps {
  visible: boolean;
  booking: BookingWithDetails | null;
  onClose: () => void;
  onSuccess: () => void;
  storeId: string;
  operatorId: string;
}

export function PaymentModal({
  visible,
  booking,
  onClose,
  onSuccess,
  storeId,
  operatorId,
}: PaymentModalProps) {
  const [cashAmount, setCashAmount] = useState('');
  const [onlineAmount, setOnlineAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cashParsed = parseFloat(cashAmount) || 0;
  const onlineParsed = parseFloat(onlineAmount) || 0;
  const totalEntered = cashParsed + onlineParsed;

  const gate = booking
    ? calculatePaymentGate(
        booking.rental_plan,
        booking.total_amount,
        booking.deposit_amount,
        booking.fines_amount,
        booking.amount_paid,
        booking.start_date,
        booking.end_date,
      )
    : null;

  // Preview: what gate looks like after this payment
  const previewAmount = totalEntered;
  const gateAfter = booking
    ? calculatePaymentGate(
        booking.rental_plan,
        booking.total_amount,
        booking.deposit_amount,
        booking.fines_amount,
        booking.amount_paid + previewAmount,
        booking.start_date,
        booking.end_date,
      )
    : null;

  const handleSubmit = async () => {
    if (!booking) return;
    if (totalEntered <= 0) {
      setError('Enter a valid cash or online amount');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await recordPayment({
        p_booking_id: booking.id,
        p_store_id: storeId,
        p_cash_amount: cashParsed,
        p_online_amount: onlineParsed,
        p_operator_id: operatorId,
      });
      handleClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCashAmount('');
    setOnlineAmount('');
    setError(null);
    onClose();
  };

  if (!booking) return null;

  const overdueFine = gate ? gate.overdueFine : 0;
  const totalFines = booking.fines_amount + overdueFine;
  const balanceDue = booking.total_amount + booking.deposit_amount + totalFines - booking.amount_paid;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.handle} />

        <View style={styles.content}>
          {/* Title */}
          <View style={styles.titleRow}>
            <Text style={[Typography.h1Screen, { color: Colors.textPrimary }]}>Collect Payment</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          {/* Rider summary */}
          <View style={styles.riderRow}>
            <Text style={[Typography.bodyPrimary, { fontWeight: '700', color: Colors.textPrimary }]}>
              {booking.customer.name}
            </Text>
            <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>
              {booking.rental_plan} · {booking.vehicle?.plate_number ?? 'No Vehicle'}
            </Text>
          </View>

          <Divider />

          {/* Payment breakdown */}
          <PaymentLine label="Total Rent" amount={booking.total_amount} />
          <PaymentLine label="Security Deposit" amount={booking.deposit_amount} />
          {totalFines > 0 && (
            <PaymentLine label="Fines" amount={totalFines} valueColor={Colors.statusOverdue} />
          )}
          <PaymentLine label="Already Paid" amount={booking.amount_paid} valueColor={Colors.statusActive} />

          <View style={styles.balanceRow}>
            <Text style={[Typography.bodyPrimary, { fontWeight: '700', color: Colors.textPrimary }]}>
              Balance Due
            </Text>
            <Text style={[Typography.bodyPrimary, { fontWeight: '800', color: Colors.statusOverdue }]}>
              {formatCurrency(balanceDue)}
            </Text>
          </View>

          <Divider />

          {/* Gate status */}
          <View style={styles.gateRow}>
            <Text style={[Typography.labelCaps, { color: Colors.textSecondary }]}>
              PAYMENT GATE ({booking.rental_plan === 'Weekly' ? '100%' : '50%'})
            </Text>
            <Text style={[Typography.bodySecondary, {
              color: gate?.isCleared ? Colors.statusActive : Colors.statusOverdue,
              fontWeight: '700',
            }]}>
              {gate?.isCleared ? '✓ CLEARED' : `Need ${formatCurrency((gate?.gateAmount ?? 0) - booking.amount_paid)} more`}
            </Text>
          </View>

          {/* Cash & Online Split Inputs */}
          <View style={styles.inputsRow}>
            <View style={styles.inputCol}>
              <Text style={[Typography.labelCaps, styles.fieldLabel]}>CASH PAYMENT (₹)</Text>
              <TextInput
                style={styles.splitAmountInput}
                value={cashAmount}
                onChangeText={(t) => { setCashAmount(t); setError(null); }}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={[Typography.labelCaps, styles.fieldLabel]}>ONLINE PAYMENT (₹)</Text>
              <TextInput
                style={styles.splitAmountInput}
                value={onlineAmount}
                onChangeText={(t) => { setOnlineAmount(t); setError(null); }}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
          </View>

          {/* Total display box */}
          {totalEntered > 0 && (
            <View style={styles.totalCollectedBox}>
              <Text style={[Typography.labelCaps, { color: Colors.textSecondary, fontSize: 10 }]}>TOTAL COLLECTED</Text>
              <Text style={[Typography.h1Screen, { color: Colors.brandTeal, fontWeight: '800', marginTop: 4, fontSize: 24 }]}>
                {formatCurrency(totalEntered)}
              </Text>
            </View>
          )}

          {/* Preview */}
          {previewAmount > 0 && gateAfter && (
            <View style={styles.previewBox}>
              <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>
                After this payment — Gate:
              </Text>
              <Text style={[Typography.bodySecondary, {
                color: gateAfter.isCleared ? Colors.statusActive : Colors.statusWarning,
                fontWeight: '700',
                marginLeft: 6,
              }]}>
                {gateAfter.isCleared ? '✓ WILL BE CLEARED' : `${Math.round(gateAfter.paidPct * 100)}% paid`}
              </Text>
            </View>
          )}

          {error && (
            <Text style={styles.errorText}>⚠ {error}</Text>
          )}
        </View>

        <View style={styles.actionBar}>
          <YanaButton label="Cancel" variant="ghost" onPress={handleClose} style={styles.cancelBtn} />
          <YanaButton
            label="Confirm Payment"
            variant="primary"
            loading={loading}
            disabled={totalEntered <= 0}
            onPress={handleSubmit}
            style={styles.submitBtn}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PaymentLine({ label, amount, valueColor = Colors.textPrimary }: { label: string; amount: number; valueColor?: string }) {
  return (
    <View style={styles.paymentLine}>
      <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>{label}</Text>
      <Text style={[Typography.bodySecondary, { color: valueColor, fontWeight: '600' }]}>{formatCurrency(amount)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgApp },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight, alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  content: { flex: 1, paddingHorizontal: Spacing.md },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md, marginTop: Spacing.sm },
  closeBtn: { fontSize: 20, color: Colors.textSecondary, padding: 4 },
  riderRow: { marginBottom: Spacing.md, gap: 4 },
  paymentLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, marginTop: 4 },
  gateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: Spacing.sm },
  fieldLabel: { color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.md },
  amountInput: {
    height: 60, backgroundColor: Colors.surfaceCard, borderRadius: Radius.card,
    borderWidth: 1.5, borderColor: Colors.brandCyan,
    paddingHorizontal: Spacing.md, fontSize: 28, fontWeight: '700', color: Colors.textPrimary,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  inputCol: {
    flex: 1,
  },
  splitAmountInput: {
    height: 52, backgroundColor: Colors.surfaceCard, borderRadius: Radius.input,
    borderWidth: 1.5, borderColor: Colors.brandCyan,
    paddingHorizontal: Spacing.sm, fontSize: 20, fontWeight: '700', color: Colors.textPrimary,
    textAlign: 'center',
  },
  totalCollectedBox: {
    marginTop: Spacing.md,
    backgroundColor: Colors.bgApp,
    padding: Spacing.md,
    borderRadius: Radius.card,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  previewBox: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm, backgroundColor: Colors.bgApp, padding: Spacing.sm, borderRadius: Radius.sm },
  errorText: { color: Colors.statusOverdue, ...Typography.bodySecondary, marginTop: Spacing.sm },
  actionBar: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.borderLight, backgroundColor: Colors.surfaceCard },
  cancelBtn: { flex: 1 },
  submitBtn: { flex: 2 },
});
