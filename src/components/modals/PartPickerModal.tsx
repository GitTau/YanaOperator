// ─────────────────────────────────────────────────────────────────────────────
// PartPickerModal.tsx — Pick Store Inventory or Harvest Salvaged Part
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/design';
import { useDonorVehicles, usePartsCatalog, useStorePartsInventory } from '../../hooks/useQueries';
import type { JobCard, PartCatalog, StoreInventory } from '../../lib/database.types';
import { consumeJobCardPartService, recordSalvagedPartService } from '../../services/bookingService';

interface PartPickerModalProps {
  visible: boolean;
  jobCard: JobCard | null;
  storeId: string;
  onClose: () => void;
  onSuccess: () => void;
  onRequestPurchase: (partId: string) => void;
}

export function PartPickerModal({
  visible,
  jobCard,
  storeId,
  onClose,
  onSuccess,
  onRequestPurchase,
}: PartPickerModalProps) {
  if (!jobCard) return null;

  const [mode, setMode] = useState<'INVENTORY' | 'SALVAGED'>('INVENTORY');
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedDonorVehicleId, setSelectedDonorVehicleId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [salvageNotes, setSalvageNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries
  const { data: storeInventory, isLoading: invLoading } = useStorePartsInventory(storeId);
  const { data: allParts, isLoading: partsLoading } = usePartsCatalog();
  const { data: donorVehicles, isLoading: donorsLoading } = useDonorVehicles(storeId, jobCard.vehicle_id);

  const handleInstallInventoryPart = async (invItem: StoreInventory) => {
    const qty = parseInt(quantity, 10) || 1;
    if (invItem.quantity_on_hand < qty) {
      Alert.alert(
        'Out of Stock',
        `Only ${invItem.quantity_on_hand} available in store. Would you like to raise a purchase request?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Raise Request', onPress: () => onRequestPurchase(invItem.part_id) },
        ]
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await consumeJobCardPartService({
        p_job_card_id: jobCard.id,
        p_part_id: invItem.part_id,
        p_quantity: qty,
        p_condition: invItem.condition,
      });
      Alert.alert('Part Installed', `${invItem.part?.name ?? 'Part'} added to Job Card.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Installation Error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHarvestSalvagedPart = async () => {
    if (!selectedPartId) {
      Alert.alert('Selection Required', 'Please select which component was salvaged.');
      return;
    }
    if (!selectedDonorVehicleId) {
      Alert.alert('Donor Vehicle Required', 'Please select the donor vehicle from which this part was harvested.');
      return;
    }

    setIsSubmitting(true);
    try {
      await recordSalvagedPartService({
        p_job_card_id: jobCard.id,
        p_part_id: selectedPartId,
        p_donor_vehicle_id: selectedDonorVehicleId,
        p_condition: 'SALVAGED',
        p_notes: salvageNotes || null,
      });
      Alert.alert('Salvage Recorded', 'Salvaged part harvested from donor vehicle and attached to Job Card.');
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Salvage Error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Install Component</Text>
              <Text style={styles.subtitle}>
                Job Card: {jobCard.job_card_number} • {jobCard.vehicle?.plate_number}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </Pressable>
          </View>

          {/* Segment Toggle */}
          <View style={styles.segmentContainer}>
            <Pressable
              style={[styles.segmentBtn, mode === 'INVENTORY' && styles.segmentBtnActive]}
              onPress={() => setMode('INVENTORY')}
            >
              <Ionicons
                name="cube-outline"
                size={14}
                color={mode === 'INVENTORY' ? Colors.brandNavy : Colors.textSecondary}
              />
              <Text style={[styles.segmentBtnText, mode === 'INVENTORY' && styles.segmentBtnTextActive]}>
                Store Stock
              </Text>
            </Pressable>

            <Pressable
              style={[styles.segmentBtn, mode === 'SALVAGED' && styles.segmentBtnActive]}
              onPress={() => setMode('SALVAGED')}
            >
              <Ionicons
                name="git-branch-outline"
                size={14}
                color={mode === 'SALVAGED' ? Colors.brandNavy : Colors.textSecondary}
              />
              <Text style={[styles.segmentBtnText, mode === 'SALVAGED' && styles.segmentBtnTextActive]}>
                Harvest Salvaged Part
              </Text>
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {mode === 'INVENTORY' ? (
              <View>
                <View style={styles.qtyRow}>
                  <Text style={styles.qtyLabel}>Install Quantity:</Text>
                  <TextInput
                    style={styles.qtyInput}
                    keyboardType="numeric"
                    value={quantity}
                    onChangeText={setQuantity}
                  />
                </View>

                {invLoading ? (
                  <ActivityIndicator color={Colors.brandTeal} style={{ marginTop: 20 }} />
                ) : (storeInventory ?? []).length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="archive-outline" size={36} color={Colors.textMuted} />
                    <Text style={styles.emptyTitle}>No Inventory Seeded</Text>
                    <Text style={styles.emptySub}>Store inventory ledger is empty.</Text>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {(storeInventory ?? []).map((inv) => {
                      const inStock = inv.quantity_on_hand > 0;
                      return (
                        <View key={inv.id} style={styles.invCard}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.invPartName}>{inv.part?.name ?? 'Part'}</Text>
                            <View style={styles.invMeta}>
                              <Text style={styles.invCategory}>{inv.part?.category}</Text>
                              <Text style={[styles.invStock, !inStock && { color: Colors.statusError }]}>
                                Stock: {inv.quantity_on_hand}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.invPrice}>₹{inv.part?.mrp ?? 0}</Text>
                          <Pressable
                            style={[styles.invActionBtn, !inStock && styles.invActionBtnOos]}
                            disabled={isSubmitting}
                            onPress={() => handleInstallInventoryPart(inv)}
                          >
                            <Text style={[styles.invActionBtnText, !inStock && styles.invActionBtnTextOos]}>
                              {inStock ? 'Add' : 'Request'}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : (
              <View>
                {/* Salvaged Form */}
                <Text style={styles.formLabel}>Select Component to Harvest</Text>
                {partsLoading ? (
                  <ActivityIndicator color={Colors.brandTeal} />
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                    {(allParts ?? []).map((p) => {
                      const isSel = selectedPartId === p.id;
                      return (
                        <Pressable
                          key={p.id}
                          style={[styles.partChip, isSel && styles.partChipActive]}
                          onPress={() => setSelectedPartId(p.id)}
                        >
                          <Text style={[styles.partChipText, isSel && styles.partChipTextActive]}>
                            {p.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}

                <Text style={[styles.formLabel, { marginTop: 14 }]}>Select Donor Vehicle (Inactive / Scrap)</Text>
                {donorsLoading ? (
                  <ActivityIndicator color={Colors.brandTeal} />
                ) : (donorVehicles ?? []).length === 0 ? (
                  <Text style={styles.noDonorsText}>
                    No eligible donor vehicles in Maintenance or Inactive status at this store.
                  </Text>
                ) : (
                  <View style={styles.donorsList}>
                    {(donorVehicles ?? []).map((v: any) => {
                      const isSel = selectedDonorVehicleId === v.id;
                      return (
                        <Pressable
                          key={v.id}
                          style={[styles.donorCard, isSel && styles.donorCardActive]}
                          onPress={() => setSelectedDonorVehicleId(v.id)}
                        >
                          <Ionicons
                            name={isSel ? 'radio-button-on' : 'radio-button-off'}
                            size={16}
                            color={isSel ? Colors.brandTeal : Colors.textMuted}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.donorPlate}>{v.plate_number}</Text>
                            <Text style={styles.donorStatus}>{v.status}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <Text style={[styles.formLabel, { marginTop: 14 }]}>Salvage Inspection Notes</Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="e.g. Harvested working throttle from written-off frame..."
                  placeholderTextColor={Colors.textMuted}
                  value={salvageNotes}
                  onChangeText={setSalvageNotes}
                />

                <Pressable
                  style={[
                    styles.submitSalvageBtn,
                    (!selectedPartId || !selectedDonorVehicleId || isSubmitting) && styles.submitBtnDisabled,
                  ]}
                  disabled={!selectedPartId || !selectedDonorVehicleId || isSubmitting}
                  onPress={handleHarvestSalvagedPart}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={Colors.brandNavy} size="small" />
                  ) : (
                    <>
                      <Ionicons name="git-merge-outline" size={16} color={Colors.brandNavy} style={{ marginRight: 6 }} />
                      <Text style={styles.submitSalvageBtnText}>Confirm Salvage to Job Card</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,28,46,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surfaceCard,
    borderTopLeftRadius: Radius.modal,
    borderTopRightRadius: Radius.modal,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  segmentContainer: {
    flexDirection: 'row',
    padding: 4,
    backgroundColor: Colors.bgApp,
    marginHorizontal: Spacing.md,
    marginTop: 10,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: Radius.button - 2,
  },
  segmentBtnActive: {
    backgroundColor: Colors.brandTeal,
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  segmentBtnTextActive: {
    color: Colors.brandNavy,
    fontWeight: '800',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: Spacing.md,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 12,
  },
  qtyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  qtyInput: {
    width: 50,
    height: 32,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.input,
    textAlign: 'center',
    fontWeight: '800',
    color: Colors.textPrimary,
    backgroundColor: Colors.bgApp,
  },
  invCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.card,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 10,
  },
  invPartName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  invMeta: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  invCategory: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  invStock: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.statusActive,
  },
  invPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  invActionBtn: {
    backgroundColor: Colors.brandTeal,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.button,
  },
  invActionBtnOos: {
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.statusWarning,
  },
  invActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.brandNavy,
  },
  invActionBtnTextOos: {
    color: Colors.statusWarning,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptySub: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  formLabel: {
    ...Typography.labelCaps,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  chipsScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  partChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginRight: 8,
  },
  partChipActive: {
    backgroundColor: Colors.brandTeal,
    borderColor: Colors.brandTeal,
  },
  partChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  partChipTextActive: {
    color: Colors.brandNavy,
    fontWeight: '800',
  },
  donorsList: {
    gap: 6,
  },
  donorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  donorCardActive: {
    borderColor: Colors.brandTeal,
    backgroundColor: '#F0FDFA',
  },
  donorPlate: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  donorStatus: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  noDonorsText: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  notesInput: {
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.input,
    padding: 10,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  submitSalvageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandTeal,
    height: 44,
    borderRadius: Radius.button,
    marginTop: 18,
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitSalvageBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.brandNavy,
  },
});
