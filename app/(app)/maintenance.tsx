// ─────────────────────────────────────────────────────────────────────────────
// Maintenance Screen — Maintenance Bay
// Accessible via hamburger menu → Maintenance
//
// Shows:
//   — Under Maintenance vehicles (status = 'Maintenance')
//   — Dead vehicles (status = 'Inactive') — labelled "Dead" in UI
//   — Available vehicles (for quick inspection / status change)
//
// Tapping a Maintenance/Dead vehicle → RepairPartsModal → RepairCostModal
// Tapping an Available vehicle       → MaintenanceChecklistModal → if issues → RepairPartsModal
//
// Business rule: Status can only be changed to Available / Maintenance / Inactive
// 'In Use' cannot be set from here — enforced in updateVehicleStatus()
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import {
  Alert,
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
import {
  useMaintenanceVehicles,
  useOpenMaintenanceTickets,
  useVehicles,
} from '../../src/hooks/useQueries';
import {
  MaintenanceChecklistModal,
  RepairCostModal,
  RepairPartsModal,
} from '../../src/components/modals/MaintenanceModals';
import type { PartSelection } from '../../src/components/modals/MaintenanceModals';
import { updateVehicleStatus } from '../../src/services/bookingService';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import type { Vehicle } from '../../src/lib/database.types';

// ── Types ─────────────────────────────────────────────────────────────────────
// PartSelection is imported from MaintenanceModals.tsx

type ModalStep =
  | { kind: 'none' }
  | { kind: 'checklist';  vehicle: Vehicle }
  | { kind: 'parts';      vehicle: Vehicle; itemStates?: Record<string, string> }
  | { kind: 'cost';       vehicle: Vehicle; ticketId: string; parts: PartSelection[] };

const STATUS_COLOR: Record<string, string> = {
  Available:   Colors.statusActive,
  'In Use':    Colors.brandTeal,
  Maintenance: Colors.statusWarning,
  Inactive:    Colors.statusError,
};

const STATUS_LABEL: Record<string, string> = {
  Available:   'Available',
  'In Use':    'In Use',
  Maintenance: 'Maintenance',
  Inactive:    'Dead',
};

const STATUS_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  Available:   'checkmark-circle-outline',
  'In Use':    'radio-button-on-outline',
  Maintenance: 'construct-outline',
  Inactive:    'close-circle-outline',
};

// ─────────────────────────────────────────────────────────────────────────────

