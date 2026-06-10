// ─────────────────────────────────────────────────────────────────────────────
// MaintenanceModals.tsx — Three-step repair flow
//
// Step 1: MaintenanceChecklistModal
//   — For AVAILABLE vehicles: full checklist (OK/ISSUE/DAMAGED)
//   — On submit with issues → vehicle → Maintenance, ticket opened, proceed to Step 2
//   — On submit all OK → close (vehicle stays Available)
//
// Step 2: RepairPartsModal
//   — For MAINTENANCE/DEAD vehicles (or after Step 1)
//   — Shows only DAMAGED/ISSUE parts from latest checklist (or full list if no history)
//   — Parts picker with inventory stock counter
//   — Submit → Step 3
//
// Step 3: RepairCostModal
//   — Labour Cost + Parts Cost inputs
//   — Parts cost pre-filled from selected parts × assumed_cost
//   — On confirm: logRepairAndClose → vehicle → Available
//
// Business rules enforced:
//   — Status can only be set to Available / Maintenance / Inactive (not In Use)
//   — Aadhaar not in scope here
//   — All mutations via bookingService
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import {
  useChecklistTemplate,
  usePartsInventory,
  useVehicleLatestChecklist,
} from '../../hooks/useQueries';
import type { ChecklistTemplateItem } from '../../hooks/useQueries';
import type { PartsInventory, Vehicle } from '../../lib/database.types';
import {
  logRepairAndClose,
  openMaintenanceTicket,
  saveVehicleChecklist,
  updateVehicleStatus,
} from '../../services/bookingService';
import { useAuthStore } from '../../stores/authStore';

// ── Types — exported so maintenance.tsx can use the same shape ────────────────

type ChecklistItemState = 'ok' | 'issue' | 'damaged' | null;

