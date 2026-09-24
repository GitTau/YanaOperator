// ─────────────────────────────────────────────────────────────────────────────
// JobCardDetailModal.tsx — Mechanic Job Card Execution & QC Sign-off
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
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/design';
import type { JobCard } from '../../lib/database.types';
import { completeJobCardService, updateJobCardStatusService } from '../../services/bookingService';

interface JobCardDetailModalProps {
  visible: boolean;
  jobCard: JobCard | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpenPartPicker: (jobCard: JobCard) => void;
  onOpenPurchaseRequest: (jobCard: JobCard) => void;
  onOpenVehicleHistory: (vehicleId: string) => void;
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  MINOR: { bg: '#E0F2FE', text: '#0369A1' },
  MAJOR: { bg: '#FEF3C7', text: '#B45309' },
  CRITICAL: { bg: '#FEE2E2', text: '#B91C1C' },
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open / Pending',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_PARTS: 'Waiting for Parts',
  READY_FOR_TEST: 'Ready for QC Test',
  READY_FOR_DEPLOYMENT: 'Ready for Fleet',
  CLOSED: 'Completed & Released',
  CANCELLED: 'Cancelled',
};

export function JobCardDetailModal({
  visible,
  jobCard,
  onClose,
  onRefresh,
  onOpenPartPicker,
  onOpenPurchaseRequest,
  onOpenVehicleHistory,
}: JobCardDetailModalProps) {
  if (!jobCard) return null;

  const [qcConfirmed, setQcConfirmed] = useState(false);
  const [labourCost, setLabourCost] = useState('0');
  const [testNotes, setTestNotes] = useState('');
  const [diagnosisInput, setDiagnosisInput] = useState(jobCard.diagnosis ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parts = jobCard.parts ?? [];
  const partsTotal = parts.reduce((sum, p) => sum + (p.unit_cost * p.quantity), 0);
  const isClosed = jobCard.status === 'CLOSED';

  const handleUpdateStatus = async (nextStatus: string) => {
    setIsSubmitting(true);
    try {
      await updateJobCardStatusService(
        jobCard.id,
        nextStatus,
        diagnosisInput || undefined,
        undefined
      );
      onRefresh();
    } catch (err: any) {
      Alert.alert('Status Error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteAndRelease = async () => {
    if (!qcConfirmed) {
      Alert.alert('QC Required', 'Please confirm roadworthiness QC inspection before releasing the vehicle.');
      return;
    }

    Alert.alert(
      'Release Vehicle to Fleet?',
      `This will mark ${jobCard.vehicle?.plate_number ?? 'vehicle'} as Available for new bookings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Release',
          style: 'default',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              const parsedLabour = parseFloat(labourCost) || 0;
              await completeJobCardService({
                p_job_card_id: jobCard.id,
                p_roadworthiness_confirmed: true,
                p_final_test_notes: testNotes || null,
                p_labour_cost: parsedLabour,
              });
              Alert.alert('Vehicle Released', 'Job Card closed. Vehicle is now Available.');
              onRefresh();
              onClose();
            } catch (err: any) {
              Alert.alert('Release Error', err.message);
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const sevStyle = SEVERITY_COLORS[jobCard.severity] ?? { bg: Colors.bgApp, text: Colors.textSecondary };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.headerRow}>
                <Text style={styles.cardNumber}>{jobCard.job_card_number}</Text>
                <View style={[styles.badge, { backgroundColor: sevStyle.bg }]}>
                  <Text style={[styles.badgeText, { color: sevStyle.text }]}>{jobCard.severity}</Text>
                </View>
              </View>
              <Text style={styles.vehiclePlate}>
                {jobCard.vehicle?.plate_number ?? 'Vehicle'} • {STATUS_LABELS[jobCard.status] ?? jobCard.status}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {/* Quick Actions Bar */}
            <View style={styles.quickBar}>
              <Pressable
                style={styles.historyBtn}
                onPress={() => onOpenVehicleHistory(jobCard.vehicle_id)}
              >
                <Ionicons name="time-outline" size={14} color={Colors.brandTeal} />
                <Text style={styles.historyBtnText}>Vehicle History</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Text style={styles.createdDate}>
                Opened {new Date(jobCard.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </Text>
            </View>

            {/* Issue Description */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>REPORTED DEFECT</Text>
              <Text style={styles.issueText}>{jobCard.reported_issue}</Text>
              {jobCard.odometer_km > 0 && (
                <Text style={styles.odometerText}>Odometer at intake: {jobCard.odometer_km} km</Text>
              )}
            </View>

            {/* Mechanic Diagnosis */}
            {!isClosed && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>WORKSHOP DIAGNOSIS & NOTES</Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="Record root cause or inspection notes..."
                  placeholderTextColor={Colors.textMuted}
                  value={diagnosisInput}
                  onChangeText={setDiagnosisInput}
                  multiline
                  numberOfLines={3}
                />
              </View>
            )}

            {/* Parts Consumed Section */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>PARTS & COMPONENTS</Text>
                {!isClosed && (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable
                      style={styles.addPartBtn}
                      onPress={() => onOpenPartPicker(jobCard)}
                    >
                      <Ionicons name="add-circle-outline" size={14} color={Colors.brandNavy} />
                      <Text style={styles.addPartBtnText}>Use Part</Text>
                    </Pressable>
                    <Pressable
                      style={styles.reqPartBtn}
                      onPress={() => onOpenPurchaseRequest(jobCard)}
                    >
                      <Ionicons name="cart-outline" size={14} color={Colors.brandTeal} />
                      <Text style={styles.reqPartBtnText}>Request</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              {parts.length === 0 ? (
                <Text style={styles.emptyPartsText}>No parts installed on this Job Card yet.</Text>
              ) : (
                <View style={{ gap: 8, marginTop: 8 }}>
                  {parts.map((p, idx) => (
                    <View key={p.id ?? idx} style={styles.partRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.partName}>{p.part?.name ?? 'Component'}</Text>
                        <View style={styles.partMetaRow}>
                          <Text style={styles.partSource}>
                            {p.source_type === 'SALVAGED_DIRECT'
                              ? `Salvaged (${p.donor_vehicle?.plate_number ?? 'Donor'})`
                              : `Store Inventory • ${p.condition}`}
                          </Text>
                          <Text style={styles.partQty}>Qty: {p.quantity}</Text>
                        </View>
                      </View>
                      <Text style={styles.partCost}>
                        ₹{p.unit_cost * p.quantity}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.partsTotalRow}>
                    <Text style={styles.partsTotalLabel}>Parts Subtotal</Text>
                    <Text style={styles.partsTotalVal}>₹{partsTotal}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Lifecycle Status Buttons */}
            {!isClosed && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>UPDATE REPAIR STAGE</Text>
                <View style={styles.statusButtonsGrid}>
                  {jobCard.status !== 'IN_PROGRESS' && (
                    <Pressable
                      style={[styles.stageBtn, { backgroundColor: '#F0FDF4' }]}
                      onPress={() => handleUpdateStatus('IN_PROGRESS')}
                    >
                      <Ionicons name="play" size={14} color="#166534" />
                      <Text style={[styles.stageBtnText, { color: '#166534' }]}>In Progress</Text>
                    </Pressable>
                  )}
                  {jobCard.status !== 'WAITING_FOR_PARTS' && (
                    <Pressable
                      style={[styles.stageBtn, { backgroundColor: '#FFFBEB' }]}
                      onPress={() => handleUpdateStatus('WAITING_FOR_PARTS')}
                    >
                      <Ionicons name="time" size={14} color="#92400E" />
                      <Text style={[styles.stageBtnText, { color: '#92400E' }]}>Waiting Parts</Text>
                    </Pressable>
                  )}
                  {jobCard.status !== 'READY_FOR_TEST' && (
                    <Pressable
                      style={[styles.stageBtn, { backgroundColor: '#EFF6FF' }]}
                      onPress={() => handleUpdateStatus('READY_FOR_TEST')}
                    >
                      <Ionicons name="checkbox" size={14} color="#1E40AF" />
                      <Text style={[styles.stageBtnText, { color: '#1E40AF' }]}>Ready for QC</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}

            {/* QC Roadworthiness Sign-off & Vehicle Release */}
            {!isClosed && (
              <View style={[styles.sectionCard, styles.qcCard]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="shield-checkmark" size={18} color={Colors.brandTeal} />
                  <Text style={[styles.sectionTitle, { color: Colors.brandNavy, marginBottom: 0 }]}>
                    ROADWORTHINESS QC SIGN-OFF
                  </Text>
                </View>

                <View style={styles.switchRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.switchLabel}>5-Point Safety Inspection Passed</Text>
                    <Text style={styles.switchSub}>Brakes, throttle, lights, battery lock & test ride verified.</Text>
                  </View>
                  <Switch
                    value={qcConfirmed}
                    onValueChange={setQcConfirmed}
                    trackColor={{ false: Colors.borderLight, true: Colors.brandTeal }}
                  />
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.inputLabel}>Labour / Mechanic Charges (₹)</Text>
                  <TextInput
                    style={styles.costInput}
                    keyboardType="numeric"
                    value={labourCost}
                    onChangeText={setLabourCost}
                    placeholder="0"
                  />
                </View>

                <View style={{ marginTop: 10 }}>
                  <Text style={styles.inputLabel}>Final Test Ride Remarks</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Road test smooth, brakes responsive..."
                    placeholderTextColor={Colors.textMuted}
                    value={testNotes}
                    onChangeText={setTestNotes}
                  />
                </View>

                <Pressable
                  style={[
                    styles.releaseBtn,
                    (!qcConfirmed || isSubmitting) && styles.releaseBtnDisabled,
                  ]}
                  disabled={!qcConfirmed || isSubmitting}
                  onPress={handleCompleteAndRelease}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={Colors.brandNavy} size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done" size={18} color={Colors.brandNavy} style={{ marginRight: 6 }} />
                      <Text style={styles.releaseBtnText}>Complete & Release to Available</Text>
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
    maxHeight: '92%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  vehiclePlate: {
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 6,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  quickBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.button,
    backgroundColor: `${Colors.brandTeal}15`,
  },
  historyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brandTeal,
  },
  createdDate: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  sectionCard: {
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    ...Typography.labelCaps,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  issueText: {
    ...Typography.bodyPrimary,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  odometerText: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 4,
  },
  textArea: {
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.input,
    padding: 10,
    fontSize: 13,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
  },
  addPartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brandTeal,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.button,
    gap: 4,
  },
  addPartBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.brandNavy,
  },
  reqPartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.brandTeal,
    backgroundColor: Colors.surfaceCard,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.button,
    gap: 4,
  },
  reqPartBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brandTeal,
  },
  emptyPartsText: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceCard,
    padding: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  partName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  partMetaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  partSource: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  partQty: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.brandTeal,
  },
  partCost: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  partsTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  partsTotalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  partsTotalVal: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statusButtonsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  stageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: Radius.button,
  },
  stageBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  qcCard: {
    backgroundColor: '#F8FAFC',
    borderColor: Colors.brandTeal,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brandNavy,
  },
  switchSub: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  inputLabel: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  costInput: {
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.input,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  textInput: {
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.input,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  releaseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandTeal,
    height: 44,
    borderRadius: Radius.button,
    marginTop: 14,
  },
  releaseBtnDisabled: {
    opacity: 0.45,
  },
  releaseBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.brandNavy,
  },
});
