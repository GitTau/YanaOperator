// ─────────────────────────────────────────────────────────────────────────────
// Fleet Screen — DESIGN_OPS.md §6.5
// 2×2 KPI grid: Fleet Size, Available, Batteries, Inactive
// Each card tappable → filtered asset list below
// ─────────────────────────────────────────────────────────────────────────────

import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import {
  FlatList,
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
import { useBatteries, useVehicles, queryKeys } from '../../src/hooks/useQueries';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import type { Battery, Vehicle } from '../../src/lib/database.types';

type FleetFilter = 'all' | 'available' | 'active' | 'maintenance' | 'inactive';

export default function FleetScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const storeId = selectedStore?.store_id ?? null;
  const queryClient = useQueryClient();

  const { data: vehicles, isLoading: vLoading, error: vError, refetch: refetchV } = useVehicles(storeId);
  const { data: batteries, isLoading: bLoading, refetch: refetchB } = useBatteries(storeId);

  const [activeFilter, setActiveFilter] = useState<FleetFilter>('all');

  const isLoading = vLoading || bLoading;
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles(storeId ?? '') });
    queryClient.invalidateQueries({ queryKey: queryKeys.batteries(storeId ?? '') });
  };

  const fleetSize = vehicles?.length ?? 0;
  const availableVehicles = vehicles?.filter((v) => v.status === 'Available') ?? [];
  const availableBatteries = batteries?.filter((b) => b.status === 'Available') ?? [];
  const inactiveVehicles = vehicles?.filter((v) => v.status === 'Inactive') ?? [];
  const maintenanceVehicles = vehicles?.filter((v) => v.status === 'Maintenance') ?? [];
  const inUseBatteries = batteries?.filter((b) => b.status === 'In Use') ?? [];
  const mainBatteries = batteries?.filter((b) => b.status === 'Maintenance') ?? [];

  // Filtered list for drill-down
  const filteredVehicles: Vehicle[] = (() => {
    if (!vehicles) return [];
    switch (activeFilter) {
      case 'available': return availableVehicles;
      case 'active': return vehicles.filter((v) => v.status === 'In Use');
      case 'maintenance': return maintenanceVehicles;
      case 'inactive': return inactiveVehicles;
      default: return vehicles;
    }
  })();

  const filteredBatteries: Battery[] = (() => {
    if (!batteries) return [];
    switch (activeFilter) {
      case 'available': return availableBatteries;
      case 'active': return inUseBatteries;
      case 'maintenance': return mainBatteries;
      case 'inactive': return [];
      default: return batteries;
    }
  })();

  const lastSynced = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={invalidate} tintColor={Colors.brandCyan} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={[Typography.h1Screen, { color: Colors.textPrimary }]}>Fleet Status</Text>
          <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>
            🔄 Last synced: {lastSynced}
          </Text>
        </View>

        {vError && <ErrorBanner message="Fleet data failed to load" onRetry={invalidate} />}

        {isLoading ? (
          <View style={{ gap: 12 }}>
            {[1, 2].map((k) => <SkeletonCard key={k} height={110} />)}
          </View>
        ) : (
          <>
            {/* ── 2×2 KPI Grid ────────────────────────────────────────── */}
            <View style={styles.kpiGrid}>
              <KPICard
                label="FLEET SIZE"
                value={fleetSize}
                icon={<Text style={{ fontSize: 20 }}>🏭</Text>}
                onPress={() => setActiveFilter(activeFilter === 'all' ? 'all' : 'all')}
              />
              <KPICard
                label="AVAILABLE"
                value={`Sc - ${availableVehicles.length}, Bat - ${availableBatteries.length}`}
                valueColor={Colors.statusActive}
                backgroundColor={Colors.statusAvailableBg}
                icon={<Text style={{ fontSize: 20 }}>✅</Text>}
                onPress={() => setActiveFilter('available')}
              />
              <KPICard
                label="IN USE"
                value={`Sc - ${vehicles?.filter((v) => v.status === 'In Use').length ?? 0}, Bat - ${inUseBatteries.length}`}
                valueColor={Colors.textCyan}
                icon={<Text style={{ fontSize: 20 }}>⚡</Text>}
                onPress={() => setActiveFilter('active')}
              />
              <KPICard
                label="INACTIVE / MAINTENANCE"
                value={`Sc - ${inactiveVehicles.length + maintenanceVehicles.length}, Bat - ${mainBatteries.length}`}
                valueColor={Colors.statusOverdue}
                backgroundColor={Colors.statusInactiveBg}
                icon={<Text style={{ fontSize: 20 }}>🔧</Text>}
                onPress={() => setActiveFilter('maintenance')}
              />
            </View>

            {/* ── Filter indicator ─────────────────────────────────────── */}
            {activeFilter !== 'all' && (
              <View style={styles.filterBar}>
                <Text style={[Typography.labelCaps, { color: Colors.brandCyan }]}>
                  SHOWING: {activeFilter.toUpperCase()}
                </Text>
                <Pressable onPress={() => setActiveFilter('all')}>
                  <Text style={styles.clearFilter}>Clear ✕</Text>
                </Pressable>
              </View>
            )}

            {/* ── Vehicle List ──────────────────────────────────────────── */}
            {filteredVehicles.length > 0 && (
              <View style={styles.assetSection}>
                <Text style={[Typography.labelCaps, { color: Colors.textSecondary, marginBottom: Spacing.sm }]}>
                  SCOOTERS ({filteredVehicles.length})
                </Text>
                {filteredVehicles.map((v) => (
                  <AssetRow
                    key={v.id}
                    id={v.plate_number}
                    status={v.status}
                    sub={v.assigned_battery_id ? `Battery assigned` : 'No battery'}
                    icon="🛵"
                  />
                ))}
              </View>
            )}

            {/* ── Battery List ─────────────────────────────────────────── */}
            {filteredBatteries.length > 0 && (
              <View style={styles.assetSection}>
                <Text style={[Typography.labelCaps, { color: Colors.textSecondary, marginBottom: Spacing.sm }]}>
                  BATTERIES ({filteredBatteries.length})
                </Text>
                {filteredBatteries.map((b) => (
                  <AssetRow
                    key={b.id}
                    id={b.serial_number}
                    status={b.status}
                    sub={b.assigned_vehicle_id ? 'Assigned to scooter' : 'Unassigned'}
                    icon="⚡"
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AssetRow({ id, status, sub, icon }: { id: string; status: string; sub: string; icon: string }) {
  const statusColor = {
    'Available': Colors.statusActive,
    'In Use': Colors.brandCyan,
    'Maintenance': Colors.statusWarning,
    'Inactive': Colors.statusOverdue,
  }[status] ?? Colors.textSecondary;

  return (
    <View style={styles.assetRow}>
      <Text style={styles.assetIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[Typography.bodySecondary, { fontWeight: '700', color: Colors.textPrimary }]}>{id}</Text>
        <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>{sub}</Text>
      </View>
      <View style={styles.statusDot}>
        <Text style={[Typography.badgeText, { color: statusColor }]}>{status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgApp },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 100 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  filterBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.brandNavy, borderRadius: Radius.sm, padding: 10,
  },
  clearFilter: { ...Typography.badgeText, color: Colors.brandCyan },
  assetSection: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  assetIcon: { fontSize: 18 },
  statusDot: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: Colors.bgApp, borderRadius: Radius.badge },
});