export default function MaintenanceScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const storeId = selectedStore?.store_id ?? null;
  const queryClient = useQueryClient();

  const { data: maintenanceVehicles, isLoading: mLoading, error: mError } = useMaintenanceVehicles(storeId);
  const { data: allVehicles, isLoading: vLoading } = useVehicles(storeId);
  const { data: openTickets } = useOpenMaintenanceTickets(storeId);

  const [modal, setModal] = useState<ModalStep>({ kind: 'none' });

  const isLoading = mLoading || vLoading;

  // Stale DB generics return 'never[]' — cast to actual runtime shapes
  type VehicleRow = { id: string; plate_number: string; status: string; store_id: string; [key: string]: unknown };
  type TicketRow  = { id: string; vehicle_id: string; description: string; created_at: string; status: string; [key: string]: unknown };

  const availableVehicles = ((allVehicles ?? []) as VehicleRow[]).filter(v => v.status === 'Available');
  const underMaintenance  = ((maintenanceVehicles ?? []) as VehicleRow[]).filter(v => v.status === 'Maintenance');
  const deadVehicles      = ((maintenanceVehicles ?? []) as VehicleRow[]).filter(v => v.status === 'Inactive');
  const ticketList        = (openTickets ?? []) as TicketRow[];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['vehicles', storeId ?? ''] });
    queryClient.invalidateQueries({ queryKey: ['maintenance_vehicles', storeId ?? ''] });
    queryClient.invalidateQueries({ queryKey: ['open_maintenance_tickets', storeId ?? ''] });
  };

  // ── Status change handler ────────────────────────────────────────────────
  const handleStatusChange = (vehicle: Vehicle, newStatus: 'Available' | 'Maintenance' | 'Inactive') => {
    const label = STATUS_LABEL[newStatus];
    Alert.alert(
      `Set ${vehicle.plate_number} → ${label}?`,
      newStatus === 'Inactive'
        ? 'This marks the vehicle as Dead. It will not be available for bookings.'
        : `Vehicle will be moved to ${label}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Set ${label}`,
          style: newStatus === 'Inactive' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await updateVehicleStatus(vehicle.id, newStatus);
              invalidate();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Status update failed.');
            }
          },
        },
      ],
    );
  };

  // ── Modal open handlers ───────────────────────────────────────────────────
  const openChecklistModal  = (v: Vehicle) => setModal({ kind: 'checklist', vehicle: v });
  const openRepairPartsModal = (v: Vehicle, itemStates?: Record<string, string>) =>
    setModal({ kind: 'parts', vehicle: v, itemStates });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Back header */}
      <View style={styles.screenHeader}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[Typography.overline, { color: Colors.textSecondary }]}>FLEET OPS</Text>
          <Text style={[Typography.h1Screen, { color: Colors.textPrimary, marginTop: 1 }]}>Maintenance Bay</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={invalidate} tintColor={Colors.brandTeal} />}
      >
        {mError && <ErrorBanner message="Failed to load maintenance data" onRetry={invalidate} />}

        {isLoading ? (
          <View style={{ gap: 10 }}>
            {[1, 2, 3].map(k => <SkeletonCard key={k} height={90} />)}
          </View>
        ) : (
          <>
            {/* ── KPI Row ─────────────────────────────────────────────────── */}
            <View style={styles.kpiRow}>
              <KPICard
                label="MAINTENANCE"
                value={underMaintenance.length}
                valueColor={Colors.statusWarning}
                backgroundColor={Colors.surfaceAmber}
                icon="construct-outline"
              />
              <KPICard
                label="DEAD"
                value={deadVehicles.length}
                valueColor={Colors.statusError}
                backgroundColor={Colors.surfaceRed}
                icon="close-circle-outline"
              />
              <KPICard
                label="OPEN TICKETS"
                value={ticketList.length}
                valueColor={Colors.statusInfo}
                backgroundColor={Colors.surfaceBlue}
                icon="ticket-outline"
              />
            </View>

            {/* ── Under Maintenance ────────────────────────────────────────── */}
            {underMaintenance.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionDot, { backgroundColor: Colors.statusWarning }]} />
                  <Text style={styles.sectionTitle}>UNDER MAINTENANCE ({underMaintenance.length})</Text>
                </View>
                {underMaintenance.map(vehicle => (
                  <VehicleMaintenanceCard
                    key={vehicle.id as string}
                    vehicle={vehicle as unknown as Vehicle}
                    openTicket={ticketList.find(t => t.vehicle_id === vehicle.id)}
                    onRepair={() => openRepairPartsModal(vehicle as unknown as Vehicle)}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </View>
            )}

            {/* ── Dead Vehicles ────────────────────────────────────────────── */}
            {deadVehicles.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionDot, { backgroundColor: Colors.statusError }]} />
                  <Text style={styles.sectionTitle}>DEAD / WRITTEN OFF ({deadVehicles.length})</Text>
                </View>
                {deadVehicles.map(vehicle => (
                  <VehicleMaintenanceCard
                    key={vehicle.id as string}
                    vehicle={vehicle as unknown as Vehicle}
                    openTicket={ticketList.find(t => t.vehicle_id === vehicle.id)}
                    onRepair={() => openRepairPartsModal(vehicle as unknown as Vehicle)}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </View>
            )}

            {/* ── Available Fleet ──────────────────────────────────────────── */}
            {availableVehicles.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionDot, { backgroundColor: Colors.statusActive }]} />
                  <Text style={styles.sectionTitle}>AVAILABLE FLEET ({availableVehicles.length})</Text>
                  <Text style={styles.sectionSubtitle}>Tap to inspect</Text>
                </View>
                {availableVehicles.map(vehicle => (
                  <VehicleAvailableCard
                    key={vehicle.id as string}
                    vehicle={vehicle as unknown as Vehicle}
                    onInspect={() => openChecklistModal(vehicle as unknown as Vehicle)}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </View>
            )}

            {underMaintenance.length === 0 && deadVehicles.length === 0 && availableVehicles.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-done-circle-outline" size={40} color={Colors.statusActive} />
                <Text style={styles.emptyTitle}>All Clear</Text>
                <Text style={styles.emptySubtitle}>No vehicles under maintenance.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Modals ───────────────────────────────────────────────────────── */}

      {modal.kind === 'checklist' && (
        <MaintenanceChecklistModal
          visible
          vehicle={modal.vehicle}
          storeId={storeId ?? ''}
          onClose={() => setModal({ kind: 'none' })}
          onIssuesFound={(v, itemStates) => setModal({ kind: 'parts', vehicle: v, itemStates })}
        />
      )}

      {modal.kind === 'parts' && (
        <RepairPartsModal
          visible
          vehicle={modal.vehicle}
          storeId={storeId ?? ''}
          damagedItemStates={modal.itemStates}
          onClose={() => setModal({ kind: 'none' })}
          onPartsSelected={(v, ticketId, parts) =>
            setModal({ kind: 'cost', vehicle: v, ticketId, parts })
          }
        />
      )}

      {modal.kind === 'cost' && (
        <RepairCostModal
          visible
          vehicle={modal.vehicle}
          ticketId={modal.ticketId}
          selectedParts={modal.parts}
          onClose={() => setModal({ kind: 'none' })}
          onComplete={() => {
            setModal({ kind: 'none' });
            invalidate();
            Alert.alert('✅ Repair Logged', `${modal.vehicle.plate_number} is back to Available.`);
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VehicleMaintenanceCard — card for Maintenance or Dead vehicles
// ─────────────────────────────────────────────────────────────────────────────

interface VehicleMaintenanceCardProps {
  vehicle: Vehicle;
  openTicket: { description: string; created_at: string; [key: string]: unknown } | undefined;
  onRepair: () => void;
  onStatusChange: (vehicle: Vehicle, status: 'Available' | 'Maintenance' | 'Inactive') => void;
}

function VehicleMaintenanceCard({ vehicle, openTicket, onRepair, onStatusChange }: VehicleMaintenanceCardProps) {
  const statusColor = STATUS_COLOR[vehicle.status] ?? Colors.textMuted;
  const statusLabel = STATUS_LABEL[vehicle.status] ?? vehicle.status;

  const daysInStatus = openTicket
    ? Math.floor((Date.now() - new Date(openTicket.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <View style={styles.vehicleCard}>
      {/* Status stripe */}
      <View style={[styles.vehicleStripe, { backgroundColor: statusColor }]} />

      <View style={styles.vehicleCardBody}>
        {/* Top row */}
        <View style={styles.vehicleCardTop}>
          <View style={styles.vehicleIconWrap}>
            <Ionicons name="bicycle-outline" size={18} color={Colors.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.vehiclePlate}>{vehicle.plate_number}</Text>
            {openTicket && (
              <Text style={styles.vehicleTicketDesc} numberOfLines={1}>{openTicket.description}</Text>
            )}
            {daysInStatus !== null && (
              <Text style={[styles.vehicleDays, { color: daysInStatus > 3 ? Colors.statusError : Colors.statusWarning }]}>
                {daysInStatus === 0 ? 'Since today' : `${daysInStatus} day${daysInStatus > 1 ? 's' : ''} in workshop`}
              </Text>
            )}
          </View>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}18` }]}>
            <Ionicons name={STATUS_ICON[vehicle.status] ?? 'help-circle-outline'} size={11} color={statusColor} />
            <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {/* Action row */}
        <View style={styles.vehicleCardActions}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionBtnPrimary, { opacity: pressed ? 0.8 : 1 }]}
            onPress={onRepair}
          >
            <Ionicons name="construct-outline" size={13} color={Colors.brandNavy} style={{ marginRight: 5 }} />
            <Text style={styles.actionBtnPrimaryText}>Log Repair</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionBtnSecondary, { opacity: pressed ? 0.8 : 1 }]}
            onPress={() => {
              Alert.alert(
                'Change Status',
                `${vehicle.plate_number} — select new status:`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  vehicle.status !== 'Available'   && { text: '✅ Available',   onPress: () => onStatusChange(vehicle, 'Available')   },
                  vehicle.status !== 'Maintenance' && { text: '🔧 Maintenance', onPress: () => onStatusChange(vehicle, 'Maintenance') },
                  vehicle.status !== 'Inactive'    && { text: '💀 Dead',         style: 'destructive', onPress: () => onStatusChange(vehicle, 'Inactive') },
                ].filter(Boolean) as Parameters<typeof Alert.alert>[2],
              );
            }}
          >
            <Ionicons name="swap-horizontal-outline" size={13} color={Colors.textSecondary} style={{ marginRight: 5 }} />
            <Text style={styles.actionBtnSecondaryText}>Status</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VehicleAvailableCard — compact card for available vehicles
// ─────────────────────────────────────────────────────────────────────────────

interface VehicleAvailableCardProps {
  vehicle: Vehicle;
  onInspect: () => void;
  onStatusChange: (vehicle: Vehicle, status: 'Available' | 'Maintenance' | 'Inactive') => void;
}

function VehicleAvailableCard({ vehicle, onInspect, onStatusChange }: VehicleAvailableCardProps) {
  return (
    <View style={styles.availableCard}>
      <View style={styles.vehicleIconWrap}>
        <Ionicons name="bicycle-outline" size={16} color={Colors.statusActive} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.vehiclePlate}>{vehicle.plate_number}</Text>
        <View style={[styles.statusPill, { backgroundColor: Colors.surfaceGreen, alignSelf: 'flex-start', marginTop: 3 }]}>
          <Ionicons name="checkmark-circle-outline" size={10} color={Colors.statusActive} />
          <Text style={[styles.statusPillText, { color: Colors.statusActive }]}>Available</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable
          style={({ pressed }) => [styles.smallBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={onInspect}
        >
          <Ionicons name="search-outline" size={13} color={Colors.brandTeal} style={{ marginRight: 4 }} />
          <Text style={[styles.smallBtnText, { color: Colors.brandTeal }]}>Inspect</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.smallBtn, styles.smallBtnDestructive, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => onStatusChange(vehicle, 'Maintenance')}
        >
          <Ionicons name="construct-outline" size={13} color={Colors.statusWarning} style={{ marginRight: 4 }} />
          <Text style={[styles.smallBtnText, { color: Colors.statusWarning }]}>Flag</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bgApp },
  scroll:  { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 100 },

  screenHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  backBtn: { padding: 4 },

  kpiRow: { flexDirection: 'row', gap: Spacing.sm },

  section: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    backgroundColor: Colors.bgApp,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  sectionDot:     { width: 8, height: 8, borderRadius: 4 },
  sectionTitle:   { ...Typography.labelCaps, color: Colors.textSecondary, flex: 1 },
  sectionSubtitle:{ ...Typography.caption, color: Colors.textMuted },

  vehicleCard: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  vehicleStripe: { width: 4 },
  vehicleCardBody: { flex: 1, padding: Spacing.md },
  vehicleCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  vehicleIconWrap: {
    width: 36, height: 36, borderRadius: Radius.sm,
    backgroundColor: Colors.bgApp, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  vehiclePlate:      { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.3 },
  vehicleTicketDesc: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  vehicleDays:       { ...Typography.caption, fontWeight: '700', marginTop: 2 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill,
  },
  statusPillText: { ...Typography.caption, fontWeight: '700', fontSize: 10 },

  vehicleCardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 34, borderRadius: Radius.button,
    paddingHorizontal: 12, flex: 1,
  },
  actionBtnPrimary:     { backgroundColor: Colors.brandTeal },
  actionBtnPrimaryText: { ...Typography.buttonSecondary, color: Colors.brandNavy, fontSize: 12 },
  actionBtnSecondary:   { backgroundColor: Colors.bgApp, borderWidth: 1, borderColor: Colors.borderLight },
  actionBtnSecondaryText:{ ...Typography.buttonSecondary, color: Colors.textSecondary, fontSize: 12 },

  availableCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 10, paddingHorizontal: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  smallBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, height: 30, borderRadius: Radius.button,
    borderWidth: 1, borderColor: Colors.brandTeal,
    backgroundColor: `${Colors.brandTeal}10`,
  },
  smallBtnDestructive: { borderColor: Colors.statusWarning, backgroundColor: Colors.surfaceAmber },
  smallBtnText: { fontSize: 11, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  emptySubtitle: { ...Typography.bodySecondary, color: Colors.textSecondary },
});
