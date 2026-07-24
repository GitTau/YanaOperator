// ─────────────────────────────────────────────────────────────────────────────
// BookRideModal — creates a new booking via create_booking RPC
// Enforces: configurable booking cutoff from global_config
// Revenue Protection card recalculates live when plan toggle changes
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/design';
import type { Battery, Charger, Customer, GlobalConfig, Vehicle } from '../../lib/database.types';
import {
  calculatePricing,
  createBooking,
  formatCurrency,
  parseLocalDate,
  formatLocalDate,
} from '../../services/bookingService';
import { YanaButton } from '../ui';
import { CalendarModal } from './CalendarModal';

interface DropdownSelectorProps<T> {
  label: string;
  placeholder: string;
  selectedItem: T | null;
  items: T[];
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (item: T) => void;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  getItemKey: (item: T) => string;
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;
  renderSelected: (item: T) => React.ReactNode;
  emptyText?: string;
}

function DropdownSelector<T>({
  label,
  placeholder,
  selectedItem,
  items,
  isOpen,
  onToggle,
  onSelect,
  iconName,
  getItemKey,
  renderItem,
  renderSelected,
  emptyText = 'None available',
}: DropdownSelectorProps<T>) {
  return (
    <View style={styles.dropdownContainer}>
      <Text style={[Typography.labelCaps, styles.fieldLabel]}>{label}</Text>
      
      {/* Trigger Button */}
      <Pressable
        style={[
          styles.dropdownTrigger,
          isOpen && styles.dropdownTriggerOpen,
        ]}
        onPress={onToggle}
      >
        <View style={styles.dropdownTriggerLeft}>
          <Ionicons
            name={iconName}
            size={18}
            color={selectedItem ? Colors.brandTeal : Colors.textMuted}
            style={{ marginRight: 10 }}
          />
          {selectedItem ? (
            renderSelected(selectedItem)
          ) : (
            <Text style={styles.dropdownPlaceholder}>{placeholder}</Text>
          )}
        </View>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={Colors.textSecondary}
        />
      </Pressable>

      {/* Expanded Dropdown List */}
      {isOpen && (
        <View style={styles.dropdownListContainer}>
          {items.length === 0 ? (
            <View style={styles.dropdownEmptyRow}>
              <Text style={styles.dropdownEmptyText}>{emptyText}</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.dropdownScroll}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={true}
            >
              {items.map((item) => {
                const key = getItemKey(item);
                const isSelected = selectedItem ? getItemKey(selectedItem) === key : false;
                return (
                  <Pressable
                    key={key}
                    style={[
                      styles.dropdownItemRow,
                      isSelected && styles.dropdownItemRowSelected,
                    ]}
                    onPress={() => onSelect(item)}
                  >
                    <View style={{ flex: 1 }}>
                      {renderItem(item, isSelected)}
                    </View>
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={Colors.brandTeal}
                        style={{ marginLeft: 8 }}
                      />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const formatDate = (date: Date): string => {
  return formatLocalDate(date); // YYYY-MM-DD
};

const getDisplayDate = (dateString: string): string => {
  try {
    const d = parseLocalDate(dateString);
    if (!d || isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateString;
  }
};

const addDays = (dateString: string, days: number): string => {
  try {
    const d = parseLocalDate(dateString);
    if (!d || isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + days);
    return formatDate(d);
  } catch {
    return '';
  }
};

interface BookRideModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  storeId: string;
  operatorId: string;
  customers: Customer[];
  busyCustomerIds: Set<string>;
  vehicles: Vehicle[];
  batteries: Battery[];
  chargers?: Charger[];
  globalConfig: GlobalConfig | null;
}

export function BookRideModal({
  visible,
  onClose,
  onSuccess,
  storeId,
  operatorId,
  customers,
  busyCustomerIds,
  vehicles,
  batteries,
  chargers = [],
  globalConfig,
}: BookRideModalProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedBattery, setSelectedBattery] = useState<Battery | null>(null);
  const [selectedCharger, setSelectedCharger] = useState<Charger | null>(null);
  const [plan, setPlan] = useState<'Weekly' | 'Monthly'>('Weekly');
  const [openDropdown, setOpenDropdown] = useState<'customer' | 'vehicle' | 'battery' | 'charger' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(() => formatDate(new Date()));
  const [showCalendar, setShowCalendar] = useState(false);

  const toggleDropdown = (type: 'customer' | 'vehicle' | 'battery' | 'charger') => {
    setOpenDropdown(prev => prev === type ? null : type);
  };

  const endDate = useMemo(() => {
    const days = plan === 'Weekly' ? 6 : 29;
    return addDays(startDate, days);
  }, [startDate, plan]);

  const selectableCustomers = useMemo(() => {
    return customers.filter((c) => !busyCustomerIds.has(c.id));
  }, [customers, busyCustomerIds]);

  const availableVehicles = vehicles.filter((v) => v.status === 'Available');
  const availableBatteries = batteries.filter((b) => b.status === 'Available');
  const availableChargers = chargers.filter((c) => c.status === 'Available');

  const pricing = useMemo(() => {
    if (!globalConfig) return null;
    return calculatePricing(plan, globalConfig);
  }, [plan, globalConfig]);

  const canSubmit =
    !!selectedCustomer &&
    !!selectedVehicle &&
    !!selectedBattery;

  const handleSubmit = async () => {
    if (!canSubmit || !pricing) return;
    setLoading(true);
    setError(null);
    try {
      await createBooking({
        p_customer_id: selectedCustomer!.id,
        p_vehicle_id: selectedVehicle!.id,
        p_battery_id: selectedBattery!.id,
        charger_id: selectedCharger?.id ?? null,
        p_store_id: storeId,
        p_rental_plan: plan,
        p_total_amount: pricing.subtotal,
        p_deposit_amount: pricing.securityDeposit,
        p_amount_paid: 0, // cash collected separately via PaymentModal
        p_operator_id: operatorId,
        start_date: startDate,
        end_date: endDate,
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
    setSelectedCharger(null);
    setPlan('Weekly');
    setStartDate(formatDate(new Date()));
    setShowCalendar(false);
    setOpenDropdown(null);
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

          {/* SELECT RIDER DROPDOWN */}
          <DropdownSelector
            label="SELECT RIDER"
            placeholder="Select a rider..."
            selectedItem={selectedCustomer}
            items={selectableCustomers}
            isOpen={openDropdown === 'customer'}
            onToggle={() => toggleDropdown('customer')}
            onSelect={(customer) => {
              setSelectedCustomer(customer);
              setOpenDropdown(null);
            }}
            iconName="person-outline"
            getItemKey={(c) => c.id}
            emptyText="No eligible riders — all riders have active bookings"
            renderSelected={(c) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[Typography.bodyPrimary, { fontWeight: '700', color: Colors.textPrimary }]}>
                  {c.name}
                </Text>
                <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>
                  ({c.phone})
                </Text>
              </View>
            )}
            renderItem={(c, isSelected) => (
              <View>
                <Text style={[Typography.bodyPrimary, { fontWeight: '600', color: isSelected ? Colors.brandTeal : Colors.textPrimary }]}>
                  {c.name}
                </Text>
                <Text style={[Typography.bodySecondary, { color: Colors.textSecondary, marginTop: 2 }]}>
                  {c.phone}
                </Text>
              </View>
            )}
          />

          {/* SCOOTER DROPDOWN */}
          <DropdownSelector
            label="SCOOTER"
            placeholder="Select a scooter..."
            selectedItem={selectedVehicle}
            items={availableVehicles}
            isOpen={openDropdown === 'vehicle'}
            onToggle={() => toggleDropdown('vehicle')}
            onSelect={(vehicle) => {
              setSelectedVehicle(vehicle);
              setOpenDropdown(null);
            }}
            iconName="bicycle-outline"
            getItemKey={(v) => v.id}
            emptyText="No scooters available"
            renderSelected={(v) => (
              <Text style={[Typography.bodyPrimary, { fontWeight: '700', color: Colors.textPrimary }]}>
                🛵 {v.plate_number}
              </Text>
            )}
            renderItem={(v, isSelected) => (
              <Text style={[Typography.bodyPrimary, { fontWeight: '600', color: isSelected ? Colors.brandTeal : Colors.textPrimary }]}>
                🛵 {v.plate_number}
              </Text>
            )}
          />

          {/* BATTERY DROPDOWN */}
          <DropdownSelector
            label="BATTERY"
            placeholder="Select a battery..."
            selectedItem={selectedBattery}
            items={availableBatteries}
            isOpen={openDropdown === 'battery'}
            onToggle={() => toggleDropdown('battery')}
            onSelect={(battery) => {
              setSelectedBattery(battery);
              setOpenDropdown(null);
            }}
            iconName="flash-outline"
            getItemKey={(b) => b.id}
            emptyText="No batteries available"
            renderSelected={(b) => (
              <Text style={[Typography.bodyPrimary, { fontWeight: '700', color: Colors.textPrimary }]}>
                ⚡ {b.serial_number}
              </Text>
            )}
            renderItem={(b, isSelected) => (
              <Text style={[Typography.bodyPrimary, { fontWeight: '600', color: isSelected ? Colors.brandTeal : Colors.textPrimary }]}>
                ⚡ {b.serial_number}
              </Text>
            )}
          />

          {/* CHARGER DROPDOWN (OPTIONAL) */}
          <DropdownSelector
            label="CHARGER (OPTIONAL)"
            placeholder="Select a charger (if rider needs)..."
            selectedItem={selectedCharger}
            items={availableChargers}
            isOpen={openDropdown === 'charger'}
            onToggle={() => toggleDropdown('charger')}
            onSelect={(charger) => {
              setSelectedCharger(charger);
              setOpenDropdown(null);
            }}
            iconName="power-outline"
            getItemKey={(c) => c.id}
            emptyText="No chargers available"
            renderSelected={(c) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                <Text style={[Typography.bodyPrimary, { fontWeight: '700', color: Colors.textPrimary }]}>
                  🔌 {c.serial_number} {c.ah_rating ? `(${c.ah_rating})` : ''}
                </Text>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    setSelectedCharger(null);
                  }}
                  hitSlop={8}
                >
                  <Text style={{ fontSize: 11, color: Colors.statusError, fontWeight: '600' }}>Remove</Text>
                </Pressable>
              </View>
            )}
            renderItem={(c, isSelected) => (
              <Text style={[Typography.bodyPrimary, { fontWeight: '600', color: isSelected ? Colors.brandTeal : Colors.textPrimary }]}>
                🔌 {c.serial_number} {c.ah_rating ? `(${c.ah_rating})` : ''}
              </Text>
            )}
          />

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

          {/* RENTAL PERIOD */}
          <Text style={[Typography.labelCaps, styles.fieldLabel]}>RENTAL PERIOD</Text>
          <View style={styles.rentalPeriodCard}>
            <Pressable style={styles.periodColPressable} onPress={() => setShowCalendar(true)}>
              <Text style={styles.periodLabel}>START DATE</Text>
              <View style={styles.dateValueContainer}>
                <Text style={styles.periodValue}>{getDisplayDate(startDate)}</Text>
                <Ionicons name="calendar-outline" size={14} color={Colors.brandTeal} style={styles.calendarIcon} />
              </View>
            </Pressable>
            <Ionicons name="arrow-forward" size={18} color={Colors.textMuted} style={styles.periodArrow} />
            <View style={styles.periodCol}>
              <Text style={styles.periodLabel}>END DATE (AUTO)</Text>
              <Text style={styles.periodValue}>{getDisplayDate(endDate)}</Text>
            </View>
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
        <CalendarModal
          visible={showCalendar}
          onClose={() => setShowCalendar(false)}
          selectedDate={startDate}
          onSelectDate={setStartDate}
        />
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
  dropdownContainer: {
    marginBottom: Spacing.md,
  },
  dropdownTrigger: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.input,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: Spacing.md,
    shadowColor: '#B0BAD0',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  dropdownTriggerOpen: {
    borderColor: Colors.brandTeal,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1.5,
  },
  dropdownTriggerSelected: {
    borderColor: Colors.borderLight,
  },
  dropdownTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dropdownPlaceholder: {
    ...Typography.bodyPrimary,
    color: Colors.textMuted,
  },
  dropdownListContainer: {
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1.5,
    borderColor: Colors.brandTeal,
    borderTopWidth: 0,
    borderBottomLeftRadius: Radius.input,
    borderBottomRightRadius: Radius.input,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 180,
  },
  dropdownItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  dropdownItemRowSelected: {
    backgroundColor: '#ECFEFF', // subtle teal tint
  },
  dropdownEmptyRow: {
    padding: Spacing.md,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
  },

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

  rentalPeriodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  periodCol: {
    flex: 1,
    alignItems: 'center',
  },
  periodColPressable: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dateValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calendarIcon: {
    marginLeft: 2,
  },
  periodLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontWeight: '700',
    marginBottom: 4,
  },
  periodValue: {
    ...Typography.bodyPrimary,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  periodArrow: {
    marginHorizontal: Spacing.sm,
  },
});
