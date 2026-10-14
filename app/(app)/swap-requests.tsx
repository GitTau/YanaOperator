// ─────────────────────────────────────────────────────────────────────────────
// Swap Requests — the hub Captain approves or rejects a rider's battery/scooter swap.
// Riders cannot swap on their own (TauBoss, 2026-10-14). Approving runs the same swap the
// Captain could do by hand; the server re-checks role, hub and availability, and refuses
// anything stale, so every refusal is shown to the Captain in the server's own words.
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { useDecideSwapRequest, useSwapRequests } from '../../src/hooks/useSwapRequests';
import type { SwapRequest } from '../../src/services/swapRequestService';
import { useAuthStore } from '../../src/stores/authStore';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const kindLabel = (r: SwapRequest) => (r.kind === 'battery' ? 'Battery' : 'Scooter');

export default function SwapRequestsScreen() {
  const { profile } = useAuthStore();
  const { selectedStore } = useStoreSelectionStore();
  const storeId = selectedStore?.store_id ?? null;
  const canDecide = profile?.role === 'OPERATOR' || profile?.role === 'ADMIN';

  const { data: requests, isLoading, isRefetching, refetch, error } = useSwapRequests(canDecide ? storeId : null);
  const decide = useDecideSwapRequest(storeId);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = useMemo(() => (requests ?? []).filter((r) => r.status === 'Pending'), [requests]);
  const recent = useMemo(() => (requests ?? []).filter((r) => r.status !== 'Pending').slice(0, 10), [requests]);

  const run = async (r: SwapRequest, approve: boolean) => {
    setBusyId(r.id);
    try {
      const result = await decide.mutateAsync({ requestId: r.id, approve });
      if (!approve) {
        Alert.alert('Request rejected', `${r.riderName} keeps their current ${r.kind}.`);
      } else if (result.booking_status === 'Paused') {
        Alert.alert(
          'Approved, but the rental is now paused',
          `${r.riderName} has not paid the full amount due, so the swap paused the rental and both ` +
            'assets went back to stock. Collect payment to resume it.',
        );
      } else {
        Alert.alert('Swap approved', `${r.riderName} now has ${r.requestedLabel ?? 'the new item'}.`);
      }
    } catch (e) {
      Alert.alert('Could not complete this', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmApprove = (r: SwapRequest) => {
    const faulty = r.has_issue
      ? `\n\nThe rider reported ${r.currentLabel ?? 'the current item'} as faulty, so it will be sent to Maintenance.`
      : '';
    Alert.alert(
      `Approve ${kindLabel(r).toLowerCase()} swap?`,
      `${r.riderName}: ${r.currentLabel ?? '—'} → ${r.requestedLabel ?? '—'}${faulty}\n\n` +
        'Swaps are done in person: check the rider is at your ZAP Point (within 10 m) before you approve.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => run(r, true) },
      ],
    );
  };

  const confirmReject = (r: SwapRequest) => {
    Alert.alert(`Reject this request?`, `${r.riderName} will keep ${r.currentLabel ?? 'their current item'}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => run(r, false) },
    ]);
  };

  const renderPending = ({ item }: { item: SwapRequest }) => {
    const busy = busyId === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: item.kind === 'battery' ? Colors.surfaceBlue : Colors.surfaceTeal }]}>
            <Ionicons
              name={item.kind === 'battery' ? 'battery-charging-outline' : 'bicycle-outline'}
              size={20}
              color={item.kind === 'battery' ? Colors.statusInfo : Colors.brandTealDim}
            />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{kindLabel(item)} swap request</Text>
              <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
            </View>
            <Text style={styles.rider}>
              {item.riderName}
              {item.riderPhone ? ` · ${item.riderPhone}` : ''} · Booking {item.booking_id.slice(-4).toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.changeRow}>
          <View style={styles.changeCol}>
            <Text style={styles.changeLabel}>HAS NOW</Text>
            <Text style={styles.changeValue}>{item.currentLabel ?? '—'}</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={Colors.textMuted} />
          <View style={styles.changeCol}>
            <Text style={styles.changeLabel}>WANTS</Text>
            <Text style={styles.changeValue}>{item.requestedLabel ?? '—'}</Text>
          </View>
        </View>

        {item.has_issue && (
          <View style={styles.faultyBadge}>
            <Ionicons name="warning-outline" size={14} color={Colors.textWarning} style={{ marginRight: 4 }} />
            <Text style={styles.faultyText}>Rider reports the current {item.kind} is faulty</Text>
          </View>
        )}
        {!!item.reason && <Text style={styles.reason}>“{item.reason}”</Text>}

        <View style={styles.actions}>
          <Pressable
            disabled={busy}
            onPress={() => confirmReject(item)}
            style={({ pressed }) => [styles.btn, styles.btnReject, (pressed || busy) && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Reject swap request"
          >
            <Text style={styles.btnRejectText}>Reject</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => confirmApprove(item)}
            style={({ pressed }) => [styles.btn, styles.btnApprove, (pressed || busy) && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Approve swap request"
          >
            {busy ? (
              <ActivityIndicator size="small" color={Colors.brandNavy} />
            ) : (
              <Text style={styles.btnApproveText}>Approve</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  const renderRecent = (r: SwapRequest) => {
    const color =
      r.status === 'Approved' ? Colors.textSuccess : r.status === 'Rejected' ? Colors.textError : Colors.textMuted;
    return (
      <View key={r.id} style={styles.recentRow}>
        <Text style={styles.recentMain} numberOfLines={1}>
          {kindLabel(r)} · {r.riderName} · {r.currentLabel ?? '—'} → {r.requestedLabel ?? '—'}
        </Text>
        <Text style={[styles.recentStatus, { color }]}>
          {r.status} · {timeAgo(r.decided_at ?? r.created_at)}
        </Text>
      </View>
    );
  };

  if (!canDecide) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="lock-closed-outline" size={32} color={Colors.textMuted} />
        <Text style={styles.emptyTitle}>Captains only</Text>
        <Text style={styles.emptyBody}>Swap requests are approved by the hub Captain.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Ionicons name="swap-horizontal" size={20} color={Colors.brandTealDim} style={{ marginRight: 6 }} />
        <Text style={styles.headerTitle}>Swap Requests</Text>
        {pending.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pending.length} waiting</Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.brandTealDim} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={32} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Could not load requests</Text>
          <Text style={styles.emptyBody}>{error.message}</Text>
          <Pressable onPress={() => refetch()} style={[styles.btn, styles.btnReject, { marginTop: Spacing.md }]}>
            <Text style={styles.btnRejectText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={pending}
          keyExtractor={(item) => item.id}
          renderItem={renderPending}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.brandTealDim} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-done-circle-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No requests waiting</Text>
              <Text style={styles.emptyBody}>When a rider asks to swap a battery or scooter, it shows up here.</Text>
            </View>
          }
          ListFooterComponent={
            recent.length > 0 ? (
              <View style={styles.recentBox}>
                <Text style={styles.sectionLabel}>RECENT DECISIONS</Text>
                {recent.map(renderRecent)}
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgApp },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  topBar: {
    backgroundColor: Colors.surfaceCard,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: { ...Typography.bodyPrimary, fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  badge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill, marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', color: Colors.statusError },
  listContent: { padding: Spacing.md, gap: Spacing.sm },
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderLeftWidth: 4,
    borderLeftColor: Colors.brandTealDim,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  iconWrap: { width: 38, height: 38, borderRadius: Radius.sm, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardBody: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  timestamp: { fontSize: 11, color: Colors.textMuted, fontWeight: '500', marginLeft: 8 },
  rider: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.sm,
    padding: Spacing.sm + 4,
    marginTop: Spacing.md,
  },
  changeCol: { flex: 1 },
  changeLabel: { ...Typography.overline, color: Colors.textMuted },
  changeValue: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginTop: 2 },
  faultyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAmber,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: Spacing.sm,
  },
  faultyText: { fontSize: 12, fontWeight: '600', color: Colors.textWarning, flex: 1 },
  reason: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic', marginTop: Spacing.sm, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  btn: { flex: 1, minHeight: 48, borderRadius: Radius.button, justifyContent: 'center', alignItems: 'center' },
  btnReject: { backgroundColor: Colors.surfaceCard, borderWidth: 1, borderColor: Colors.borderInput },
  btnRejectText: { ...Typography.buttonSecondary, color: Colors.textSecondary },
  btnApprove: { backgroundColor: Colors.brandTeal },
  btnApproveText: { ...Typography.buttonPrimary, color: Colors.brandNavy },
  emptyBox: { alignItems: 'center', padding: Spacing.xl },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginTop: 12, marginBottom: 4 },
  emptyBody: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', maxWidth: 260, lineHeight: 18 },
  recentBox: { marginTop: Spacing.lg },
  sectionLabel: { ...Typography.labelCaps, color: Colors.textMuted, marginBottom: Spacing.sm },
  recentRow: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: Spacing.sm,
    marginBottom: 6,
  },
  recentMain: { fontSize: 12, color: Colors.textPrimary, fontWeight: '600' },
  recentStatus: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});
