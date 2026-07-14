// ─────────────────────────────────────────────────────────────────────────────
// ChecklistModal — Vehicle Inspection Checklist
// Items fetched live from Supabase `checklist_templates`.
// Admin can modify items, labels, and fine_amounts from the dashboard.
//
// Business rules (AGENTS.md):
//   — Must complete before Return or Pause
//   — DAMAGED items deduct their fine_amount from the security deposit
//   — Final deposit return = deposit_amount − total_damage_fines (floor: 0)
//   — onComplete(hasIssues, totalFines) — caller uses fines in ReturnModal
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
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
import type { BookingWithDetails } from '../../lib/database.types';
import { useChecklistTemplate } from '../../hooks/useQueries';
import type { ChecklistTemplateItem } from '../../hooks/useQueries';
import {
  formatCurrency,
  openMaintenanceTicket,
  saveVehicleChecklist,
} from '../../services/bookingService';
import { useAuthStore } from '../../stores/authStore';

// ── Types ─────────────────────────────────────────────────────────────────────

type ItemState = 'ok' | 'issue' | 'damaged' | null;

interface ChecklistModalProps {
  visible: boolean;
  booking: BookingWithDetails | null;
  checklistType: 'return' | 'pause' | 'vehicle_swap';
  onClose: () => void;
  /**
   * Called after checklist is submitted.
   * @param hasIssues - true if any item = issue or damaged
   * @param totalDamageFines - sum of fine_amount for all DAMAGED items (₹)
   */
  onComplete: (hasIssues: boolean, totalDamageFines: number) => void;
}

// ── Per-state visual config ───────────────────────────────────────────────────

const STATE_CONFIG: Record<
  Exclude<ItemState, null>,
  { label: string; color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>['name'] }
> = {
  ok:      { label: 'OK',      color: Colors.statusActive,  bg: '#F0FDF4', icon: 'checkmark-circle'  },
  issue:   { label: 'ISSUE',   color: Colors.statusWarning, bg: '#FFFBEB', icon: 'warning'            },
  damaged: { label: 'DAMAGED', color: Colors.statusError,   bg: '#FFF5F5', icon: 'close-circle'       },
};

