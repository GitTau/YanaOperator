// PauseModal, SwapModal, ReturnModal, CustomerFormModal

import React, { useState } from 'react';
import {
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
import type { Battery, BookingWithDetails, Vehicle } from '../../lib/database.types';
import {
  calculateOverdueFines,
  completeBooking,
  createCustomer,
  formatCurrency,
  maskAadhaar,
  pauseBooking,
  swapAssets,
} from '../../services/bookingService';
import { Divider, YanaButton } from '../ui';

// ─────────────────────────────────────────────────────────────────────────────
// PauseModal
// ─────────────────────────────────────────────────────────────────────────────

interface PauseModalProps {
  visible: boolean;
  booking: BookingWithDetails | null;
  onClose: () => void;
  onSuccess: () => void;
  hasIssues?: boolean;
}

export function PauseModal({ visible, booking, onClose, onSuccess, hasIssues = false }: PauseModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePause = async () => {
    if (!booking) return;
    if (!reason.trim()) { setError('Please enter a reason for pausing'); return; }
    setLoading(true);
    setError(null);
    try {
      await pauseBooking(booking.id, booking.vehicle_id, booking.battery_id, reason.trim(), hasIssues);
      handleClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pause failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { setReason(''); setError(null); onClose(); };
  if (!booking) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.handle} />
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={[Typography.h1Screen, { color: Colors.textPrimary }]}>Pause & Delink</Text>
            <Pressable onPress={handleClose} hitSlop={12}><Text style={styles.closeBtn}>✕</Text></Pressable>
          </View>

          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              ⚠ This will release {booking.vehicle?.plate_number ?? 'No Vehicle'} back to the fleet immediately.
              The rider will need to collect a new vehicle when they resume.
            </Text>
          </View>

          <Text style={[Typography.labelCaps, styles.fieldLabel]}>RIDER</Text>
          <Text style={[Typography.bodyPrimary, { color: Colors.textPrimary, fontWeight: '600' }]}>
            {booking.customer.name} · {booking.rental_plan}
          </Text>

          <Text style={[Typography.labelCaps, styles.fieldLabel, { marginTop: Spacing.md }]}>PAUSE REASON</Text>
          <TextInput
            style={styles.textArea}
            value={reason}
            onChangeText={(t) => { setReason(t); setError(null); }}
            placeholder="Enter reason (e.g. rider travelling, medical leave...)"
            placeholderTextColor={Colors.textSecondary}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          {error && <Text style={styles.errorText}>⚠ {error}</Text>}
        </View>
        <View style={styles.actionBar}>
          <YanaButton label="Cancel" variant="ghost" onPress={handleClose} style={{ flex: 1 }} />
          <YanaButton label="Confirm Pause" variant="warning" loading={loading} onPress={handlePause} style={{ flex: 2 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ReturnModal
// ─────────────────────────────────────────────────────────────────────────────

interface ReturnModalProps {
  visible: boolean;
  booking: BookingWithDetails | null;
  onClose: () => void;
  onSuccess: () => void;
  /** Damage fines from the vehicle checklist. Deducted from security deposit. */
  damageFines?: number;
  hasIssues?: boolean;
}

export function ReturnModal({ visible, booking, onClose, onSuccess, damageFines = 0, hasIssues = false }: ReturnModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReturn = async () => {
    if (!booking) return;
    setLoading(true);
    setError(null);
    try {
      await completeBooking(booking.id, booking.vehicle_id, booking.battery_id, hasIssues);
      handleClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Return failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { setError(null); onClose(); };
  if (!booking) return null;

  const { overdueFine } = calculateOverdueFines(
    booking.rental_plan,
    booking.start_date,
    booking.end_date,
    booking.total_amount,
    booking.deposit_amount,
    booking.amount_paid,
    booking.status,
  );
  const totalFines = booking.fines_amount + overdueFine;
  const balanceDue        = booking.total_amount + booking.deposit_amount + totalFines - booking.amount_paid;
  const depositReturnable = Math.max(0, booking.deposit_amount - damageFines);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.handle} />
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={[Typography.h1Screen, { color: Colors.textPrimary }]}>Return Vehicle</Text>
            <Pressable onPress={handleClose} hitSlop={12}><Text style={styles.closeBtn}>✕</Text></Pressable>
          </View>

          <Text style={[Typography.bodyPrimary, { color: Colors.textPrimary, fontWeight: '600', marginBottom: Spacing.md }]}>
            {booking.customer.name} · {booking.vehicle?.plate_number ?? 'No Vehicle'} · {booking.rental_plan}
          </Text>
          <Divider />

          {/* Rental settlement */}
          <View style={{ gap: 8, marginVertical: Spacing.md }}>
            <SummaryLine label="Total Rent"        value={formatCurrency(booking.total_amount)} />
            <SummaryLine label="Security Deposit"  value={formatCurrency(booking.deposit_amount)} />
            {totalFines > 0 && (
              <SummaryLine label="Fines" value={formatCurrency(totalFines)} valueColor={Colors.statusOverdue} />
            )}
            <SummaryLine label="Amount Paid"       value={formatCurrency(booking.amount_paid)} valueColor={Colors.statusActive} />
            <Divider />
            <SummaryLine
              label="Balance Due"
              value={formatCurrency(balanceDue)}
              valueColor={balanceDue > 0 ? Colors.statusOverdue : Colors.statusActive}
            />
          </View>

          {balanceDue > 0 && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                ⚠ Collect {formatCurrency(balanceDue)} before completing return.
              </Text>
            </View>
          )}

          {/* Deposit settlement — only show if checklist found damage */}
          {damageFines > 0 && (
            <>
              <Divider />
              <Text style={[Typography.labelCaps, { color: Colors.statusError, marginTop: Spacing.md, marginBottom: Spacing.sm }]}>
                DEPOSIT SETTLEMENT
              </Text>
              <View style={{ gap: 6 }}>
                <SummaryLine label="Security Deposit"  value={formatCurrency(booking.deposit_amount)} />
                <SummaryLine
                  label="Damage Fines (checklist)"
                  value={`− ${formatCurrency(damageFines)}`}
                  valueColor={Colors.statusOverdue}
                />
                <Divider />
                <SummaryLine
                  label="Returnable to Rider"
                  value={formatCurrency(depositReturnable)}
                  valueColor={depositReturnable > 0 ? Colors.statusActive : Colors.statusOverdue}
                />
              </View>
              {depositReturnable === 0 && (
                <View style={[styles.warningBox, { borderLeftColor: Colors.statusOverdue, marginTop: Spacing.sm }]}>
                  <Text style={[styles.warningText, { color: Colors.statusOverdue }]}>
                    ⚠ Full deposit forfeited — damage fines exceed deposit amount.
                  </Text>
                </View>
              )}
            </>
          )}

          {error && <Text style={styles.errorText}>⚠ {error}</Text>}
        </View>
        <View style={styles.actionBar}>
          <YanaButton label="Cancel" variant="ghost" onPress={handleClose} style={{ flex: 1 }} />
          <YanaButton label="Complete Return" variant="success" loading={loading} onPress={handleReturn} style={{ flex: 2 }} />
        </View>
      </View>
    </Modal>
  );
}

function SummaryLine({ label, value, valueColor = Colors.textPrimary }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>{label}</Text>
      <Text style={[Typography.bodySecondary, { color: valueColor, fontWeight: '600' }]}>{value}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SwapModal — swap vehicle and/or battery via swap_assets RPC
// ─────────────────────────────────────────────────────────────────────────────

interface SwapModalProps {
  visible: boolean;
  booking: BookingWithDetails | null;
  onClose: () => void;
  onSuccess: () => void;
  storeId: string;
  operatorId: string;
  availableVehicles: Vehicle[];
  availableBatteries: Battery[];
}

export function SwapModal({ visible, booking, onClose, onSuccess, storeId, operatorId, availableVehicles, availableBatteries }: SwapModalProps) {
  const [newVehicle, setNewVehicle] = useState<Vehicle | null>(null);
  const [newBattery, setNewBattery] = useState<Battery | null>(null);
  const [fines, setFines] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSwap = async () => {
    if (!booking) return;
    if (!newVehicle && !newBattery) { setError('Select at least a new vehicle or battery'); return; }
    setLoading(true);
    setError(null);
    try {
      await swapAssets({
        p_booking_id: booking.id,
        p_store_id: storeId,
        p_new_vehicle_id: newVehicle?.id ?? booking.vehicle_id,
        p_new_battery_id: newBattery?.id ?? booking.battery_id,
        p_additional_fines: parseFloat(fines) || 0,
        p_operator_id: operatorId,
      });
      handleClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Swap failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { setNewVehicle(null); setNewBattery(null); setFines(''); setError(null); onClose(); };
  if (!booking) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.handle} />
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={[Typography.h1Screen, { color: Colors.textPrimary }]}>Swap Assets</Text>
            <Pressable onPress={handleClose} hitSlop={12}><Text style={styles.closeBtn}>✕</Text></Pressable>
          </View>

          <Text style={styles.currentAssets}>Current: {booking.vehicle?.plate_number ?? 'No Vehicle'} / {booking.battery?.serial_number ?? 'No Battery'}</Text>

          <Text style={[Typography.labelCaps, styles.fieldLabel]}>NEW SCOOTER (optional)</Text>
          {availableVehicles.map((v) => (
            <Pressable key={v.id} style={[styles.listItem, newVehicle?.id === v.id && styles.listItemSelected]} onPress={() => setNewVehicle(v === newVehicle ? null : v)}>
              <Text style={[styles.listItemText, newVehicle?.id === v.id && { color: Colors.brandCyan }]}>🛵 {v.plate_number}</Text>
            </Pressable>
          ))}

          <Text style={[Typography.labelCaps, styles.fieldLabel]}>NEW BATTERY (optional)</Text>
          {availableBatteries.map((b) => (
            <Pressable key={b.id} style={[styles.listItem, newBattery?.id === b.id && styles.listItemSelected]} onPress={() => setNewBattery(b === newBattery ? null : b)}>
              <Text style={[styles.listItemText, newBattery?.id === b.id && { color: Colors.brandCyan }]}>⚡ {b.serial_number}</Text>
            </Pressable>
          ))}

          <Text style={[Typography.labelCaps, styles.fieldLabel]}>ADDITIONAL FINE (₹) — optional</Text>
          <TextInput style={styles.amountInput} value={fines} onChangeText={(t) => { setFines(t); setError(null); }} keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.textSecondary} />

          {error && <Text style={styles.errorText}>⚠ {error}</Text>}
        </View>
      </ScrollView>
      <View style={styles.actionBar}>
        <YanaButton label="Cancel" variant="ghost" onPress={handleClose} style={{ flex: 1 }} />
        <YanaButton label="Confirm Swap" variant="primary" loading={loading} onPress={handleSwap} style={{ flex: 2 }} />
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CustomerFormModal — add a new rider to this ZAP Point
// Aadhaar stored in DB but NEVER displayed back in full
// ─────────────────────────────────────────────────────────────────────────────

interface CustomerFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  storeId: string;
}

export function CustomerFormModal({ visible, onClose, onSuccess, storeId }: CustomerFormModalProps) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', address: '',
    aadhar_no: '', pan_no: '',
    emergency_contact_1: '', emergency_contact_2: '',
    bank_name: '', account_holder_name: '', account_number: '', ifsc_code: '', upi_id: '',
    dob: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (val: string) => {
    setForm((f) => ({ ...f, [key]: val }));
    setError(null);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Name and phone are required');
      return;
    }
    if (form.phone.length < 10) {
      setError('Enter a valid 10-digit phone number');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createCustomer({
        store_id: storeId,
        name: form.name.trim(),
        phone: form.phone.trim().startsWith('+91') ? form.phone.trim() : `+91${form.phone.trim()}`,
        email: form.email || undefined,
        address: form.address || undefined,
        aadhar_no: form.aadhar_no || undefined,
        pan_no: form.pan_no || undefined,
        emergency_contact_1: form.emergency_contact_1 || undefined,
        emergency_contact_2: form.emergency_contact_2 || undefined,
        bank_name: form.bank_name || undefined,
        account_holder_name: form.account_holder_name || undefined,
        account_number: form.account_number || undefined,
        ifsc_code: form.ifsc_code || undefined,
        upi_id: form.upi_id || undefined,
        dob: form.dob || undefined,
      });
      handleClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create rider failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setForm({ name: '', phone: '', email: '', address: '', aadhar_no: '', pan_no: '', emergency_contact_1: '', emergency_contact_2: '', bank_name: '', account_holder_name: '', account_number: '', ifsc_code: '', upi_id: '', dob: '' });
    setError(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.handle} />
        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.titleRow}>
            <Text style={[Typography.h1Screen, { color: Colors.textPrimary }]}>Add New Rider</Text>
            <Pressable onPress={handleClose} hitSlop={12}><Text style={styles.closeBtn}>✕</Text></Pressable>
          </View>

          <SectionLabel label="BASIC INFO" />
          <FormField label="Full Name *" value={form.name} onChangeText={set('name')} placeholder="Miroj Chhotai" />
          <FormField label="Phone Number *" value={form.phone} onChangeText={set('phone')} placeholder="9776739541" keyboardType="phone-pad" />
          <FormField label="Email" value={form.email} onChangeText={set('email')} placeholder="rider@email.com" keyboardType="email-address" />
          <FormField label="Date of Birth" value={form.dob} onChangeText={set('dob')} placeholder="DD/MM/YYYY" />
          <FormField label="Address" value={form.address} onChangeText={set('address')} placeholder="Full address" multiline />

          <SectionLabel label="KYC DOCUMENTS" />
          <FormField label="Aadhaar Number" value={form.aadhar_no} onChangeText={set('aadhar_no')} placeholder="XXXX XXXX XXXX" keyboardType="numeric" secureTextEntry />
          <Text style={styles.kycNote}>🔒 Stored securely. Always masked in UI as XXXX-XXXX-1234.</Text>
          <FormField label="PAN Number" value={form.pan_no} onChangeText={set('pan_no')} placeholder="ABCDE1234F" autoCapitalize="characters" />

          <SectionLabel label="EMERGENCY CONTACTS" />
          <FormField label="Emergency Contact 1" value={form.emergency_contact_1} onChangeText={set('emergency_contact_1')} placeholder="Phone number" keyboardType="phone-pad" />
          <FormField label="Emergency Contact 2" value={form.emergency_contact_2} onChangeText={set('emergency_contact_2')} placeholder="Phone number" keyboardType="phone-pad" />

          <SectionLabel label="BANK DETAILS (for deposit refund)" />
          <FormField label="Bank Name" value={form.bank_name} onChangeText={set('bank_name')} placeholder="State Bank of India" />
          <FormField label="Account Holder Name" value={form.account_holder_name} onChangeText={set('account_holder_name')} placeholder="As per bank records" />
          <FormField label="Account Number" value={form.account_number} onChangeText={set('account_number')} placeholder="Account number" keyboardType="numeric" />
          <FormField label="IFSC Code" value={form.ifsc_code} onChangeText={set('ifsc_code')} placeholder="SBIN0001234" autoCapitalize="characters" />
          <FormField label="UPI ID" value={form.upi_id} onChangeText={set('upi_id')} placeholder="rider@upi" />

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {error}</Text>
            </View>
          )}
          <View style={{ height: 80 }} />
        </ScrollView>

        <View style={styles.actionBar}>
          <YanaButton label="Cancel" variant="ghost" onPress={handleClose} style={{ flex: 1 }} />
          <YanaButton label="Add Rider" variant="primary" loading={loading} onPress={handleSubmit} style={{ flex: 2 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <View style={styles.sectionLabelContainer}>
      <Text style={[Typography.labelCaps, { color: Colors.brandCyan, fontSize: 11 }]}>{label}</Text>
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  [key: string]: unknown;
}) {
  return (
    <View style={styles.formField}>
      <Text style={[Typography.labelCaps, { color: Colors.textSecondary, fontSize: 10 }]}>{label}</Text>
      <TextInput
        style={[styles.formInput, multiline && styles.formInputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textSecondary}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...(rest as object)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgApp },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight, alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  content: { paddingHorizontal: Spacing.md },
  scrollContent: { flex: 1, paddingHorizontal: Spacing.md },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md, marginTop: Spacing.sm },
  closeBtn: { fontSize: 20, color: Colors.textSecondary, padding: 4 },
  warningBox: { backgroundColor: '#FFF8E1', borderLeftWidth: 4, borderLeftColor: Colors.amber, padding: Spacing.md, borderRadius: Radius.sm, marginBottom: Spacing.md },
  warningText: { color: Colors.amber, ...Typography.bodySecondary, fontWeight: '600' },
  fieldLabel: { color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.md },
  currentAssets: { ...Typography.bodySecondary, color: Colors.textSecondary, marginBottom: Spacing.md },
  listItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, backgroundColor: Colors.surfaceCard },
  listItemSelected: { backgroundColor: '#E0FDFF' },
  listItemText: { ...Typography.bodySecondary, color: Colors.textPrimary },
  amountInput: { height: 54, backgroundColor: Colors.surfaceCard, borderRadius: Radius.card, borderWidth: 1.5, borderColor: Colors.brandCyan, paddingHorizontal: Spacing.md, fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  textArea: { backgroundColor: Colors.surfaceCard, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.borderLight, padding: Spacing.sm, ...Typography.bodyPrimary, color: Colors.textPrimary, minHeight: 80, marginBottom: Spacing.sm },
  errorText: { color: Colors.statusOverdue, ...Typography.bodySecondary, marginTop: Spacing.sm },
  errorBox: { backgroundColor: Colors.overdueCardBg, borderRadius: Radius.sm, padding: Spacing.md, borderLeftWidth: 3, borderLeftColor: Colors.statusOverdue, marginTop: Spacing.md },
  actionBar: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.borderLight, backgroundColor: Colors.surfaceCard },
  sectionLabelContainer: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight, marginTop: Spacing.lg, paddingBottom: 6, marginBottom: Spacing.sm },
  formField: { marginBottom: Spacing.md },
  formInput: { height: 48, backgroundColor: Colors.surfaceCard, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.borderLight, paddingHorizontal: Spacing.md, ...Typography.bodyPrimary, color: Colors.textPrimary, marginTop: 4 },
  formInputMultiline: { height: 80, paddingTop: 10 },
  kycNote: { ...Typography.bodySecondary, color: Colors.textSecondary, marginTop: -8, marginBottom: Spacing.sm, fontStyle: 'italic' },
});
