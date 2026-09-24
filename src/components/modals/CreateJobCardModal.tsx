// ─────────────────────────────────────────────────────────────────────────────
// CreateJobCardModal.tsx — Fast Defect Intake & Work Order Creation
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
import { useVehicles } from '../../hooks/useQueries';
import type { Vehicle } from '../../lib/database.types';
import { createJobCardService } from '../../services/bookingService';

interface CreateJobCardModalProps {
  visible: boolean;
  storeId: string;
  preselectedVehicle?: Vehicle | null;
  onClose: () => void;
  onSuccess: (jobCardId: string, jobCardNumber: string) => void;
}

const SEVERITIES = [
  { id: 'MINOR', label: 'Minor Defect', desc: 'Cosmetic, bulb, minor lever adjustment' },
  { id: 'MAJOR', label: 'Major Defect', desc: 'Brakes, wiring, throttle, controller' },
  { id: 'CRITICAL', label: 'Critical / Breakdown', desc: 'Motor burnt, frame/chassis, dead asset' },
];

export function CreateJobCardModal({
  visible,
  storeId,
  preselectedVehicle,
  onClose,
  onSuccess,
}: CreateJobCardModalProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(preselectedVehicle?.id ?? '');
  const [severity, setSeverity] = useState<string>('MAJOR');
  const [issue, setIssue] = useState('');
  const [odometer, setOdometer] = useState(preselectedVehicle?.odometer_km?.toString() ?? '0');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: allVehicles, isLoading: vLoading } = useVehicles(storeId);

  const handleSubmit = async () => {
    const vId = preselectedVehicle?.id ?? selectedVehicleId;
    if (!vId) {
      Alert.alert('Vehicle Required', 'Please select which vehicle has a defect.');
      return;
    }
    if (!issue.trim()) {
      Alert.alert('Issue Required', 'Please enter a description of the reported problem.');
      return;
    }

    setIsSubmitting(true);
    try {
      const odoKm = parseInt(odometer, 10) || 0;
      const res = await createJobCardService({
        p_vehicle_id: vId,
        p_store_id: storeId,
        p_trigger_type: 'CAPTAIN_REPORT',
        p_reported_issue: issue.trim(),
        p_severity: severity,
        p_priority: severity === 'CRITICAL' ? 'URGENT' : 'NORMAL',
        p_odometer_km: odoKm,
      });

      Alert.alert('Job Card Created', `Work Order ${res.job_card_number} opened. Vehicle moved to Maintenance.`);
      onSuccess(res.job_card_id, res.job_card_number);
      onClose();
    } catch (err: any) {
      Alert.alert('Creation Failed', err.message);
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
              <Text style={styles.title}>New Job Card</Text>
              <Text style={styles.subtitle}>Log defect & move vehicle to Maintenance Bay</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {/* Vehicle Selection */}
            {preselectedVehicle ? (
              <View style={styles.preselectedCard}>
                <Ionicons name="bicycle-outline" size={20} color={Colors.brandTeal} />
                <View>
                  <Text style={styles.preselectedPlate}>{preselectedVehicle.plate_number}</Text>
                  <Text style={styles.preselectedStatus}>Status: {preselectedVehicle.status}</Text>
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.label}>Select Vehicle</Text>
                {vLoading ? (
                  <ActivityIndicator color={Colors.brandTeal} />
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.vehicleScroll}>
                    {(allVehicles ?? []).map((v: any) => {
                      const isSel = selectedVehicleId === v.id;
                      return (
                        <Pressable
                          key={v.id}
                          style={[styles.vehicleChip, isSel && styles.vehicleChipActive]}
                          onPress={() => {
                            setSelectedVehicleId(v.id);
                            if (v.odometer_km) setOdometer(v.odometer_km.toString());
                          }}
                        >
                          <Text style={[styles.vehicleChipText, isSel && styles.vehicleChipTextActive]}>
                            {v.plate_number}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Severity Picker */}
            <View style={{ marginTop: 14 }}>
              <Text style={styles.label}>Defect Severity</Text>
              <View style={styles.severityCol}>
                {SEVERITIES.map((s) => {
                  const isSel = severity === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      style={[styles.sevCard, isSel && styles.sevCardActive]}
                      onPress={() => setSeverity(s.id)}
                    >
                      <Ionicons
                        name={isSel ? 'radio-button-on' : 'radio-button-off'}
                        size={16}
                        color={isSel ? Colors.brandTeal : Colors.textMuted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sevTitle, isSel && { color: Colors.brandNavy }]}>{s.label}</Text>
                        <Text style={styles.sevDesc}>{s.desc}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Defect Description */}
            <View style={{ marginTop: 14 }}>
              <Text style={styles.label}>Problem / Symptom Description</Text>
              <TextInput
                style={styles.textArea}
                placeholder="e.g. Rear brake completely loose, throttle cuts off intermittently..."
                placeholderTextColor={Colors.textMuted}
                value={issue}
                onChangeText={setIssue}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Current Odometer */}
            <View style={{ marginTop: 14 }}>
              <Text style={styles.label}>Current Odometer (km)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={odometer}
                onChangeText={setOdometer}
                placeholder="0"
              />
            </View>

            {/* Submit Button */}
            <Pressable
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
              disabled={isSubmitting}
              onPress={handleSubmit}
            >
              {isSubmitting ? (
                <ActivityIndicator color={Colors.brandNavy} size="small" />
              ) : (
                <>
                  <Ionicons name="construct-outline" size={16} color={Colors.brandNavy} style={{ marginRight: 6 }} />
                  <Text style={styles.submitBtnText}>Create Job Card</Text>
                </>
              )}
            </Pressable>
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
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: Spacing.md,
  },
  preselectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#F0FDFA',
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.brandTeal,
  },
  preselectedPlate: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  preselectedStatus: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  label: {
    ...Typography.labelCaps,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  vehicleScroll: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  vehicleChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginRight: 8,
  },
  vehicleChipActive: {
    backgroundColor: Colors.brandTeal,
    borderColor: Colors.brandTeal,
  },
  vehicleChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  vehicleChipTextActive: {
    color: Colors.brandNavy,
    fontWeight: '800',
  },
  severityCol: {
    gap: 6,
  },
  sevCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  sevCardActive: {
    backgroundColor: '#F8FAFC',
    borderColor: Colors.brandTeal,
  },
  sevTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sevDesc: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 1,
  },
  textArea: {
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.input,
    padding: 10,
    fontSize: 13,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
  },
  textInput: {
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.input,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandTeal,
    height: 44,
    borderRadius: Radius.button,
    marginTop: 20,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.brandNavy,
  },
});
