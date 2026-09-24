// ─────────────────────────────────────────────────────────────────────────────
// Maintenance Bay — Mechanic & Captain Operations Workspace
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { ErrorBanner, KPICard, SkeletonCard } from '../../src/components/ui';
import { useJobCards, useVehicles } from '../../src/hooks/useQueries';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import { useAuthStore } from '../../src/stores/authStore';
import type { JobCard, Vehicle } from '../../src/lib/database.types';

// Modals
import { JobCardDetailModal } from '../../src/components/modals/JobCardDetailModal';
import { PartPickerModal } from '../../src/components/modals/PartPickerModal';
import { CreateJobCardModal } from '../../src/components/modals/CreateJobCardModal';
import { PurchaseRequestModal } from '../../src/components/modals/PurchaseRequestModal';
import { VehicleHistoryModal } from '../../src/components/modals/VehicleHistoryModal';

type FilterTab = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_PARTS' | 'READY_FOR_TEST' | 'CLOSED';

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  MINOR: { bg: '#E0F2FE', text: '#0369A1' },
  MAJOR: { bg: '#FEF3C7', text: '#B45309' },
  CRITICAL: { bg: '#FEE2E2', text: '#B91C1C' },
};

const STATUS_BADGE_STYLE: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: '#EFF6FF', text: '#1E40AF' },
  ASSIGNED: { bg: '#F3E8FF', text: '#7E22CE' },
  IN_PROGRESS: { bg: '#F0FDF4', text: '#166534' },
  WAITING_FOR_PARTS: { bg: '#FFFBEB', text: '#92400E' },
  READY_FOR_TEST: { bg: '#F5F3FF', text: '#5B21B6' },
  READY_FOR_DEPLOYMENT: { bg: '#ECFDF5', text: '#047857' },
  CLOSED: { bg: '#F1F5F9', text: '#475569' },
  CANCELLED: { bg: '#FEF2F2', text: '#991B1B' },
};

