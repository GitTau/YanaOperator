// ─────────────────────────────────────────────────────────────────────────────
// VehicleHistoryModal.tsx — Chronological Maintenance & Repairs Timeline
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
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
import { useVehicleMaintenanceTimeline } from '../../hooks/useQueries';

interface VehicleHistoryModalProps {
  visible: boolean;
  vehicleId: string | null;
  onClose: () => void;
}

export function VehicleHistoryModal({
  visible,
  vehicleId,
  onClose,
}: VehicleHistoryModalProps) {
  if (!vehicleId) return null;

  const { data: timeline, isLoading } = useVehicleMaintenanceTimeline(vehicleId);

  const vehiclePlate = timeline?.[0]?.vehicle?.plate_number ?? 'Vehicle';
  const totalSpend = (timeline ?? []).reduce((acc, jc) => acc + (jc.total_cost || 0), 0);
  const totalJobs = (timeline ?? []).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Maintenance History</Text>
              <Text style={styles.subtitle}>{vehiclePlate} • {totalJobs} Job Card{totalJobs !== 1 ? 's' : ''} on record</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </Pressable>
          </View>

          {/* Quick Stats Bar */}
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>TOTAL REPAIR SPEND</Text>
              <Text style={styles.statVal}>₹{totalSpend.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>CURRENT ODOMETER</Text>
              <Text style={styles.statVal}>{timeline?.[0]?.odometer_km ?? 0} km</Text>
            </View>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {isLoading ? (
              <ActivityIndicator color={Colors.brandTeal} style={{ marginTop: 30 }} />
            ) : (timeline ?? []).length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="shield-checkmark-outline" size={40} color={Colors.statusActive} />
                <Text style={styles.emptyTitle}>Clean Service Record</Text>
                <Text style={styles.emptySub}>No prior repairs or defects recorded for this vehicle.</Text>
              </View>
            ) : (
              <View style={styles.timelineList}>
                {(timeline ?? []).map((jc, index) => {
                  const isLast = index === (timeline ?? []).length - 1;
                  const parts = jc.parts ?? [];
                  const dateStr = new Date(jc.created_at).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  });

                  return (
                    <View key={jc.id} style={styles.timelineItem}>
                      {/* Timeline Indicator Column */}
                      <View style={styles.indicatorCol}>
                        <View style={[styles.dot, jc.status === 'CLOSED' ? styles.dotClosed : styles.dotOpen]} />
                        {!isLast && <View style={styles.line} />}
                      </View>

                      {/* Content Card */}
                      <View style={styles.card}>
                        <View style={styles.cardHeader}>
                          <Text style={styles.cardNumber}>{jc.job_card_number}</Text>
                          <Text style={styles.cardDate}>{dateStr}</Text>
                        </View>

                        <Text style={styles.cardIssue}>{jc.reported_issue}</Text>

                        {jc.diagnosis && (
                          <Text style={styles.cardDiagnosis}>
                            <Text style={{ fontWeight: '700' }}>Diagnosis: </Text>
                            {jc.diagnosis}
                          </Text>
                        )}

                        {parts.length > 0 && (
                          <View style={styles.partsWrap}>
                            <Text style={styles.partsTitle}>Parts Replaced ({parts.length}):</Text>
                            {parts.map((p, pIdx) => (
                              <Text key={p.id ?? pIdx} style={styles.partItemText}>
                                • {p.part?.name ?? 'Part'} ({p.source_type === 'SALVAGED_DIRECT' ? 'Salvaged' : 'New'}, Qty: {p.quantity}) — ₹{p.unit_cost * p.quantity}
                              </Text>
                            ))}
                          </View>
                        )}

                        <View style={styles.cardFooter}>
                          <View style={[styles.statusPill, jc.status === 'CLOSED' ? styles.pillClosed : styles.pillOpen]}>
                            <Text style={[styles.statusPillText, jc.status === 'CLOSED' ? styles.pillClosedText : styles.pillOpenText]}>
                              {jc.status}
                            </Text>
                          </View>
                          <Text style={styles.costText}>Cost: ₹{jc.total_cost}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
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
  statsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.bgApp,
    marginHorizontal: Spacing.md,
    marginTop: 10,
    borderRadius: Radius.card,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.borderLight,
  },
  statLabel: {
    ...Typography.badgeText,
    color: Colors.textMuted,
    fontSize: 9,
  },
  statVal: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: Spacing.md,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  emptySub: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  timelineList: {
    gap: 0,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
  },
  indicatorCol: {
    alignItems: 'center',
    width: 16,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 6,
  },
  dotClosed: {
    backgroundColor: Colors.statusActive,
  },
  dotOpen: {
    backgroundColor: Colors.brandTeal,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.borderLight,
    marginVertical: 4,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.card,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  cardDate: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  cardIssue: {
    ...Typography.bodyPrimary,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  cardDiagnosis: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  partsWrap: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  partsTitle: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  partItemText: {
    ...Typography.caption,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  pillClosed: {
    backgroundColor: '#F0FDF4',
  },
  pillOpen: {
    backgroundColor: '#FEF3C7',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  pillClosedText: {
    color: '#166534',
  },
  pillOpenText: {
    color: '#B45309',
  },
  costText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
});
