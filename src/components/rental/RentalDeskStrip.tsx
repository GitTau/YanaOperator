// ─────────────────────────────────────────────────────────────────────────────
// RentalDeskStrip — Recover / Inspect / Approve counts for this ZAP Point,
// shown on Overview, Fleet and Tasks. Tap to open the Rental Desk.
// Hidden when there is nothing to do or the engine is not live yet, so the
// existing screens look exactly as before.
// ─────────────────────────────────────────────────────────────────────────────
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Typography } from '../../constants/design';
import { usePendingPauseInspections, useRecoveryTasks, useReturnsAwaitingApproval } from '../../hooks/useRentalEngine';

interface RentalDeskStripProps {
  storeId: string | null;
  context?: 'overview' | 'fleet' | 'tasks';
}

function Cell({ value, label, red, last }: { value: number; label: string; red?: boolean; last?: boolean }) {
  return (
    <View style={[styles.cell, !last && styles.cellLine]}>
      <Text style={[Typography.h1Screen, { fontSize: 24, color: red && value > 0 ? Colors.statusError : Colors.textPrimary }]}>{value}</Text>
      <Text style={[Typography.caption, { color: Colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

export function RentalDeskStrip({ storeId, context = 'overview' }: RentalDeskStripProps) {
  const inspections = usePendingPauseInspections(storeId);
  const recoveries = useRecoveryTasks(storeId);
  const returns = useReturnsAwaitingApproval(storeId);

  if (inspections.error || recoveries.error || returns.error) return null;
  const nInspect = inspections.data?.length ?? 0;
  const nRecover = recoveries.data?.length ?? 0;
  const nReturns = returns.data?.length ?? 0;
  if (nInspect + nRecover + nReturns === 0) return null;

  const open = () => router.push('/(app)/rental-desk' as Parameters<typeof router.push>[0]);
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[Typography.labelCaps, { color: Colors.textSecondary }]}>{context === 'tasks' ? 'RENTAL TASKS TODAY' : 'RENTAL DESK'}</Text>
        <Pressable onPress={open} hitSlop={10} accessibilityRole="link">
          <Text style={[Typography.buttonSecondary, { color: Colors.textTeal }]}>Open ›</Text>
        </Pressable>
      </View>
      <Pressable
        onPress={open}
        style={({ pressed }) => [styles.strip, nRecover > 0 && styles.stripRed, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
        accessibilityRole="button"
        accessibilityLabel={`Open Rental Desk: ${nRecover} to recover, ${nInspect} to inspect, ${nReturns} to approve`}
      >
        <Cell value={nRecover} label={context === 'fleet' ? 'In recovery' : 'Recover'} red />
        <Cell value={nInspect} label={context === 'fleet' ? 'Paused · inspect' : 'Inspect'} />
        <Cell value={nReturns} label="Approve" last />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  strip: { flexDirection: 'row', backgroundColor: Colors.surfaceCard, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.borderLight, overflow: 'hidden' },
  stripRed: { borderLeftWidth: 3, borderLeftColor: Colors.statusError },
  cell: { flex: 1, padding: 12 },
  cellLine: { borderRightWidth: 1, borderRightColor: Colors.borderLight },
});