export default function MaintenanceScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const { profile } = useAuthStore();
  const storeId = selectedStore?.store_id ?? null;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');

  // Modals state
  const [selectedJobCard, setSelectedJobCard] = useState<JobCard | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPartPicker, setShowPartPicker] = useState(false);
  const [showCreateJobCard, setShowCreateJobCard] = useState(false);
  const [showPurchaseRequest, setShowPurchaseRequest] = useState(false);
  const [purchasePartId, setPurchasePartId] = useState<string | null>(null);
  const [historyVehicleId, setHistoryVehicleId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Queries
  const { data: jobCards, isLoading, error, refetch } = useJobCards(storeId, activeTab);
  const { data: allJobCards } = useJobCards(storeId, 'ALL');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['job_cards', storeId ?? ''] });
    queryClient.invalidateQueries({ queryKey: ['vehicles', storeId ?? ''] });
    queryClient.invalidateQueries({ queryKey: ['store_inventory', storeId ?? ''] });
  };

  // KPIs
  const all = allJobCards ?? [];
  const openCount = all.filter(j => j.status === 'OPEN').length;
  const inProgressCount = all.filter(j => j.status === 'IN_PROGRESS').length;
  const waitingPartsCount = all.filter(j => j.status === 'WAITING_FOR_PARTS').length;
  const qcReadyCount = all.filter(j => j.status === 'READY_FOR_TEST').length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Screen Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[Typography.overline, { color: Colors.textSecondary }]}>FLEET OPERATIONS</Text>
          <Text style={[Typography.h1Screen, { color: Colors.textPrimary, marginTop: 1 }]}>Maintenance Bay</Text>
        </View>
        <Pressable
          style={styles.newJobBtn}
          onPress={() => setShowCreateJobCard(true)}
        >
          <Ionicons name="add" size={16} color={Colors.brandNavy} />
          <Text style={styles.newJobBtnText}>New Job</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={invalidate} tintColor={Colors.brandTeal} />}
      >
        {error && <ErrorBanner message="Failed to load Job Cards" onRetry={invalidate} />}

        {/* Top KPI Cards */}
        <View style={styles.kpiRow}>
          <KPICard
            label="In Progress"
            value={inProgressCount}
            valueColor={inProgressCount > 0 ? Colors.statusWarning : Colors.textPrimary}
            accentColor={inProgressCount > 0 ? Colors.statusWarning : undefined}
            icon="construct-outline"
          />
          <KPICard
            label="Waiting Parts"
            value={waitingPartsCount}
            valueColor={waitingPartsCount > 0 ? Colors.statusError : Colors.textPrimary}
            accentColor={waitingPartsCount > 0 ? Colors.statusError : undefined}
            icon="time-outline"
          />
          <KPICard
            label="Ready for QC"
            value={qcReadyCount}
            valueColor={qcReadyCount > 0 ? Colors.statusActive : Colors.textPrimary}
            accentColor={qcReadyCount > 0 ? Colors.statusActive : undefined}
            icon="shield-checkmark-outline"
          />
        </View>

        {/* Tab Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {[
            { id: 'ALL', label: 'All Jobs' },
            { id: 'OPEN', label: `Open (${openCount})` },
            { id: 'IN_PROGRESS', label: `In Progress (${inProgressCount})` },
            { id: 'WAITING_FOR_PARTS', label: `Waiting Parts (${waitingPartsCount})` },
            { id: 'READY_FOR_TEST', label: `QC Ready (${qcReadyCount})` },
            { id: 'CLOSED', label: 'Closed' },
          ].map((tab) => {
            const isSel = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={[styles.filterChip, isSel && styles.filterChipActive]}
                onPress={() => setActiveTab(tab.id as FilterTab)}
              >
                <Text style={[styles.filterChipText, isSel && styles.filterChipTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Job Cards List */}
        {isLoading ? (
          <View style={{ gap: 10 }}>
            {[1, 2, 3].map(k => <SkeletonCard key={k} height={100} />)}
          </View>
        ) : (jobCards ?? []).length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-circle-outline" size={44} color={Colors.statusActive} />
            <Text style={styles.emptyTitle}>Maintenance Bay Clear</Text>
            <Text style={styles.emptySubtitle}>No active job cards in this view.</Text>
          </View>
        ) : (
          <View style={styles.jobCardsList}>
            {(jobCards ?? []).map((jc) => {
              const sev = SEVERITY_COLORS[jc.severity] ?? { bg: Colors.bgApp, text: Colors.textSecondary };
              const st = STATUS_BADGE_STYLE[jc.status] ?? { bg: Colors.bgApp, text: Colors.textSecondary };
              const daysOld = Math.floor((Date.now() - new Date(jc.created_at).getTime()) / (1000 * 60 * 60 * 24));
              const isOverdue = daysOld >= 2 && jc.status !== 'CLOSED';

              return (
                <Pressable
                  key={jc.id}
                  style={({ pressed }) => [styles.jobCard, { opacity: pressed ? 0.85 : 1 }]}
                  onPress={() => {
                    setSelectedJobCard(jc);
                    setShowDetailModal(true);
                  }}
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.plateWrap}>
                      <Ionicons name="bicycle-outline" size={16} color={Colors.brandTeal} />
                      <Text style={styles.plateNumber}>{jc.vehicle?.plate_number ?? 'Vehicle'}</Text>
                    </View>
                    <View style={styles.badgeRow}>
                      <View style={[styles.pill, { backgroundColor: sev.bg }]}>
                        <Text style={[styles.pillText, { color: sev.text }]}>{jc.severity}</Text>
                      </View>
                      <View style={[styles.pill, { backgroundColor: st.bg }]}>
                        <Text style={[styles.pillText, { color: st.text }]}>{jc.status}</Text>
                      </View>
                    </View>
                  </View>

                  <Text style={styles.cardIssue} numberOfLines={2}>{jc.reported_issue}</Text>

                  <View style={styles.cardFooter}>
                    <Text style={styles.jcNumber}>{jc.job_card_number}</Text>
                    <View style={{ flex: 1 }} />
                    {isOverdue ? (
                      <View style={styles.overdueBadge}>
                        <Ionicons name="alert-circle" size={12} color="#B91C1C" />
                        <Text style={styles.overdueText}>{daysOld}d in workshop (&gt;48h SLA)</Text>
                      </View>
                    ) : (
                      <Text style={styles.cardDays}>
                        {daysOld === 0 ? 'Logged today' : `${daysOld}d ago`}
                      </Text>
                    )}
                    <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginLeft: 6 }} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Modals */}
      <JobCardDetailModal
        visible={showDetailModal}
        jobCard={selectedJobCard}
        onClose={() => setShowDetailModal(false)}
        onRefresh={() => {
          invalidate();
          setShowDetailModal(false);
        }}
        onOpenPartPicker={(jc) => {
          setSelectedJobCard(jc);
          setShowPartPicker(true);
        }}
        onOpenPurchaseRequest={(jc) => {
          setSelectedJobCard(jc);
          setShowPurchaseRequest(true);
        }}
        onOpenVehicleHistory={(vId) => {
          setHistoryVehicleId(vId);
          setShowHistoryModal(true);
        }}
      />

      <PartPickerModal
        visible={showPartPicker}
        jobCard={selectedJobCard}
        storeId={storeId ?? ''}
        onClose={() => setShowPartPicker(false)}
        onSuccess={() => {
          invalidate();
          setShowPartPicker(false);
          setShowDetailModal(false);
        }}
        onRequestPurchase={(partId) => {
          setShowPartPicker(false);
          setPurchasePartId(partId);
          setShowPurchaseRequest(true);
        }}
      />

      <CreateJobCardModal
        visible={showCreateJobCard}
        storeId={storeId ?? ''}
        onClose={() => setShowCreateJobCard(false)}
        onSuccess={() => invalidate()}
      />

      <PurchaseRequestModal
        visible={showPurchaseRequest}
        storeId={storeId ?? ''}
        initialPartId={purchasePartId}
        onClose={() => setShowPurchaseRequest(false)}
        onSuccess={() => {
          invalidate();
          setShowPurchaseRequest(false);
        }}
      />

      <VehicleHistoryModal
        visible={showHistoryModal}
        vehicleId={historyVehicleId}
        onClose={() => setShowHistoryModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgApp },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 100 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.sm,
  },
  backBtn: { padding: 4 },
  newJobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brandTeal,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.button,
  },
  newJobBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.brandNavy,
  },

  kpiRow: { flexDirection: 'row', gap: Spacing.sm },

  filterScroll: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginRight: 6,
  },
  filterChipActive: {
    backgroundColor: Colors.brandNavy,
    borderColor: Colors.brandNavy,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  jobCardsList: {
    gap: 10,
  },
  jobCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  plateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  plateNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  cardIssue: {
    ...Typography.bodySecondary,
    color: Colors.textPrimary,
    fontWeight: '500',
    lineHeight: 18,
    marginVertical: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  jcNumber: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  cardDays: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  overdueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  overdueText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B91C1C',
  },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  emptySubtitle: { ...Typography.bodySecondary, color: Colors.textSecondary },
});