// Cast plain string to Ionicons name (safe — missing icons render fallback)
function asIcon(name: string): React.ComponentProps<typeof Ionicons>['name'] {
  return name as React.ComponentProps<typeof Ionicons>['name'];
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function ChecklistModal({
  visible,
  booking,
  checklistType,
  onClose,
  onComplete,
}: ChecklistModalProps) {
  const queryFlow = checklistType === 'vehicle_swap' ? 'return' : checklistType;
  const { data: items, isLoading, error: loadError } = useChecklistTemplate(queryFlow);

  const [states, setStates]     = useState<Record<string, ItemState>>({});
  const [notes, setNotes]       = useState<Record<string, string>>({});
  const [showRaiseTicket, setShowRaiseTicket] = useState(false);
  const [submitting, setSubmitting]           = useState(false);

  // ── Derived values ────────────────────────────────────────────────────────

  const totalItems     = items?.length ?? 0;

  const completedCount = (items ?? []).filter(i =>
    states[i.item_key] !== null && states[i.item_key] !== undefined
  ).length;

  const hasIssues  = Object.values(states).some(s => s === 'issue' || s === 'damaged');
  const hasDamage  = Object.values(states).some(s => s === 'damaged');
  const allComplete = totalItems > 0 && completedCount === totalItems;
  const canSubmit  = allComplete;

  // Sum fine_amount for every DAMAGED item
  const totalDamageFines = (items ?? []).reduce((sum, item) => {
    if (states[item.item_key] === 'damaged') return sum + item.fine_amount;
    return sum;
  }, 0);

  const depositAmount     = booking?.deposit_amount ?? 0;
  const depositReturnable = Math.max(0, depositAmount - totalDamageFines);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const setItemState = (key: string, state: ItemState) =>
    setStates(prev => ({ ...prev, [key]: prev[key] === state ? null : state }));

  const handleSubmit = () => {
    if (hasIssues || hasDamage) {
      setShowRaiseTicket(true);
    } else {
      onComplete(false, 0);
      handleClose();
    }
  };

  const handleRaiseTicket = async () => {
    if (submitting || !booking) return;
    setSubmitting(true);
    try {
      const itemStatesStrings: Record<string, string> = {};
      for (const [k, v] of Object.entries(states)) {
        if (v) itemStatesStrings[k] = v;
      }

      // 1. Save Checklist
      const { profile } = useAuthStore.getState();
      await saveVehicleChecklist({
        vehicleId:   booking.vehicle_id,
        storeId:     booking.store_id,
        bookingId:   booking.id,
        flow:        checklistType === 'vehicle_swap' ? 'return' : checklistType,
        itemStates:  itemStatesStrings,
        itemNotes:   notes,
        submittedBy: profile?.id ?? null,
      });

      // 2. Format description of damages
      const affectedItems = Object.entries(states)
        .filter(([, s]) => s === 'issue' || s === 'damaged')
        .map(([key, state]) => {
          const label = items?.find(i => i.item_key === key)?.label || key;
          const note = notes[key] ? `: ${notes[key]}` : '';
          const stateStr = state ? state.toUpperCase() : 'ISSUE';
          return `${label} (${stateStr})${note}`;
        });
      const description = `Flagged during ${checklistType}: ${affectedItems.join(', ')}`;

      // 3. Open Maintenance Ticket
      await openMaintenanceTicket({
        vehicleId: booking.vehicle_id,
        storeId:   booking.store_id,
        description,
      });

      setShowRaiseTicket(false);
      onComplete(hasIssues, totalDamageFines);
      handleClose();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to raise maintenance ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setStates({});
    setNotes({});
    setShowRaiseTicket(false);
    onClose();
  };

  if (!booking) return null;

  // ── Raise Ticket Confirmation ─────────────────────────────────────────────

  if (showRaiseTicket) {
    const affectedLabels = Object.entries(states)
      .filter(([, s]) => s === 'issue' || s === 'damaged')
      .map(([key]) => items?.find(i => i.item_key === key)?.label)
      .filter(Boolean)
      .join(', ');

    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <View style={styles.container}>
          <View style={styles.handle} />
          <View style={styles.ticketContent}>
            {/* Icon */}
            <View style={[styles.ticketIconWrap, { backgroundColor: hasDamage ? '#FFF5F5' : '#FFFBEB' }]}>
              <Ionicons
                name="warning"
                size={36}
                color={hasDamage ? Colors.statusError : Colors.statusWarning}
              />
            </View>

            <Text style={styles.ticketTitle}>{hasDamage ? 'Damage Detected' : 'Issues Found'}</Text>
            <Text style={styles.ticketSub}>{affectedLabels}</Text>

            {/* Deposit deduction summary */}
            {totalDamageFines > 0 && (
              <View style={styles.depositSummaryCard}>
                <Text style={styles.depositSummaryTitle}>DEPOSIT SETTLEMENT</Text>
                <View style={styles.depositRow}>
                  <Text style={styles.depositLabel}>Security Deposit</Text>
                  <Text style={styles.depositValue}>{formatCurrency(depositAmount)}</Text>
                </View>
                <View style={styles.depositRow}>
                  <Text style={[styles.depositLabel, { color: Colors.statusError }]}>Damage Fines</Text>
                  <Text style={[styles.depositValue, { color: Colors.statusError }]}>
                    − {formatCurrency(totalDamageFines)}
                  </Text>
                </View>
                <View style={[styles.depositRow, styles.depositRowFinal]}>
                  <Text style={styles.depositFinalLabel}>Returnable to Rider</Text>
                  <Text style={[
                    styles.depositFinalValue,
                    { color: depositReturnable > 0 ? Colors.statusActive : Colors.statusError },
                  ]}>
                    {formatCurrency(depositReturnable)}
                  </Text>
                </View>
              </View>
            )}

            <Text style={styles.ticketQuestion}>Raise a maintenance ticket for this vehicle?</Text>
            <Text style={styles.ticketHint}>
              {hasDamage
                ? 'Damaged items are flagged for maintenance. Ride will close after confirmation.'
                : 'Issues flagged — supervisor will review. Vehicle stays active for now.'}
            </Text>

            <View style={styles.ticketActions}>
              <Pressable
                style={[styles.ticketBtn, styles.ticketBtnGhost]}
                onPress={() => setShowRaiseTicket(false)}
                disabled={submitting}
              >
                <Text style={[styles.ticketBtnText, { color: Colors.textSecondary }]}>Go Back & Edit Checklist</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.ticketBtn,
                  { backgroundColor: hasDamage ? Colors.statusError : Colors.statusWarning },
                ]}
                onPress={handleRaiseTicket}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="construct-outline" size={15} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={[styles.ticketBtnText, { color: '#fff' }]}>Yes — Raise Ticket</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // ── Main Checklist ─────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>
              {checklistType === 'return' ? 'Return Checklist' : 'Pause Checklist'}
            </Text>
            <Text style={styles.headerSub}>
              {booking.vehicle?.plate_number ?? 'No Vehicle'} · {booking.customer.name}
            </Text>
          </View>
          <Pressable onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {/* Progress bar */}
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: totalItems > 0 ? `${(completedCount / totalItems) * 100}%` : '0%',
                  backgroundColor: allComplete ? Colors.statusActive : Colors.brandTeal,
                },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {totalItems > 0 ? `${completedCount}/${totalItems}` : '…'}
          </Text>
        </View>

        {/* Loading */}
        {isLoading && (
          <View style={styles.centreWrap}>
            <ActivityIndicator size="large" color={Colors.brandTeal} />
            <Text style={styles.centreText}>Loading checklist…</Text>
          </View>
        )}

        {/* Error */}
        {loadError && !isLoading && (
          <View style={styles.centreWrap}>
            <Ionicons name="warning-outline" size={32} color={Colors.statusError} />
            <Text style={[styles.centreText, { color: Colors.statusError }]}>Couldn't load checklist</Text>
            <Text style={styles.centreSubText}>Check your connection and try again.</Text>
          </View>
        )}

        {/* Items */}
        {!isLoading && !loadError && items && (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 14 dynamic checklist items */}
            {items.map((item: ChecklistTemplateItem, index: number) => {
              const current  = states[item.item_key] ?? null;
              const itemNote = notes[item.item_key] ?? '';
              const needsNote = current === 'issue' || current === 'damaged';
              const showFine  = current === 'damaged' && item.fine_amount > 0;

              return (
                <View
                  key={item.item_key}
                  style={[
                    styles.itemCard,
                    current === 'ok'      && { borderColor: '#BBF7D0' },
                    current === 'issue'   && { borderColor: '#FDE68A' },
                    current === 'damaged' && { borderColor: '#FECACA' },
                  ]}
                >
                  {/* Item header */}
                  <View style={styles.itemHeader}>
                    <View style={styles.itemIndexWrap}>
                      <Text style={styles.itemIndex}>{String(index + 1).padStart(2, '0')}</Text>
                    </View>
                    <Ionicons
                      name={asIcon(item.icon_name)}
                      size={16}
                      color={current ? STATE_CONFIG[current].color : Colors.textMuted}
                    />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.itemLabel}>{item.label}</Text>
                      <Text style={styles.itemDesc}>{item.description}</Text>
                    </View>
                    {current && (
                      <View style={[styles.itemStatePill, { backgroundColor: STATE_CONFIG[current].bg }]}>
                        <Ionicons
                          name={STATE_CONFIG[current].icon}
                          size={11}
                          color={STATE_CONFIG[current].color}
                        />
                        <Text style={[styles.itemStateText, { color: STATE_CONFIG[current].color }]}>
                          {STATE_CONFIG[current].label}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Fine tag — shown when DAMAGED and fine > 0 */}
                  {showFine && (
                    <View style={styles.fineTag}>
                      <Ionicons name="cash-outline" size={12} color={Colors.statusError} style={{ marginRight: 5 }} />
                      <Text style={styles.fineTagText}>
                        Damage fine: <Text style={{ fontWeight: '800' }}>{formatCurrency(item.fine_amount)}</Text>
                        {'  '}·{'  '}deducted from deposit
                      </Text>
                    </View>
                  )}

                  {/* State toggle buttons */}
                  <View style={styles.stateRow}>
                    {(['ok', 'issue', 'damaged'] as Exclude<ItemState, null>[]).map(state => (
                      <Pressable
                        key={state}
                        style={({ pressed }) => [
                          styles.stateBtn,
                          current === state && {
                            backgroundColor: STATE_CONFIG[state].bg,
                            borderColor: STATE_CONFIG[state].color,
                          },
                          { transform: [{ scale: pressed ? 0.95 : 1 }] },
                        ]}
                        onPress={() => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setItemState(item.item_key, state);
                        }}
                      >
                        <Ionicons
                          name={STATE_CONFIG[state].icon}
                          size={13}
                          color={current === state ? STATE_CONFIG[state].color : Colors.textMuted}
                        />
                        <Text
                          style={[
                            styles.stateBtnText,
                            { color: current === state ? STATE_CONFIG[state].color : Colors.textMuted },
                          ]}
                        >
                          {STATE_CONFIG[state].label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Notes field */}
                  {needsNote && (
                    <TextInput
                      style={styles.noteInput}
                      value={itemNote}
                      onChangeText={t => setNotes(prev => ({ ...prev, [item.item_key]: t }))}
                      placeholder={`Describe ${current === 'damaged' ? 'damage' : 'issue'}…`}
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      numberOfLines={2}
                      textAlignVertical="top"
                    />
                  )}
                </View>
              );
            })}

            {/* ── Live damage fine summary ──────────────────────────────── */}
            {totalDamageFines > 0 && (
              <View style={styles.fineSummaryCard}>
                <Text style={styles.fineSummaryTitle}>DAMAGE FINE SUMMARY</Text>

                {/* Per-item fine lines */}
                {(items ?? [])
                  .filter(i => states[i.item_key] === 'damaged' && i.fine_amount > 0)
                  .map(i => (
                    <View key={i.item_key} style={styles.fineSummaryRow}>
                      <Text style={styles.fineSummaryLabel}>{i.label}</Text>
                      <Text style={[styles.fineSummaryValue, { color: Colors.statusError }]}>
                        − {formatCurrency(i.fine_amount)}
                      </Text>
                    </View>
                  ))}

                <View style={styles.fineSummaryDivider} />

                <View style={styles.fineSummaryRow}>
                  <Text style={styles.fineSummaryLabel}>Security Deposit</Text>
                  <Text style={styles.fineSummaryValue}>{formatCurrency(depositAmount)}</Text>
                </View>
                <View style={styles.fineSummaryRow}>
                  <Text style={[styles.fineSummaryLabel, { color: Colors.statusError, fontWeight: '700' }]}>
                    Total Fines
                  </Text>
                  <Text style={[styles.fineSummaryValue, { color: Colors.statusError, fontWeight: '800' }]}>
                    − {formatCurrency(totalDamageFines)}
                  </Text>
                </View>

                <View style={[styles.fineSummaryRow, styles.fineSummaryRowHighlight]}>
                  <Text style={styles.fineSummaryReturnLabel}>Deposit Returnable</Text>
                  <Text style={[
                    styles.fineSummaryReturnValue,
                    { color: depositReturnable > 0 ? Colors.statusActive : Colors.statusError },
                  ]}>
                    {formatCurrency(depositReturnable)}
                  </Text>
                </View>

                {depositReturnable === 0 && (
                  <Text style={styles.depositZeroNote}>
                    Full deposit forfeited — damage fines exceed the deposit amount.
                  </Text>
                )}
              </View>
            )}

            {/* Issues-only warning (no fine, just flag) */}
            {hasIssues && totalDamageFines === 0 && (
              <View style={styles.issueWarning}>
                <Ionicons name="warning-outline" size={16} color={Colors.statusWarning} style={{ marginRight: 8 }} />
                <Text style={[styles.issueWarningText, { color: Colors.statusWarning }]}>
                  Issues flagged — maintenance ticket will be prompted
                </Text>
              </View>
            )}

            <View style={{ height: 120 }} />
          </ScrollView>
        )}

        {/* Action bar */}
        <View style={styles.actionBar}>
          <Pressable
            style={({ pressed }) => [
              styles.cancelBtn,
              { transform: [{ scale: pressed ? 0.96 : 1 }] },
            ]}
            onPress={handleClose}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              !canSubmit && styles.submitBtnDisabled,
              { transform: [{ scale: pressed && canSubmit ? 0.96 : 1 }] },
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.submitBtnText}>
              {checklistType === 'return' ? 'Confirm Return' : 'Confirm Pause'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgApp },

  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.borderLight,
    alignSelf: 'center',
    marginTop: 10, marginBottom: 6,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 12,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.3 },
  headerSub:   { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  closeBtn:    { padding: 4 },

  // Progress
  progressWrap: {
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  progressTrack: { flex: 1, height: 6, borderRadius: 100, backgroundColor: Colors.borderLight, overflow: 'hidden' },
  progressFill:  { height: 6, borderRadius: 100 },
  progressLabel: { ...Typography.caption, color: Colors.textSecondary, minWidth: 40, textAlign: 'right' },

  // Loading / Error
  centreWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centreText:    { ...Typography.bodySecondary, color: Colors.textSecondary, fontWeight: '600' },
  centreSubText: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center' },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: Spacing.md, gap: 10 },

  // Odometer
  odometerCard: {
    backgroundColor: Colors.surfaceCard, borderRadius: 14,
    borderWidth: 1, borderColor: '#B2EBF5', padding: Spacing.md,
  },
  odometerRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  odometerLabel: { ...Typography.badgeText, color: Colors.textPrimary },
  odometerInput: {
    height: 48, backgroundColor: Colors.bgApp,
    borderRadius: 10, borderWidth: 1.5, borderColor: Colors.brandTeal,
    paddingHorizontal: Spacing.md, fontSize: 20, fontWeight: '700', color: Colors.textPrimary,
  },
  odometerHint: { ...Typography.caption, color: Colors.textMuted, marginTop: 6, fontStyle: 'italic' },

  // Item card
  itemCard: {
    backgroundColor: Colors.surfaceCard, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.borderLight,
    shadowColor: '#B0BAD0', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 1,
    overflow: 'hidden',
  },
  itemHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: 10, gap: 4 },
  itemIndexWrap: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: Colors.bgApp, alignItems: 'center', justifyContent: 'center',
    marginRight: 4, borderWidth: 1, borderColor: Colors.borderLight,
  },
  itemIndex:     { fontSize: 10, fontWeight: '700', color: Colors.textMuted },
  itemLabel:     { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.1 },
  itemDesc:      { ...Typography.caption, color: Colors.textMuted, marginTop: 1 },
  itemStatePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
  },
  itemStateText: { ...Typography.badgeText, fontSize: 9 },

  // Fine tag (shows under damaged item header)
  fineTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  fineTagText: { ...Typography.caption, color: Colors.statusError },

  // State toggles
  stateRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 12 },
  stateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, height: 36, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.borderLight, backgroundColor: Colors.bgApp,
  },
  stateBtnText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  // Notes
  noteInput: {
    marginHorizontal: 12, marginBottom: 10, padding: 10,
    backgroundColor: Colors.bgApp, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.borderLight,
    ...Typography.bodySecondary, color: Colors.textPrimary, minHeight: 60,
  },

  // ── Damage fine summary card ──────────────────────────────────────────────
  fineSummaryCard: {
    backgroundColor: Colors.surfaceCard, borderRadius: 16,
    borderWidth: 1.5, borderColor: '#FECACA',
    padding: Spacing.md, marginTop: 4,
    shadowColor: '#EF4444', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  fineSummaryTitle: {
    ...Typography.labelCaps, color: Colors.statusError,
    marginBottom: 10, fontSize: 10, letterSpacing: 0.8,
  },
  fineSummaryRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  fineSummaryLabel: { ...Typography.bodySecondary, color: Colors.textSecondary },
  fineSummaryValue: { ...Typography.bodySecondary, color: Colors.textPrimary, fontWeight: '600' },
  fineSummaryDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 6 },
  fineSummaryRowHighlight: {
    backgroundColor: Colors.bgApp, borderRadius: 10,
    paddingHorizontal: 10, marginTop: 4, marginHorizontal: -4,
  },
  fineSummaryReturnLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  fineSummaryReturnValue: { fontSize: 16, fontWeight: '800' },
  depositZeroNote: { ...Typography.caption, color: Colors.statusError, marginTop: 8, fontStyle: 'italic' },

  // Issues-only (no fine)
  issueWarning: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFBEB', borderRadius: 12, padding: Spacing.md,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  issueWarningText: { ...Typography.bodySecondary, fontWeight: '600', flex: 1 },

  // Action bar
  actionBar: {
    flexDirection: 'row', gap: Spacing.sm,
    padding: Spacing.md, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
    backgroundColor: Colors.surfaceCard,
  },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  cancelBtnText:    { ...Typography.buttonPrimary, color: Colors.textSecondary },
  submitBtn: {
    flex: 2, height: 48, borderRadius: 14,
    backgroundColor: Colors.brandTeal,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { backgroundColor: Colors.borderLight },
  submitBtnText:     { ...Typography.buttonPrimary, color: '#fff' },

  // ── Raise ticket confirmation ──────────────────────────────────────────────
  ticketContent: {
    flex: 1, padding: Spacing.lg,
    alignItems: 'center', justifyContent: 'center', gap: Spacing.md,
  },
  ticketIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  ticketTitle:    { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  ticketSub:      { ...Typography.bodySecondary, color: Colors.textSecondary, textAlign: 'center', fontWeight: '600' },
  ticketQuestion: { ...Typography.bodyPrimary, color: Colors.textPrimary, fontWeight: '700', textAlign: 'center' },
  ticketHint:     { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', fontStyle: 'italic' },
  ticketActions:  { width: '100%', gap: 10, marginTop: 4 },
  ticketBtn: {
    width: '100%', height: 50, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  ticketBtnGhost: { borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.bgApp },
  ticketBtnText:  { ...Typography.buttonPrimary, fontSize: 14 },

  // Deposit summary inside ticket confirm
  depositSummaryCard: {
    width: '100%', backgroundColor: Colors.bgApp,
    borderRadius: 14, borderWidth: 1, borderColor: '#FECACA',
    padding: Spacing.md, gap: 6,
  },
  depositSummaryTitle: { ...Typography.labelCaps, color: Colors.statusError, fontSize: 10 },
  depositRow:         { flexDirection: 'row', justifyContent: 'space-between' },
  depositLabel:       { ...Typography.bodySecondary, color: Colors.textSecondary },
  depositValue:       { ...Typography.bodySecondary, fontWeight: '700', color: Colors.textPrimary },
  depositRowFinal:    {
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
    paddingTop: 6, marginTop: 2,
  },
  depositFinalLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  depositFinalValue: { fontSize: 16, fontWeight: '800' },
});
