// ─────────────────────────────────────────────────────────────────────────────
// KYC Review — the hub Captain finishes the identity check of riders who registered themselves.
// The Rider app can no longer mark itself verified (lockdown A). The Captain checks the ORIGINAL
// documents in person (D-027), then approves or rejects. The server enforces one Aadhaar = one
// rider (D-018) and keeps the decision trail; a rejection needs a reason the rider can read.
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ReasonModal } from '../../src/components/ReasonModal';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { useKycDuplicates, useKycQueue, useReviewKyc } from '../../src/hooks/useRiderReviews';
import { DUPLICATE_AADHAAR_CODE, formatAadhaar, type KycRider } from '../../src/services/riderReviewService';
import { maskAadhaar } from '../../src/services/bookingService';
import { useAuthStore } from '../../src/stores/authStore';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';

type Segment = 'waiting' | 'rejected';
type Dialog = { kind: 'reject'; rider: KycRider } | { kind: 'override'; rider: KycRider } | null;

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function DuplicateWarning({ customerId }: { customerId: string }) {
  const { data } = useKycDuplicates(customerId);
  if (!data || data.length === 0) return null;
  return (
    <View style={styles.dupBox}>
      <Ionicons name="alert-circle-outline" size={16} color={Colors.textError} style={{ marginRight: 6 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.dupTitle}>Same Aadhaar already used by {data.length} other rider{data.length > 1 ? 's' : ''}</Text>
        {data.map((d) => (
          <Text key={d.customer_id} style={styles.dupLine}>
            {d.name ?? 'Rider'} · {d.store_name ?? 'no hub'}
            {d.has_open_rental ? ' · rental open' : ''}
          </Text>
        ))}
        <Text style={styles.dupHint}>One Aadhaar = one rider. Only Admin can approve this.</Text>
      </View>
    </View>
  );
}

export default function KycReviewScreen() {
  const { profile } = useAuthStore();
  const { selectedStore } = useStoreSelectionStore();
  const storeId = selectedStore?.store_id ?? null;
  const isAdmin = profile?.role === 'ADMIN';
  const canReview = profile?.role === 'OPERATOR' || isAdmin;

  const { data, isLoading, isRefetching, refetch, error } = useKycQueue(canReview ? storeId : null);
  const review = useReviewKyc(storeId);
  const [segment, setSegment] = useState<Segment>('waiting');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);

  const waiting = useMemo(() => (data ?? []).filter((r) => !r.rejection), [data]);
  const rejected = useMemo(() => (data ?? []).filter((r) => !!r.rejection), [data]);
  const list = segment === 'waiting' ? waiting : rejected;

  const toggleReveal = (id: string) =>
    setReveal((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async (rider: KycRider, approve: boolean, note?: string, overrideReason?: string) => {
    setBusyId(rider.id);
    try {
      await review.mutateAsync({ customerId: rider.id, approve, note, overrideReason });
      Alert.alert(approve ? 'KYC approved' : 'KYC rejected', approve ? `${rider.name ?? 'The rider'} is verified.` : 'The rider can see your reason.');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Please try again.';
      if (message.includes(DUPLICATE_AADHAAR_CODE)) {
        if (isAdmin) setDialog({ kind: 'override', rider });
        else Alert.alert('Aadhaar already in use', 'Another rider already uses this Aadhaar number. Only Admin can approve it. Ask Admin, or reject with a reason.');
      } else {
        Alert.alert('Could not complete this', message);
      }
    } finally {
      setBusyId(null);
    }
  };

  const confirmApprove = (rider: KycRider) =>
    Alert.alert(
      'Approve this rider?',
      `${rider.name ?? 'Rider'}\n\nApprove only after you have checked the ORIGINAL Aadhaar card in person and the number matches what is shown here.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => run(rider, true) },
      ],
    );

  const renderItem = ({ item }: { item: KycRider }) => {
    const busy = busyId === item.id;
    const shown = reveal.has(item.id);
    return (
      <View style={[styles.card, item.rejection && { borderLeftColor: Colors.statusError }]}>
        <View style={styles.headRow}>
          <Text style={styles.name}>{item.name ?? 'Unnamed rider'}</Text>
          <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
        </View>
        <Text style={styles.sub}>{item.phone ?? 'No phone'}</Text>

        <View style={styles.docRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.docLabel}>AADHAAR</Text>
            <Text style={styles.docValue}>{shown ? formatAadhaar(item.aadhar_no) : maskAadhaar(item.aadhar_no)}</Text>
          </View>
          <Pressable onPress={() => toggleReveal(item.id)} accessibilityRole="button" accessibilityLabel={shown ? 'Hide Aadhaar number' : 'Show full Aadhaar number'}>
            <Text style={styles.link}>{shown ? 'Hide' : 'Show full'}</Text>
          </Pressable>
        </View>
        <View style={styles.docRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.docLabel}>PAN</Text>
            <Text style={styles.docValue}>{item.pan_no || '—'}</Text>
          </View>
        </View>
        {!!item.address && <Text style={styles.meta}>Address: {item.address}</Text>}
        {!!item.emergency_contact_1 && <Text style={styles.meta}>Emergency contact: {item.emergency_contact_1}</Text>}

        {item.rejection && (
          <View style={styles.rejectedBox}>
            <Text style={styles.rejectedTitle}>Rejected {timeAgo(item.rejection.reviewed_at)}</Text>
            {!!item.rejection.reason && <Text style={styles.rejectedText}>“{item.rejection.reason}”</Text>}
          </View>
        )}

        <DuplicateWarning customerId={item.id} />

        <View style={styles.actions}>
          {!item.rejection && (
            <Pressable
              disabled={busy}
              onPress={() => setDialog({ kind: 'reject', rider: item })}
              style={({ pressed }) => [styles.btn, styles.btnReject, (pressed || busy) && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Reject KYC"
            >
              <Text style={styles.btnRejectText}>Reject</Text>
            </Pressable>
          )}
          <Pressable
            disabled={busy}
            onPress={() => confirmApprove(item)}
            style={({ pressed }) => [styles.btn, styles.btnApprove, (pressed || busy) && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Approve KYC"
          >
            {busy ? <ActivityIndicator size="small" color={Colors.brandNavy} /> : <Text style={styles.btnApproveText}>{item.rejection ? 'Approve now' : 'Approve'}</Text>}
          </Pressable>
        </View>
      </View>
    );
  };

  if (!canReview) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="lock-closed-outline" size={32} color={Colors.textMuted} />
        <Text style={styles.emptyTitle}>Captains only</Text>
        <Text style={styles.emptyBody}>KYC checks are done by the hub Captain.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Ionicons name="id-card-outline" size={20} color={Colors.brandTealDim} style={{ marginRight: 6 }} />
        <Text style={styles.headerTitle}>KYC Review</Text>
        {waiting.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{waiting.length} waiting</Text>
          </View>
        )}
      </View>

      <View style={styles.segBar} accessibilityRole="tablist">
        {(['waiting', 'rejected'] as Segment[]).map((s) => {
          const on = segment === s;
          const count = s === 'waiting' ? waiting.length : rejected.length;
          return (
            <Pressable key={s} onPress={() => setSegment(s)} style={[styles.seg, on && styles.segOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Text style={[styles.segText, on && styles.segTextOn]}>{s === 'waiting' ? 'Waiting' : 'Rejected'} ({count})</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.brandTealDim} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={32} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Could not load riders</Text>
          <Text style={styles.emptyBody}>{error.message}</Text>
          <Pressable onPress={() => refetch()} style={[styles.btn, styles.btnReject, { marginTop: Spacing.md, flex: 0, paddingHorizontal: Spacing.xl }]}>
            <Text style={styles.btnRejectText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.brandTealDim} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-done-circle-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>{segment === 'waiting' ? 'No riders waiting' : 'No rejected riders'}</Text>
              <Text style={styles.emptyBody}>
                {segment === 'waiting' ? 'Riders who register in the Rider app appear here until you check their documents.' : 'Riders you reject show here with your reason.'}
              </Text>
            </View>
          }
        />
      )}

      <ReasonModal
        visible={dialog?.kind === 'reject'}
        title="Reject this KYC check?"
        message="The rider will see your reason. Write what is wrong, e.g. “Aadhaar number does not match the card”."
        confirmLabel="Reject"
        destructive
        onCancel={() => setDialog(null)}
        onConfirm={(reason) => {
          const rider = dialog?.rider;
          setDialog(null);
          if (rider) void run(rider, false, reason);
        }}
      />
      <ReasonModal
        visible={dialog?.kind === 'override'}
        title="Approve a repeated Aadhaar?"
        message="Another rider already uses this number. Admin may approve it with a written reason (kept in the review trail)."
        confirmLabel="Approve anyway"
        minLength={8}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) => {
          const rider = dialog?.rider;
          setDialog(null);
          if (rider) void run(rider, true, undefined, reason);
        }}
      />
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
  segBar: { flexDirection: 'row', backgroundColor: Colors.surfaceCard, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  seg: { flex: 1, minHeight: 40, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.borderInput, justifyContent: 'center', alignItems: 'center' },
  segOn: { backgroundColor: Colors.brandTeal, borderColor: Colors.brandTeal },
  segText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  segTextOn: { color: Colors.brandNavy },
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
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  timestamp: { fontSize: 11, color: Colors.textMuted, fontWeight: '500', marginLeft: 8 },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  docRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgApp, borderRadius: Radius.sm, padding: Spacing.sm + 2, marginTop: Spacing.sm },
  docLabel: { ...Typography.overline, color: Colors.textMuted },
  docValue: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginTop: 2, letterSpacing: 0.5 },
  link: { fontSize: 13, fontWeight: '700', color: Colors.brandTealDim, paddingHorizontal: 6, paddingVertical: 4 },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: 6 },
  rejectedBox: { backgroundColor: '#FEE2E2', borderRadius: Radius.sm, padding: Spacing.sm + 2, marginTop: Spacing.sm },
  rejectedTitle: { fontSize: 12, fontWeight: '700', color: Colors.textError },
  rejectedText: { fontSize: 13, color: Colors.textError, marginTop: 2, fontStyle: 'italic' },
  dupBox: { flexDirection: 'row', backgroundColor: '#FEF2F2', borderRadius: Radius.sm, padding: Spacing.sm + 2, marginTop: Spacing.sm },
  dupTitle: { fontSize: 12, fontWeight: '700', color: Colors.textError },
  dupLine: { fontSize: 12, color: Colors.textError, marginTop: 2 },
  dupHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  btn: { flex: 1, minHeight: 48, borderRadius: Radius.button, justifyContent: 'center', alignItems: 'center' },
  btnReject: { backgroundColor: Colors.surfaceCard, borderWidth: 1, borderColor: Colors.borderInput },
  btnRejectText: { ...Typography.buttonSecondary, color: Colors.textSecondary },
  btnApprove: { backgroundColor: Colors.brandTeal },
  btnApproveText: { ...Typography.buttonPrimary, color: Colors.brandNavy },
  emptyBox: { alignItems: 'center', padding: Spacing.xl },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginTop: 12, marginBottom: 4 },
  emptyBody: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', maxWidth: 280, lineHeight: 18 },
});
