// ─────────────────────────────────────────────────────────────────────────────
// BookRideModal — creates a new booking via create_booking RPC
// Enforces: configurable booking cutoff from global_config
// Revenue Protection card recalculates live when plan toggle changes
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/design';
import type { Battery, Customer, GlobalConfig, Vehicle } from '../../lib/database.types';
import {
  calculatePricing,
  createBooking,
  formatCurrency,
  isBookingAllowed,
} from '../../services/bookingService';
import { YanaButton } from '../ui';

interface BookRideModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  storeId: string;
  operatorId: string;
  customers: Customer[];
  vehicles: Vehicle[];
  batteries: Battery[];
  globalConfig: GlobalConfig | null;
}

export function BookRideModal({
  visible,
  onClose,
  onSuccess,
  storeId,
  operatorId,
  customers,
  vehicles,
  batteries,
  globalConfig,
}: BookRideModalProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedBattery, setSelectedBattery] = useState<Battery | null>(null);
  const [plan, setPlan] = useState<'Weekly' | 'Monthly'>('Weekly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableVehicles = vehicles.filter((v) => v.status === 'Available');
  const availableBatteries = batteries.filter((b) => b.status === 'Available');

  const pricing = useMemo(() => {
    if (!globalConfig) return null;
    return calculatePricing(plan, globalConfig);
  }, [plan, globalConfig]);

  const cutoffCheck = isBookingAllowed(globalConfig);

  const canSubmit =
    !!selectedCustomer &&
    !!selectedVehicle &&
    !!selectedBattery &&
    cutoffCheck.allowed;

  const handleSubmit = async () => {
    if (!canSubmit || !pricing) return;
    setLoading(true);
    setError(null);
    try {
      await createBooking({
        p_customer_id: selectedCustomer!.id,
        p_vehicle_id: selectedVehicle!.id,
        p_battery_id: selectedBattery!.id,
        p_store_id: storeId,
        p_rental_plan: plan,
        p_total_amount: pricing.subtotal,
        p_deposit_amount: pricing.securityDeposit,
        p_amount_paid: 0, // cash collected separately via PaymentModal
        p_operator_id: operatorId,
      });
      handleClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedCustomer(null);
    setSelectedVehicle(null);
    setSelectedBattery(null);
    setPlan('Weekly');
    setError(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* Handle */}
        <View style={styles.handle} />

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Title */}
          <View style={styles.titleRow}>
            <Text style={[Typography.h1Screen, { color: Colors.textPrimary }]}>Book Ride</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          {/* Cutoff warning */}
          {!cutoffCheck.allowed && (
            <View style={styles.cutoffBanner}>
              <Text style={styles.cutoffText}>
                🕐 New bookings open at {cutoffCheck.blockedUntil}. Come back then!
              </Text>
            </View>
          )}

          {/* SELECT RIDER */}
          <Text style={[Typography.labelCaps, styles.fieldLabel]}>SELECT RIDER</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {customers.map((c) => (
              <Pressable
                key={c.id}
                style={[styles.chip, selectedCustomer?.id === c.id && styles.chipSelected]}
                onPress={() => setSelectedCustomer(c)}
              >
                <Text style={[styles.chipText, selectedCustomer?.id === c.id && styles.chipTextSelected]}>
                  {c.name}
                </Text>
                <Text style={styles.chipSub}>{c.phone}</Text>
              </Pressable>
            ))}
            {customers.length === 0 && (
              <Text style={styles.emptyChip}>No riders registered at this ZAP Point</Text>
            )}
          </ScrollView>

          {/* SCOOTER + BATTERY */}
          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={[Typography.labelCaps, styles.fieldLabel]}>SCOOTER</Text>
              <ScrollView style={styles.pickerScroll}>
                {availableVehicles.map((v) => (
                  <Pressable
                    key={v.id}
                    style={[styles.listItem, selectedVehicle?.id === v.id && styles.listItemSelected]}
                    onPress={() => setSelectedVehicle(v)}
                  >
                    <Text style={[styles.listItemText, selectedVehicle?.id === v.id && { color: Colors.brandCyan, fontWeight: '700' }]}>
                      🛵 {v.plate_number}
                    </Text>
                  </Pressable>
                ))}
                {availableVehicles.length === 0 && (
                  <Text style={styles.emptyChip}>None available</Text>
                )}
              </ScrollView>
            </View>
            <View style={styles.halfField}>
              <Text style={[Typography.labelCaps, styles.fieldLabel]}>BATTERY</Text>
              <ScrollView style={styles.pickerScroll}>
                {availableBatteries.map((b) => (
                  <Pressable
                    key={b.id}
                    style={[styles.listItem, selectedBattery?.id === b.id && styles.listItemSelected]}
                    onPress={() => setSelectedBattery(b)}
                  >
                    <Text style={[styles.listItemText, selectedBattery?.id === b.id && { color: Colors.brandCyan, fontWeight: '700' }]}>
                      ⚡ {b.serial_number}
                    </Text>
                  </Pressable>
                ))}
                {availableBatteries.length === 0 && (
                  <Text style={styles.emptyChip}>None available</Text>
                )}
              </ScrollView>
            </View>
          </View>

          {/* PLAN TOGGLE */}
          <Text style={[Typography.labelCaps, styles.fieldLabel]}>SUBSCRIPTION PLAN</Text>
          <View style={styles.planToggle}>
            {(['Weekly', 'Monthly'] as const).map((p) => (
              <Pressable
                key={p}
                style={[styles.planBtn, plan === p && styles.planBtnSelected]}
                onPress={() => setPlan(p)}
              >
                <Text style={[styles.planBtnText, plan === p && styles.planBtnTextSelected]}>
                  {p.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* REVENUE PROTECTION CARD */}
          {pricing && (
            <View style={styles.revenueCard}>
              <Text style={styles.revenueTitle}>💰 REVENUE PROTECTION</Text>
              <RevenueLine label={`Base Rent (${plan})`} amount={pricing.baseRent} />
              <RevenueLine label={`GST (${globalConfig?.gst_percentage ?? 18}%)`} amount={pricing.gstAmount} />
              <RevenueLine label="Subtotal" amount={pricing.subtotal} valueStyle={{ color: Colors.brandCyan }} />
              <View style={styles.revenueDivider} />
              <RevenueLine label="Security Deposit" amount={pricing.securityDeposit} />
              <View style={styles.revenueDivider} />
              <View style={styles.dispatchRow}>
                <Text style={styles.dispatchLabel}>DISPATCH LIMIT (100%)</Text>
                <Text style={styles.dispatchAmount}>{formatCurrency(pricing.dispatchLimit)}</Text>
              </View>
            </View>
          )}

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {error}</Text>
            </View>
          )}

          <View style={{ height: Spacing.xl }} />
        </ScrollView>

        {/* Actions */}
        <View style={styles.actionBar}>
          <YanaButton label="Cancel" variant="ghost" onPress={handleClose} style={styles.cancelBtn} />
          <YanaButton
            label="Register Booking"
            variant="primary"
            disabled={!canSubmit}
            loading={loading}
            onPress={handleSubmit}
            style={styles.submitBtn}
          />
        </View>
      </View>
    </Modal>
  );
}

function RevenueLine({
  label,
  amount,
  valueStyle,
}: {
  label: string;
  amount: number;
  valueStyle?: object;
}) {
  return (
    <View style={styles.revenueLine}>
      <Text style={styles.revenueLineLabel}>{label}</Text>
      <Text style={[styles.revenueLineAmount, valueStyle]}>{formatCurrency(amount)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgApp },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.borderLight,
    alignSelf: 'center',
    marginTop: 10, marginBottom: 8,
  },
  scroll: { flex: 1, paddingHorizontal: Spacing.md },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    marginTop: Spacing.sm,
  },
  closeBtn: { fontSize: 20, color: Colors.textSecondary, padding: 4 },

  cutoffBanner: {
    backgroundColor: '#FFF8E1',
    borderLeftWidth: 4,
    borderLeftColor: Colors.amber,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
  },
  cutoffText: { color: Colors.amber, ...Typography.bodySecondary, fontWeight: '600' },

  fieldLabel: {
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  chipScroll: { marginBottom: Spacing.sm },
  chip: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.badge + 4,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: Spacing.sm,
    minWidth: 120,
  },
  chipSelected: { borderColor: Colors.brandCyan, backgroundColor: '#E0FDFF' },
  chipText: { ...Typography.bodySecondary, color: Colors.textPrimary, fontWeight: '600' },
  chipTextSelected: { color: Colors.brandCyan },
  chipSub: { ...Typography.bodySecondary, color: Colors.textSecondary, marginTop: 2 },
  emptyChip: { ...Typography.bodySecondary, color: Colors.textSecondary, padding: 8 },

  row: { flexDirection: 'row', gap: Spacing.sm },
  halfField: { flex: 1 },
  pickerScroll: {
    maxHeight: 160,
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  listItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  listItemSelected: { backgroundColor: '#E0FDFF' },
  listItemText: { ...Typography.bodySecondary, color: Colors.textPrimary },

  planToggle: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  planBtn: {
    flex: 1, height: 48, borderRadius: Radius.button,
    borderWidth: 1.5, borderColor: Colors.borderInput,
    alignItems: 'center', justifyContent: 'center',
  },
  planBtnSelected: { borderColor: Colors.brandCyan, backgroundColor: '#E0FDFF' },
  planBtnText: { ...Typography.buttonSecondary, color: Colors.textSecondary },
  planBtnTextSelected: { color: Colors.brandCyan, fontWeight: '700' },

  revenueCard: {
    backgroundColor: Colors.brandNavy,
    borderRadius: Radius.card,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  revenueTitle: {
    color: Colors.brandCyan,
    ...Typography.labelCaps,
    marginBottom: Spacing.md,
    fontSize: 13,
  },
  revenueLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  revenueLineLabel: { color: 'rgba(255,255,255,0.7)', ...Typography.bodySecondary },
  revenueLineAmount: { color: Colors.brandWhite, ...Typography.bodySecondary, fontWeight: '600' },
  revenueDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 8 },
  dispatchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  dispatchLabel: { color: Colors.brandCyan, ...Typography.labelCaps, fontSize: 12 },
  dispatchAmount: { color: Colors.brandWhite, fontSize: 22, fontWeight: '800' },

  errorBox: {
    backgroundColor: Colors.overdueCardBg,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.statusOverdue,
  },
  errorText: { color: Colors.statusOverdue, ...Typography.bodySecondary },

  actionBar: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.surfaceCard,
  },
  cancelBtn: { flex: 1 },
  submitBtn: { flex: 2 },
});
