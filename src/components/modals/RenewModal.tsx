// ─────────────────────────────────────────────────────────────────────────────
// RenewModal — handles subscription renewals for overdue active bookings
// Enforces: carryover of deposit, payment validation for fines backlog
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/design';
import type { Battery, BookingWithDetails, GlobalConfig, Vehicle } from '../../lib/database.types';
import {
  calculateOverdueFines,
  calculatePaymentGate,
  calculatePricing,
  formatCurrency,
  formatLocalDate,
  parseLocalDate,
  renewBooking,
} from '../../services/bookingService';
import { Divider, YanaButton } from '../ui';
import { ChecklistModal } from './ChecklistModal';

const addDays = (dateString: string, days: number): string => {
  try {
    const d = parseLocalDate(dateString);
    if (!d || isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + days);
    return formatLocalDate(d);
  } catch {
    return '';
  }
};

interface RenewModalProps {
  visible: boolean;
  booking: BookingWithDetails | null;
  onClose: () => void;
  onSuccess: () => void;
  storeId: string;
  operatorId: string;
  availableVehicles: Vehicle[];
  availableBatteries: Battery[];
  globalConfig: GlobalConfig | null;
}

export function RenewModal({
  visible,
  booking,
  onClose,
  onSuccess,
  storeId,
  operatorId,
  availableVehicles,
  availableBatteries,
  globalConfig,
}: RenewModalProps) {
  const [plan, setPlan] = useState<'Weekly' | 'Monthly'>('Weekly');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedBattery, setSelectedBattery] = useState<Battery | null>(null);

  // Split payment inputs
  const [cashAmount, setCashAmount] = useState('');
  const [onlineAmount, setOnlineAmount] = useState('');

  // Dropdown open states
  const [openDropdown, setOpenDropdown] = useState<'vehicle' | 'battery' | null>(null);

  // Checklist gates for exchanges
  const [checklistActive, setChecklistActive] = useState<'vehicle' | 'battery' | null>(null);
  const [checklistFines, setChecklistFines] = useState(0);
  const [checklistHasIssues, setChecklistHasIssues] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [paymentExpanded, setPaymentExpanded] = useState(false);

  // Prepopulated start date is today
  const startDate = useMemo(() => formatLocalDate(new Date()), []);
  const endDate = useMemo(() => {
    const days = plan === 'Weekly' ? 6 : 29;
    return addDays(startDate, days);
  }, [startDate, plan]);

  // Derived assets
  const currentVehicle = booking?.vehicle;
  const currentBattery = booking?.battery;

  const vehicleToUse = selectedVehicle || currentVehicle || null;
  const batteryToUse = selectedBattery || currentBattery || null;

  // Pricing of the new plan
  const pricing = useMemo(() => {
    if (!globalConfig) return null;
    return calculatePricing(plan, globalConfig);
  }, [plan, globalConfig]);

  // Financial status of the old booking
  const oldBookingDues = useMemo(() => {
    if (!booking) return { totalFines: 0, balanceDue: 0 };
    const { overdueFine } = calculateOverdueFines(
      booking.rental_plan,
      booking.start_date,
      booking.end_date,
      booking.total_amount,
      booking.deposit_amount,
      booking.amount_paid,
      booking.status,
      booking.paused_at,
    );
    const totalFines = booking.fines_amount + overdueFine + checklistFines;
    const balanceDue = booking.total_amount + booking.deposit_amount + totalFines - booking.amount_paid;
    return {
      totalFines,
      balanceDue: Math.max(0, balanceDue),
    };
  }, [booking, checklistFines]);

  // Calculations
  const newRent = pricing?.subtotal ?? 0;
  const oldOutstanding = oldBookingDues.balanceDue;
  const totalToCollect = newRent + oldOutstanding;

  // Next subscription gate amount (how much more cash we need to collect for the new booking to clear the gate)
  const newBookingGate = useMemo(() => {
    if (!pricing) return 0;
    const gate = calculatePaymentGate(
      plan,
      newRent,
      pricing.securityDeposit,
      0, // fines_amount
      pricing.securityDeposit, // amount_paid (deposit transfers over)
      startDate,
      endDate,
      'Active'
    );
    return Math.max(0, gate.gateAmount - pricing.securityDeposit);
  }, [plan, newRent, pricing, startDate, endDate]);

  const minPaymentRequired = oldOutstanding + newBookingGate;

  const cashParsed = parseFloat(cashAmount) || 0;
  const onlineParsed = parseFloat(onlineAmount) || 0;
  const totalEntered = cashParsed + onlineParsed;

  const hasEnteredMinPayment = totalEntered >= minPaymentRequired;

  const handleChecklistComplete = (hasIssues: boolean, totalDamageFines: number) => {
    setChecklistHasIssues(hasIssues);
    setChecklistFines(prev => prev + totalDamageFines);
    
    // Open selector for the swapped asset type
    const type = checklistActive;
    setChecklistActive(null);
    if (type === 'vehicle') {
      setOpenDropdown('vehicle');
    } else if (type === 'battery') {
      setOpenDropdown('battery');
    }
  };

  const handleClose = () => {
    setPlan('Weekly');
    setSelectedVehicle(null);
    setSelectedBattery(null);
    setCashAmount('');
    setOnlineAmount('');
    setOpenDropdown(null);
    setChecklistActive(null);
    setChecklistFines(0);
    setChecklistHasIssues(false);
    setError(null);
    setPaymentExpanded(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!booking || !pricing) return;
    if (!hasEnteredMinPayment) {
      setError(`Must collect at least ${formatCurrency(minPaymentRequired)} to clear old backlog and next subscription gate.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await renewBooking({
        oldBookingId: booking.id,
        oldVehicleId: booking.vehicle_id,
        oldBatteryId: booking.battery_id,
        newVehicleId: vehicleToUse?.id ?? booking.vehicle_id,
        newBatteryId: batteryToUse?.id ?? booking.battery_id,
        newPlan: plan,
        newRentAmount: pricing.subtotal,
        newDepositAmount: pricing.securityDeposit,
        cashAmountCollected: cashParsed,
        onlineAmountCollected: onlineParsed,
        oldBookingBalance: oldOutstanding,
        customerId: booking.customer_id,
        operatorId,
        storeId,
        startDate,
        endDate,
        hasIssues: checklistHasIssues,
      });
      handleClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Renewal failed');
    } finally {
      setLoading(false);
    }
  };

  if (!booking) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.handle} />

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Title */}
          <View style={styles.titleRow}>
            <View>
              <Text style={[Typography.overline, { color: Colors.textSecondary }]}>RENEW SUBSCRIPTION</Text>
              <Text style={[Typography.h1Screen, { color: Colors.textPrimary, marginTop: 2 }]}>
                {booking.customer.name}
              </Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          {/* Plan Selector */}
          <View style={styles.section}>
            <Text style={[Typography.labelCaps, styles.fieldLabel]}>SELECT RENTAL PLAN</Text>
            <View style={styles.planToggle}>
              {(['Weekly', 'Monthly'] as const).map(p => (
                <Pressable
                  key={p}
                  style={[styles.planBtn, plan === p && styles.planBtnActive]}
                  onPress={() => setPlan(p)}
                >
                  <Text style={[styles.planBtnText, plan === p && styles.planBtnTextActive]}>
                    {p.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Prepopulated Dates */}
          <View style={styles.datesBox}>
            <View style={styles.dateCol}>
              <Text style={[Typography.labelCaps, styles.dateLabel]}>START DATE</Text>
              <Text style={styles.dateVal}>{startDate}</Text>
              <Text style={styles.dateHint}>(Today)</Text>
            </View>
            <View style={styles.dateArrow}>
              <Ionicons name="arrow-forward-outline" size={16} color={Colors.textMuted} />
            </View>
            <View style={styles.dateCol}>
              <Text style={[Typography.labelCaps, styles.dateLabel]}>END DATE</Text>
              <Text style={styles.dateVal}>{endDate}</Text>
              <Text style={styles.dateHint}>({plan === 'Weekly' ? '6 days' : '29 days'})</Text>
            </View>
          </View>

          {/* Vehicle and Battery Section */}
          <View style={styles.section}>
            <Text style={[Typography.labelCaps, styles.fieldLabel]}>VEHICLE & BATTERY</Text>
            
            {/* Scooter Row */}
            <View style={styles.assetRow}>
              <View style={styles.assetInfo}>
                <Ionicons name="bicycle-outline" size={18} color={Colors.brandTeal} style={{ marginRight: 8 }} />
                <Text style={styles.assetText}>
                  Scooter: <Text style={{ fontWeight: '700' }}>{vehicleToUse?.plate_number ?? 'None'}</Text>
                </Text>
                {selectedVehicle && <Text style={styles.swappedBadge}>SWAPPED</Text>}
              </View>
              <Pressable
                style={styles.exchangeBtn}
                onPress={() => setChecklistActive('vehicle')}
              >
                <Text style={styles.exchangeBtnText}>Exchange</Text>
              </Pressable>
            </View>

            {/* Scooter Swapper Selector */}
            {openDropdown === 'vehicle' && (
              <View style={styles.dropdownWrap}>
                <Text style={styles.dropdownTitle}>Select New Scooter</Text>
                <ScrollView style={styles.dropdownScroll} nestedScrollEnabled={true}>
                  {availableVehicles.map(v => (
                    <Pressable
                      key={v.id}
                      style={[styles.dropdownItem, selectedVehicle?.id === v.id && styles.dropdownItemActive]}
                      onPress={() => {
                        setSelectedVehicle(v);
                        setOpenDropdown(null);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, selectedVehicle?.id === v.id && { color: Colors.brandTeal }]}>
                        🛵 {v.plate_number}
                      </Text>
                    </Pressable>
                  ))}
                  {availableVehicles.length === 0 && (
                    <Text style={styles.emptyText}>No available vehicles at this ZAP Point</Text>
                  )}
                </ScrollView>
              </View>
            )}

            {/* Battery Row */}
            <View style={[styles.assetRow, { marginTop: Spacing.sm }]}>
              <View style={styles.assetInfo}>
                <Ionicons name="battery-charging-outline" size={18} color={Colors.brandTeal} style={{ marginRight: 8 }} />
                <Text style={styles.assetText}>
                  Battery: <Text style={{ fontWeight: '700' }}>{batteryToUse?.serial_number ?? 'None'}</Text>
                </Text>
                {selectedBattery && <Text style={styles.swappedBadge}>SWAPPED</Text>}
              </View>
              <Pressable
                style={styles.exchangeBtn}
                onPress={() => setChecklistActive('battery')}
              >
                <Text style={styles.exchangeBtnText}>Exchange</Text>
              </Pressable>
            </View>

            {/* Battery Swapper Selector */}
            {openDropdown === 'battery' && (
              <View style={styles.dropdownWrap}>
                <Text style={styles.dropdownTitle}>Select New Battery</Text>
                <ScrollView style={styles.dropdownScroll} nestedScrollEnabled={true}>
                  {availableBatteries.map(b => (
                    <Pressable
                      key={b.id}
                      style={[styles.dropdownItem, selectedBattery?.id === b.id && styles.dropdownItemActive]}
                      onPress={() => {
                        setSelectedBattery(b);
                        setOpenDropdown(null);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, selectedBattery?.id === b.id && { color: Colors.brandTeal }]}>
                        ⚡ {b.serial_number}
                      </Text>
                    </Pressable>
                  ))}
                  {availableBatteries.length === 0 && (
                    <Text style={styles.emptyText}>No available batteries at this ZAP Point</Text>
                  )}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Cash Collection Section */}
          <Pressable style={styles.cashTotalBox} onPress={() => setPaymentExpanded(v => !v)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cashTotalLabel}>TOTAL CASH TO COLLECT</Text>
              <Text style={styles.cashTotalVal}>{formatCurrency(totalToCollect)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
              <Text style={styles.minRequiredText}>
                Min: {formatCurrency(minPaymentRequired)}
              </Text>
              <Ionicons
                name={paymentExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.brandNavy}
                style={{ marginTop: 4 }}
              />
            </View>
          </Pressable>

          {paymentExpanded && (
            <View style={styles.paymentDetail}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>New Rent ({plan})</Text>
                <Text style={styles.breakdownVal}>{formatCurrency(newRent)}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Security Deposit</Text>
                <Text style={[styles.breakdownVal, { color: Colors.statusActive }]}>Transferred (₹0)</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Old Fines & Dues</Text>
                <Text style={[styles.breakdownVal, { color: Colors.statusError }]}>{formatCurrency(oldOutstanding)}</Text>
              </View>
              <Divider style={{ marginVertical: 8 }} />
              
              <View style={styles.inputsRow}>
                <View style={styles.inputCol}>
                  <Text style={[Typography.labelCaps, styles.fieldLabel]}>CASH RECEIVED (₹)</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={cashAmount}
                    onChangeText={setCashAmount}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
                <View style={styles.inputCol}>
                  <Text style={[Typography.labelCaps, styles.fieldLabel]}>ONLINE RECEIVED (₹)</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={onlineAmount}
                    onChangeText={setOnlineAmount}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
              </View>

              {totalEntered > 0 && (
                <View style={styles.enteredRow}>
                  <Text style={styles.enteredText}>Total Payment Entered: {formatCurrency(totalEntered)}</Text>
                  {totalEntered >= totalToCollect ? (
                    <Text style={[styles.statusText, { color: Colors.statusActive }]}>✓ Full Payment</Text>
                  ) : totalEntered >= minPaymentRequired ? (
                    <Text style={[styles.statusText, { color: Colors.statusActive }]}>✓ Gate Cleared</Text>
                  ) : (
                    <Text style={[styles.statusText, { color: Colors.statusError }]}>
                      ⚠ Need {formatCurrency(minPaymentRequired - totalEntered)} more
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}

          {error && <Text style={styles.errorText}>⚠ {error}</Text>}
        </ScrollView>

        <View style={styles.actionBar}>
          <YanaButton label="Cancel" variant="ghost" onPress={handleClose} style={{ flex: 1 }} />
          <YanaButton
            label="Confirm Renewal"
            variant="primary"
            loading={loading}
            disabled={!hasEnteredMinPayment}
            onPress={handleSubmit}
            style={{ flex: 2 }}
          />
        </View>

        {/* Swap Checklist Modal */}
        {checklistActive && (
          <ChecklistModal
            visible={!!checklistActive}
            booking={booking}
            checklistType="return"
            onClose={() => setChecklistActive(null)}
            onComplete={handleChecklistComplete}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgApp,
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 100,
    backgroundColor: Colors.borderLight,
    alignSelf: 'center',
    marginTop: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  closeBtn: {
    fontSize: 20,
    color: Colors.textMuted,
    padding: 4,
  },
  section: {
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  planToggle: {
    flexDirection: 'row',
    backgroundColor: '#EDF0F7',
    borderRadius: Radius.input,
    padding: 4,
  },
  planBtn: {
    flex: 1,
    height: 40,
    borderRadius: Radius.input - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#B0BAD0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  planBtnText: {
    ...Typography.badgeText,
    color: Colors.textSecondary,
  },
  planBtnTextActive: {
    color: Colors.brandNavy,
    fontWeight: '800',
  },
  datesBox: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  dateCol: {
    flex: 1,
    alignItems: 'center',
  },
  dateLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    marginBottom: 4,
  },
  dateVal: {
    ...Typography.bodyPrimary,
    fontWeight: '700',
    color: Colors.brandNavy,
  },
  dateHint: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  dateArrow: {
    paddingHorizontal: 8,
  },
  assetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  assetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  assetText: {
    ...Typography.bodyPrimary,
    color: Colors.textPrimary,
  },
  swappedBadge: {
    fontSize: 8,
    fontWeight: '800',
    color: Colors.brandTeal,
    backgroundColor: '#E0F7FA',
    borderRadius: Radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  exchangeBtn: {
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  exchangeBtnText: {
    ...Typography.badgeText,
    color: Colors.brandNavy,
    fontSize: 11,
  },
  dropdownWrap: {
    backgroundColor: '#EDF0F7',
    borderRadius: Radius.input,
    padding: Spacing.sm,
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  dropdownTitle: {
    ...Typography.labelCaps,
    fontSize: 9,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginLeft: 4,
  },
  dropdownScroll: {
    maxHeight: 120,
  },
  dropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  dropdownItemActive: {
    backgroundColor: '#FFFFFF',
  },
  dropdownItemText: {
    ...Typography.bodySecondary,
    color: Colors.textPrimary,
  },
  emptyText: {
    ...Typography.caption,
    color: Colors.textMuted,
    padding: 8,
    textAlign: 'center',
  },
  cashTotalBox: {
    flexDirection: 'row',
    backgroundColor: '#E0F2FE', // Light blue background
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    padding: Spacing.md,
    marginTop: Spacing.sm,
    alignItems: 'center',
  },
  cashTotalLabel: {
    ...Typography.labelCaps,
    color: Colors.brandNavy,
    fontSize: 10,
    fontWeight: '800',
  },
  cashTotalVal: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.brandNavy,
    marginTop: 4,
  },
  minRequiredText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.statusError,
  },
  paymentDetail: {
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderBottomLeftRadius: Radius.card,
    borderBottomRightRadius: Radius.card,
    marginTop: -8,
    paddingTop: 16,
    padding: Spacing.md,
    gap: 6,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
  },
  breakdownVal: {
    ...Typography.bodySecondary,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  inputCol: {
    flex: 1,
  },
  amountInput: {
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.input,
    height: 48,
    paddingHorizontal: 12,
    ...Typography.bodyPrimary,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  enteredRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  enteredText: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  errorText: {
    color: Colors.statusError,
    fontWeight: '700',
    marginTop: Spacing.md,
    fontSize: 12,
    textAlign: 'center',
  },
  actionBar: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.surfaceCard,
    gap: 12,
  },
});
