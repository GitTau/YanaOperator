// ─────────────────────────────────────────────────────────────────────────────
// Fleet Screen v2 — Asset Status
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { ErrorBanner, KPICard, SkeletonCard } from '../../src/components/ui';
import { useBatteries, useVehicles, queryKeys } from '../../src/hooks/useQueries';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import type { Battery, Vehicle } from '../../src/lib/database.types';

type FleetFilter = 'all' | 'available' | 'active' | 'maintenance';

const STATUS_COLOR: Record<string, string> = {
  'Available':   Colors.statusActive,
  'In Use':      Colors.brandTeal,
  'Maintenance': Colors.statusWarning,
  'Inactive':    Colors.statusError,
};

const STATUS_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  'Available':   'checkmark-circle-outline',
  'In Use':      'radio-button-on-outline',
  'Maintenance': 'construct-outline',
  'Inactive':    'close-circle-outline',
};

export default function FleetScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const storeId = selectedStore?.store_id ?? null;
  const queryClient = useQueryClient();

  const { data: vehicles, isLoading: vLoading, error: vError } = useVehicles(storeId);
  const { data: batteries, isLoading: bLoading } = useBatteries(storeId);
  const [activeFilter, setActiveFilter] = useState<FleetFilter>('all');

  const isLoading = vLoading || bLoading;
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles(storeId ?? '') });
    queryClient.invalidateQueries({ queryKey: queryKeys.batteries(storeId ?? '') });
  };

  const availableVehicles   = vehicles?.filter((v) => v.status === 'Available') ?? [];
  const availableBatteries  = batteries?.filter((b) => b.status === 'Available') ?? [];
  const inactiveVehicles    = vehicles?.filter((v) => v.status === 'Inactive') ?? [];
  const maintenanceVehicles = vehicles?.filter((v) => v.status === 'Maintenance') ?? [];
  const inUseBatteries      = batteries?.filter((b) => b.status === 'In Use') ?? [];
  const mainBatteries       = batteries?.filter((b) => b.status === 'Maintenance') ?? [];

  const filteredVehicles: Vehicle[] = (() => {
    if (!vehicles) return [];
    switch (activeFilter) {
      case 'available':   return availableVehicles;
      case 'active':      return vehicles.filter((v) => v.status === 'In Use');
      case 'maintenance': return [...maintenanceVehicles, ...inactiveVehicles];
      default:            return vehicles;
    }
  })();

  const filteredBatteries: Battery[] = (() => {
    if (!batteries) return [];
    switch (activeFilter) {
      case 'available':   return availableBatteries;
      case 'active':      return inUseBatteries;
      case 'maintenance': return mainBatteries;
      default:            return batteries;
    }
  })();

  const lastSynced = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const FILTER_PILLS: { key: FleetFilter; label: string }[] = [
    { key: 'all',         label: 'All'         },
    { key: 'available',   label: 'Available'   },
    { key: 'active',      label: 'In Use'      },
    { key: 'maintenance', label: 'Maintenance' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={invalidate} tintColor={Colors.brandTeal} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[Typography.overline, { color: Colors.textSecondary }]}>ASSET REGISTRY</Text>
            <Text style={[Typography.h1Screen, { color: Colors.textPrimary, marginTop: 2 }]}>Fleet Status</Text>
          </View>
          <View style={styles.syncBadge}>
            <Ionicons name="sync-outline" size={11} color={Colors.textMuted} />
            <Text style={[Typography.caption, { color: Colors.textMuted, marginLeft: 3 }]}>{lastSynced}</Text>
          </View>
        </View>

        {vError && <ErrorBanner message="Fleet data failed to load" onRetry={invalidate} />}

        {isLoading ? (
          <View style={{ gap: 10 }}>
            {[1, 2].map((k) => <SkeletonCard key={k} height={100} />)}
          </View>
        ) : (
          <>
            <View style={styles.kpiGrid}>
              <KPICard
                label="FLEET SIZE"
                value={vehicles?.length ?? 0}
                icon="layers-outline"
                onPress={() => setActiveFilter('all')}
              />
              <KPICard
                label="AVAILABLE"
                value={`Sc - ${availableVehicles.length}, Bat - ${availableBatteries.length}`}
                valueColor={Colors.statusActive}
                backgroundColor={Colors.surfaceGreen}
                icon="checkmark-circle-outline"
                onPress={() => setActiveFilter('available')}
              />
              <KPICard
                label="IN USE"
                value={vehicles?.filter((v) => v.status === 'In Use').length ?? 0}
                valueColor={Colors.brandTeal}
                backgroundColor={Colors.surfaceTeal}
                icon="radio-button-on-outline"
                onPress={() => setActiveFilter('active')}
              />
              <KPICard
                label="INACTIVE"
                value={`Sc - ${inactiveVehicles.length + maintenanceVehicles.length}, Bat - ${mainBatteries.length}`}
                valueColor={Colors.statusError}
                backgroundColor={Colors.surfaceRed}
                icon="construct-outline"
                onPress={() => setActiveFilter('maintenance')}
              />
            </View>

            <View style={styles.filterRow}>
              {FILTER_PILLS.map((f) => (
                <Pressable key={f.key} style={[styles.filterPill, activeFilter === f.key && styles.filterPillActive]} onPress={() => setActiveFilter(f.key)}>
                  <Text style={[Typography.badgeText, { color: activeFilter === f.key ? Colors.brandTeal : Colors.textSecondary }]}>{f.label}</Text>
                </Pressable>
              ))}
            </View>

            {filteredVehicles.length > 0 && (
              <View style={styles.assetSection}>
                <View style={styles.assetSectionHeader}>
                  <Ionicons name="bicycle-outline" size={14} color={Colors.textSecondary} />
                  <Text style={[Typography.labelCaps, { color: Colors.textSecondary, marginLeft: 6 }]}>SCOOTERS ({filteredVehicles.length})</Text>
                </View>
                {filteredVehicles.map((v, idx) => (
                  <AssetRow key={v.id} id={v.plate_number} status={v.status} sub={v.assigned_battery_id ? 'Battery linked' : 'No battery'} type="vehicle" isLast={idx === filteredVehicles.length - 1} />
                ))}
              </View>
            )}

            {filteredBatteries.length > 0 && (
              <View style={styles.assetSection}>
                <View style={styles.assetSectionHeader}>
                  <Ionicons name="battery-charging-outline" size={14} color={Colors.textSecondary} />
                  <Text style={[Typography.labelCaps, { color: Colors.textSecondary, marginLeft: 6 }]}>BATTERIES ({filteredBatteries.length})</Text>
                </View>
                {filteredBatteries.map((b, idx) => (
                  <AssetRow key={b.id} id={b.serial_number} status={b.status} sub={b.assigned_vehicle_id ? 'Assigned to scooter' : 'Unassigned'} type="battery" isLast={idx === filteredBatteries.length - 1} />
                ))}
              </View>
            )}

            {filteredVehicles.length === 0 && filteredBatteries.length === 0 && (
              <View style={styles.emptyFilter}>
                <Ionicons name="file-tray-outline" size={28} color={Colors.textMuted} />
                <Text style={[Typography.bodySecondary, { color: Colors.textSecondary, marginTop: 8 }]}>No assets match this filter</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AssetRow({ id, status, sub, type, isLast }: { id: string; status: string; sub: string; type: 'vehicle' | 'battery'; isLast: boolean }) {
  const statusColor = STATUS_COLOR[status] ?? Colors.textSecondary;
  const statusIcon  = STATUS_ICON[status]  ?? 'help-circle-outline';
  return (
    <View style={[styles.assetRow, !isLast && styles.assetRowBorder]}>
      <View style={styles.assetIconWrap}>
        <Ionicons name={type === 'vehicle' ? 'bicycle-outline' : 'battery-half-outline'} size={16} color={Colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[Typography.bodyPrimary, { fontWeight: '700', color: Colors.textPrimary, fontSize: 13 }]}>{id}</Text>
        <Text style={[Typography.caption, { color: Colors.textMuted, marginTop: 1 }]}>{sub}</Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: `${statusColor}15` }]}>
        <Ionicons name={statusIcon} size={11} color={statusColor} />
        <Text style={[Typography.caption, { color: statusColor, fontWeight: '600', marginLeft: 3 }]}>{status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bgApp },
  scroll:  { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 100 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  syncBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceCard, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.borderLight, paddingHorizontal: 8, paddingVertical: 4 },
  kpiGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.surfaceCard },
  filterPillActive: { borderColor: Colors.brandTeal, backgroundColor: Colors.surfaceTeal },
  assetSection: { backgroundColor: Colors.surfaceCard, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.borderLight, overflow: 'hidden' },
  assetSectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, backgroundColor: Colors.bgApp },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, paddingHorizontal: Spacing.md },
  assetRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  assetIconWrap: { width: 32, height: 32, borderRadius: Radius.sm, backgroundColor: Colors.bgApp, alignItems: 'center', justifyContent: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.pill },
  emptyFilter: { alignItems: 'center', paddingVertical: Spacing.xl },
});