export interface PartSelection {
  part: PartsInventory;
  qty: number;
  unitCost: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Maintenance Checklist Modal (Available vehicle → flag damage)
// ─────────────────────────────────────────────────────────────────────────────

interface MaintenanceChecklistModalProps {
  visible: boolean;
  vehicle: Vehicle;
  storeId: string;
  onClose: () => void;
  /** Called when checklist is done with issues — moves to repair flow */
  onIssuesFound: (vehicle: Vehicle, itemStates: Record<string, string>) => void;
}

const STATE_CONFIG: Record<
  Exclude<ChecklistItemState, null>,
  { label: string; color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>['name'] }
> = {
  ok:      { label: 'OK',      color: Colors.statusActive,  bg: '#F0FDF4', icon: 'checkmark-circle'  },
  issue:   { label: 'ISSUE',   color: Colors.statusWarning, bg: '#FFFBEB', icon: 'warning'            },
  damaged: { label: 'DAMAGED', color: Colors.statusError,   bg: '#FFF5F5', icon: 'close-circle'       },
};

function asIoniconName(name: string): React.ComponentProps<typeof Ionicons>['name'] {
  return name as React.ComponentProps<typeof Ionicons>['name'];
}

export function MaintenanceChecklistModal({
  visible,
  vehicle,
  storeId,
  onClose,
  onIssuesFound,
}: MaintenanceChecklistModalProps) {
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useChecklistTemplate('return');

  const [states, setStates] = useState<Record<string, ChecklistItemState>>({});
  const [notes, setNotes]   = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const totalItems     = items?.length ?? 0;
  const completedCount = (items ?? []).filter(i => states[i.item_key] != null).length;
  const allComplete    = totalItems > 0 && completedCount === totalItems;
  const hasIssues      = Object.values(states).some(s => s === 'issue' || s === 'damaged');

  const setItemState = (key: string, state: ChecklistItemState) =>
    setStates(prev => ({ ...prev, [key]: prev[key] === state ? null : state }));

  const handleClose = () => {
    setStates({});
    setNotes({});
    onClose();
  };

  const handleSubmit = useCallback(async () => {
    if (!allComplete || submitting) return;
    setSubmitting(true);
    try {
      // Persist checklist
      const itemStatesStrings: Record<string, string> = {};
      for (const [k, v] of Object.entries(states)) {
        if (v) itemStatesStrings[k] = v;
      }
      await saveVehicleChecklist({
        vehicleId:   vehicle.id,
        storeId,
        bookingId:   null,
        flow:        'maintenance',
        itemStates:  itemStatesStrings,
        itemNotes:   notes,
        submittedBy: profile?.id ?? null,
      });

      if (hasIssues) {
        // Move vehicle to Maintenance
        await updateVehicleStatus(vehicle.id, 'Maintenance');
        queryClient.invalidateQueries({ queryKey: ['vehicles', storeId] });
        queryClient.invalidateQueries({ queryKey: ['maintenance_vehicles', storeId] });
        handleClose();
        onIssuesFound(vehicle, itemStatesStrings);
      } else {
        // All OK — vehicle stays Available
        queryClient.invalidateQueries({ queryKey: ['vehicles', storeId] });
        handleClose();
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Checklist submission failed.');
    } finally {
      setSubmitting(false);
    }
  }, [allComplete, submitting, states, notes, vehicle, storeId, hasIssues, profile]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Inspection Checklist</Text>
            <Text style={styles.headerSub}>{vehicle.plate_number} · Available</Text>
          </View>
          <Pressable onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {/* Progress */}
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
          <Text style={styles.progressLabel}>{totalItems > 0 ? `${completedCount}/${totalItems}` : '…'}</Text>
        </View>

        {isLoading ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator size="large" color={Colors.brandTeal} />
            <Text style={styles.centerText}>Loading checklist…</Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.md, gap: 10, paddingBottom: 120 }}>
            {(items ?? []).map((item: ChecklistTemplateItem, idx: number) => {
              const current   = states[item.item_key] ?? null;
              const needsNote = current === 'issue' || current === 'damaged';
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
                  <View style={styles.itemHeader}>
                    <View style={styles.itemIndex}><Text style={styles.itemIndexText}>{String(idx + 1).padStart(2, '0')}</Text></View>
                    <Ionicons name={asIoniconName(item.icon_name)} size={16} color={current ? STATE_CONFIG[current].color : Colors.textMuted} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.itemLabel}>{item.label}</Text>
                      <Text style={styles.itemDesc}>{item.description}</Text>
                    </View>
                    {current && (
                      <View style={[styles.statePill, { backgroundColor: STATE_CONFIG[current].bg }]}>
                        <Ionicons name={STATE_CONFIG[current].icon} size={10} color={STATE_CONFIG[current].color} />
                        <Text style={[styles.statePillText, { color: STATE_CONFIG[current].color }]}>{STATE_CONFIG[current].label}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.stateRow}>
                    {(['ok', 'issue', 'damaged'] as Exclude<ChecklistItemState, null>[]).map(state => (
                      <Pressable
                        key={state}
                        style={({ pressed }) => [
                          styles.stateBtn,
                          current === state && { backgroundColor: STATE_CONFIG[state].bg, borderColor: STATE_CONFIG[state].color },
                          { transform: [{ scale: pressed ? 0.95 : 1 }] },
                        ]}
                        onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setItemState(item.item_key, state); }}
                      >
                        <Ionicons name={STATE_CONFIG[state].icon} size={12} color={current === state ? STATE_CONFIG[state].color : Colors.textMuted} />
                        <Text style={[styles.stateBtnText, { color: current === state ? STATE_CONFIG[state].color : Colors.textMuted }]}>{STATE_CONFIG[state].label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {needsNote && (
                    <TextInput
                      style={styles.noteInput}
                      value={notes[item.item_key] ?? ''}
                      onChangeText={t => setNotes(prev => ({ ...prev, [item.item_key]: t }))}
                      placeholder={`Describe ${current === 'damaged' ? 'damage' : 'issue'}…`}
                      placeholderTextColor={Colors.textMuted}
                      multiline numberOfLines={2} textAlignVertical="top"
                    />
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.actionBar}>
          <Pressable style={styles.cancelBtn} onPress={handleClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.submitBtn, !allComplete && styles.submitBtnDisabled]}
            disabled={!allComplete || submitting}
            onPress={handleSubmit}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Ionicons name={hasIssues ? 'construct-outline' : 'checkmark-circle-outline'} size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.submitBtnText}>{hasIssues ? 'Flag & Continue' : 'All Clear'}</Text>
                </>
            }
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Repair Parts Modal
// Shows damaged parts from last checklist + full inventory picker
// ─────────────────────────────────────────────────────────────────────────────

interface RepairPartsModalProps {
  visible: boolean;
  vehicle: Vehicle;
  storeId: string;
  /** Pre-populated damaged item states from Step 1 or from DB checklist */
  damagedItemStates?: Record<string, string>;
  onClose: () => void;
  onPartsSelected: (vehicle: Vehicle, ticketId: string, selectedParts: PartSelection[]) => void;
}

export function RepairPartsModal({
  visible,
  vehicle,
  storeId,
  damagedItemStates,
  onClose,
  onPartsSelected,
}: RepairPartsModalProps) {
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: allParts, isLoading: partsLoading } = usePartsInventory();
  const { data: latestChecklist, isLoading: checklistLoading } = useVehicleLatestChecklist(
    damagedItemStates ? null : vehicle.id, // if states provided externally, skip DB fetch
  );

  const [selected, setSelected]   = useState<Record<string, PartSelection>>({});
  const [searchQuery, setSearch]  = useState('');
  const [showAllParts, setShowAll] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Resolve which item states to show as damaged
  // latestChecklist is typed as `never` due to stale DB generics — cast through unknown
  const effectiveStates: Record<string, string> = useMemo(() => {
    if (damagedItemStates) return damagedItemStates;
    const checklist = latestChecklist as unknown as { item_states: Record<string, string> } | null;
    if (checklist?.item_states) return checklist.item_states;
    return {};
  }, [damagedItemStates, latestChecklist]);

  const damagedKeys = useMemo(
    () => Object.entries(effectiveStates).filter(([, v]) => v === 'damaged' || v === 'issue').map(([k]) => k),
    [effectiveStates],
  );

  // Map damaged item_keys → matching parts from inventory (by problem description keyword match)
  const flaggedParts: PartsInventory[] = useMemo(() => {
    if (!allParts || damagedKeys.length === 0) return [];
    // Parts that appear in flagged checklist items — show all parts for selection since
    // we don't have a direct item_key → part_id FK. Show the full list filtered.
    return allParts;
  }, [allParts, damagedKeys]);

  const filteredParts = useMemo(() => {
    const src = showAllParts ? (allParts ?? []) : flaggedParts;
    if (!searchQuery.trim()) return src;
    const q = searchQuery.toLowerCase();
    return src.filter(p =>
      p.part_name.toLowerCase().includes(q) ||
      p.problem_description.toLowerCase().includes(q),
    );
  }, [showAllParts, allParts, flaggedParts, searchQuery]);

  const selectedList = Object.values(selected).filter(s => s.qty > 0);

  const adjustQty = (part: PartsInventory, delta: number) => {
    setSelected(prev => {
      const current = prev[part.id]?.qty ?? 0;
      const newQty  = Math.max(0, current + delta);
      if (newQty === 0) {
        const next = { ...prev };
        delete next[part.id];
        return next;
      }
      return {
        ...prev,
        [part.id]: { part, qty: newQty, unitCost: part.assumed_cost },
      };
    });
  };

  const handleClose = () => {
    setSelected({});
    setSearch('');
    setShowAll(false);
    onClose();
  };

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Open a maintenance ticket
      const description = damagedKeys.length > 0
        ? `Damaged/Issue parts flagged: ${damagedKeys.join(', ')}`
        : 'Manual maintenance check';
      const ticketId = await openMaintenanceTicket({
        vehicleId:   vehicle.id,
        storeId,
        description,
      });
      queryClient.invalidateQueries({ queryKey: ['open_maintenance_tickets', storeId] });
      handleClose();
      onPartsSelected(vehicle, ticketId, selectedList);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to open ticket.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, damagedKeys, vehicle, storeId, selectedList]);

  const isLoading = partsLoading || checklistLoading;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Parts Used</Text>
            <Text style={styles.headerSub}>{vehicle.plate_number} · Under Repair</Text>
          </View>
          <Pressable onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {/* Damaged parts banner */}
        {damagedKeys.length > 0 && (
          <View style={styles.damagedBanner}>
            <Ionicons name="warning-outline" size={14} color={Colors.statusWarning} style={{ marginRight: 6 }} />
            <Text style={styles.damagedBannerText}>
              {damagedKeys.length} part{damagedKeys.length > 1 ? 's' : ''} flagged from last checklist
            </Text>
          </View>
        )}

        {/* Search + toggle */}
        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={14} color={Colors.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearch}
              placeholder="Search parts…"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <Pressable
            style={[styles.toggleBtn, showAllParts && styles.toggleBtnActive]}
            onPress={() => setShowAll(v => !v)}
          >
            <Text style={[styles.toggleBtnText, showAllParts && { color: Colors.brandTeal }]}>
              {showAllParts ? 'Flagged Only' : 'All Parts'}
            </Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator size="large" color={Colors.brandTeal} />
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.md, gap: 8, paddingBottom: 140 }}>
            {filteredParts.length === 0 && (
              <View style={styles.centerWrap}>
                <Ionicons name="file-tray-outline" size={28} color={Colors.textMuted} />
                <Text style={[styles.centerText, { marginTop: 8 }]}>No parts found</Text>
              </View>
            )}
            {filteredParts.map(part => {
              const qty = selected[part.id]?.qty ?? 0;
              return (
                <View key={part.id} style={[styles.partCard, qty > 0 && styles.partCardSelected]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.partName}>{part.part_name}</Text>
                    <Text style={styles.partDesc}>{part.problem_description}
                      {part.subpart !== 'NA' ? ` · ${part.subpart}` : ''}
                    </Text>
                    <View style={styles.partMeta}>
                      <View style={styles.stockBadge}>
                        <Ionicons name="cube-outline" size={10} color={Colors.textMuted} />
                        <Text style={styles.stockText}>Stock: {part.stock_qty}</Text>
                      </View>
                      {part.assumed_cost > 0 && (
                        <Text style={styles.partCostText}>₹{part.assumed_cost.toLocaleString('en-IN')}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.qtyControls}>
                    <Pressable
                      style={[styles.qtyBtn, qty === 0 && styles.qtyBtnDisabled]}
                      onPress={() => adjustQty(part, -1)}
                      disabled={qty === 0}
                    >
                      <Ionicons name="remove" size={14} color={qty === 0 ? Colors.textMuted : Colors.statusError} />
                    </Pressable>
                    <Text style={[styles.qtyValue, qty > 0 && { color: Colors.brandTeal, fontWeight: '800' }]}>
                      {qty}
                    </Text>
                    <Pressable
                      style={styles.qtyBtn}
                      onPress={() => adjustQty(part, 1)}
                    >
                      <Ionicons name="add" size={14} color={Colors.statusActive} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Selected summary */}
        {selectedList.length > 0 && (
          <View style={styles.selectedSummary}>
            <Text style={styles.selectedSummaryText}>
              {selectedList.length} part{selectedList.length > 1 ? 's' : ''} selected ·{' '}
              ₹{selectedList.reduce((s, p) => s + p.qty * p.unitCost, 0).toLocaleString('en-IN')} est.
            </Text>
          </View>
        )}

        <View style={styles.actionBar}>
          <Pressable style={styles.cancelBtn} onPress={handleClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={styles.submitBtn}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Ionicons name="arrow-forward-circle-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.submitBtnText}>Next: Enter Costs</Text>
                </>
            }
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Repair Cost Modal
// Labour cost + Parts cost → confirm → vehicle → Available
// ─────────────────────────────────────────────────────────────────────────────

interface RepairCostModalProps {
  visible: boolean;
  vehicle: Vehicle;
  ticketId: string;
  selectedParts: PartSelection[];
  onClose: () => void;
  onComplete: () => void;
}

export function RepairCostModal({
  visible,
  vehicle,
  ticketId,
  selectedParts,
  onClose,
  onComplete,
}: RepairCostModalProps) {
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();

  const defaultPartsCost = useMemo(
    () => selectedParts.reduce((s, p) => s + p.qty * p.unitCost, 0),
    [selectedParts],
  );

  const [labourCost, setLabourCost] = useState('');
  const [partsCost, setPartsCost]   = useState(String(defaultPartsCost));
  const [notes, setNotes]           = useState('');
  const [submitting, setSubmitting] = useState(false);

  const parsedLabour = parseFloat(labourCost) || 0;
  const parsedParts  = parseFloat(partsCost)  || 0;
  const totalCost    = parsedLabour + parsedParts;

  const handleClose = () => {
    setLabourCost('');
    setPartsCost(String(defaultPartsCost));
    setNotes('');
    onClose();
  };

  const handleConfirm = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await logRepairAndClose({
        ticketId,
        vehicleId: vehicle.id,
        labourCost: parsedLabour,
        partsCost:  parsedParts,
        partsUsed:  selectedParts.map(p => ({
          part_id:   p.part.id,
          part_name: p.part.part_name,
          qty:       p.qty,
          unit_cost: p.unitCost,
        })),
        resolutionNotes: notes,
        resolvedBy:      profile?.id ?? null,
      });

      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance_vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['open_maintenance_tickets'] });
      queryClient.invalidateQueries({ queryKey: ['parts_inventory'] });

      handleClose();
      onComplete();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to close repair.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, ticketId, vehicle.id, parsedLabour, parsedParts, selectedParts, notes, profile]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Repair Costs</Text>
              <Text style={styles.headerSub}>{vehicle.plate_number} · Closing Repair</Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md, paddingBottom: 120 }}>

            {/* Parts used summary */}
            {selectedParts.length > 0 && (
              <View style={styles.partsSummaryCard}>
                <Text style={styles.partsSummaryTitle}>PARTS USED</Text>
                {selectedParts.map(p => (
                  <View key={p.part.id} style={styles.partsSummaryRow}>
                    <Text style={styles.partsSummaryName}>{p.part.part_name} × {p.qty}</Text>
                    <Text style={styles.partsSummaryVal}>₹{(p.qty * p.unitCost).toLocaleString('en-IN')}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Labour Cost input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>LABOUR COST (₹)</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.inputPrefix}>₹</Text>
                <TextInput
                  style={styles.costInput}
                  value={labourCost}
                  onChangeText={setLabourCost}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <Text style={styles.inputHint}>Mechanic / technician charges</Text>
            </View>

            {/* Parts Cost input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PARTS COST (₹)</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.inputPrefix}>₹</Text>
                <TextInput
                  style={styles.costInput}
                  value={partsCost}
                  onChangeText={setPartsCost}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <Text style={styles.inputHint}>
                Pre-filled from selected parts · editing updates inventory reference cost
              </Text>
            </View>

            {/* Resolution Notes */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>REPAIR NOTES (optional)</Text>
              <TextInput
                style={[styles.costInput, styles.notesInput]}
                value={notes}
                onChangeText={setNotes}
                placeholder="What was repaired / replaced…"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Total cost card */}
            <View style={styles.totalCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Labour</Text>
                <Text style={styles.totalVal}>₹{parsedLabour.toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Parts</Text>
                <Text style={styles.totalVal}>₹{parsedParts.toLocaleString('en-IN')}</Text>
              </View>
              <View style={[styles.totalRow, styles.totalFinalRow]}>
                <Text style={styles.totalFinalLabel}>Total Repair Cost</Text>
                <Text style={styles.totalFinalVal}>₹{totalCost.toLocaleString('en-IN')}</Text>
              </View>
            </View>

            {/* Confirmation banner */}
            <View style={styles.confirmBanner}>
              <Ionicons name="checkmark-circle-outline" size={16} color={Colors.statusActive} style={{ marginRight: 8 }} />
              <Text style={styles.confirmBannerText}>
                On confirm, {vehicle.plate_number} will return to{' '}
                <Text style={{ fontWeight: '800', color: Colors.statusActive }}>Available</Text>
              </Text>
            </View>
          </ScrollView>

          <View style={styles.actionBar}>
            <Pressable style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.submitBtn}
              onPress={handleConfirm}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="checkmark-done-circle-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.submitBtnText}>Confirm Repair</Text>
                  </>
              }
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgApp },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.borderLight,
    alignSelf: 'center', marginTop: 10, marginBottom: 6,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: 12,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.3 },
  headerSub:   { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  closeBtn:    { padding: 4 },

  progressWrap: {
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  progressTrack: { flex: 1, height: 6, borderRadius: 100, backgroundColor: Colors.borderLight, overflow: 'hidden' },
  progressFill:  { height: 6, borderRadius: 100 },
  progressLabel: { ...Typography.caption, color: Colors.textSecondary, minWidth: 40, textAlign: 'right' },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  centerText: { ...Typography.bodySecondary, color: Colors.textSecondary },

  // Checklist item card
  itemCard: {
    backgroundColor: Colors.surfaceCard, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.borderLight, overflow: 'hidden',
    shadowColor: '#B0BAD0', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 1,
  },
  itemHeader:    { flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: 10, gap: 4 },
  itemIndex:     { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.bgApp, alignItems: 'center', justifyContent: 'center', marginRight: 4, borderWidth: 1, borderColor: Colors.borderLight },
  itemIndexText: { fontSize: 10, fontWeight: '700', color: Colors.textMuted },
  itemLabel:     { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  itemDesc:      { ...Typography.caption, color: Colors.textMuted, marginTop: 1 },
  statePill:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  statePillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  stateRow:      { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 12 },
  stateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, height: 36, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.borderLight, backgroundColor: Colors.bgApp,
  },
  stateBtnText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  noteInput: {
    marginHorizontal: 12, marginBottom: 10, padding: 10,
    backgroundColor: Colors.bgApp, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.borderLight,
    ...Typography.bodySecondary, color: Colors.textPrimary, minHeight: 60,
  },

  // Damaged banner
  damagedBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceAmber,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#FDE68A',
  },
  damagedBannerText: { ...Typography.caption, color: Colors.statusWarning, fontWeight: '700' },

  // Search row
  searchRow: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bgApp, borderRadius: Radius.input,
    borderWidth: 1, borderColor: Colors.borderLight,
    paddingHorizontal: 10, height: 36,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  toggleBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.pill,
    borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.surfaceCard,
  },
  toggleBtnActive: { borderColor: Colors.brandTeal, backgroundColor: `${Colors.brandTeal}10` },
  toggleBtnText:   { ...Typography.badgeText, color: Colors.textSecondary, fontSize: 10 },

  // Part card
  partCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surfaceCard, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.borderLight,
    padding: 12,
  },
  partCardSelected: { borderColor: Colors.brandTeal, backgroundColor: `${Colors.brandTeal}08` },
  partName:    { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  partDesc:    { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  partMeta:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  stockBadge:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  stockText:   { ...Typography.caption, color: Colors.textMuted },
  partCostText:{ ...Typography.caption, color: Colors.statusWarning, fontWeight: '700' },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: Colors.bgApp, borderWidth: 1, borderColor: Colors.borderLight,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnDisabled: { opacity: 0.4 },
  qtyValue: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, minWidth: 20, textAlign: 'center' },

  // Selected summary strip
  selectedSummary: {
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    backgroundColor: `${Colors.brandTeal}12`,
    borderTopWidth: 1, borderTopColor: `${Colors.brandTeal}30`,
  },
  selectedSummaryText: { ...Typography.caption, color: Colors.brandTeal, fontWeight: '700', textAlign: 'center' },

  // Cost inputs
  partsSummaryCard: {
    backgroundColor: Colors.surfaceCard, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.borderLight, padding: Spacing.md,
  },
  partsSummaryTitle: { ...Typography.labelCaps, color: Colors.textMuted, marginBottom: 8 },
  partsSummaryRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  partsSummaryName:  { ...Typography.bodySecondary, color: Colors.textSecondary },
  partsSummaryVal:   { ...Typography.bodySecondary, fontWeight: '700', color: Colors.textPrimary },

  inputGroup: { gap: 6 },
  inputLabel: { ...Typography.labelCaps, color: Colors.textSecondary },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceCard, borderRadius: Radius.input,
    borderWidth: 1.5, borderColor: Colors.borderInput, height: 52,
    paddingHorizontal: Spacing.md,
  },
  inputPrefix: { fontSize: 18, fontWeight: '700', color: Colors.textMuted, marginRight: 6 },
  costInput:   { flex: 1, fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  notesInput:  { fontSize: 14, fontWeight: '400', height: 80, paddingTop: 12 },
  inputHint:   { ...Typography.caption, color: Colors.textMuted },

  // Total card
  totalCard: {
    backgroundColor: Colors.surfaceCard, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.borderLight, padding: Spacing.md, gap: 6,
  },
  totalRow:       { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel:     { ...Typography.bodySecondary, color: Colors.textSecondary },
  totalVal:       { ...Typography.bodySecondary, fontWeight: '600', color: Colors.textPrimary },
  totalFinalRow:  { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 8, marginTop: 2 },
  totalFinalLabel:{ fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  totalFinalVal:  { fontSize: 18, fontWeight: '800', color: Colors.statusActive },

  // Confirm banner
  confirmBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceGreen, borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  confirmBannerText: { ...Typography.bodySecondary, color: Colors.statusActive, flex: 1 },

  // Action bar
  actionBar: {
    flexDirection: 'row', gap: Spacing.sm,
    padding: Spacing.md, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
    backgroundColor: Colors.surfaceCard,
  },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: Radius.button,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  cancelBtnText: { ...Typography.buttonPrimary, color: Colors.textSecondary },
  submitBtn: {
    flex: 2, height: 48, borderRadius: Radius.button,
    backgroundColor: Colors.brandTeal,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { backgroundColor: Colors.borderLight },
  submitBtnText:     { ...Typography.buttonPrimary, color: Colors.brandNavy },
});
