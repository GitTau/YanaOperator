// ─────────────────────────────────────────────────────────────────────────────
// Rider Match — a rider logged in with a phone number that fits more than one customer record
// (or one already tied to another login). The rider was signed out with "a Captain will review it".
// The Captain picks which record is really this person, or says none of them. The server links the
// login to that record once and refuses anything outside the Captain's own hub.
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { useLinkReviews, useResolveLinkReview } from '../../src/hooks/useRiderReviews';
import type { LinkCandidate, LinkReview } from '../../src/services/riderReviewService';
import { useAuthStore } from '../../src/stores/authStore';

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function RiderMatchScreen() {
  const { profile } = useAuthStore();
  const canResolve = profile?.role === 'OPERATOR' || profile?.role === 'ADMIN';
  const { data, isLoading, isRefetching, refetch, error } = useLinkReviews(canResolve);
  const resolve = useResolveLinkReview();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const run = async (review: LinkReview, candidate: LinkCandidate | null) => {
    const key = `${review.review_id}:${candidate?.customer_id ?? 'none'}`;
    setBusyKey(key);
    try {
      await resolve.mutateAsync({ reviewId: review.review_id, customerId: candidate?.customer_id ?? null });
      Alert.alert(
        candidate ? 'Rider linked' : 'Request closed',
        candidate ? `${candidate.name ?? 'The rider'} can now sign in with this phone.` : 'The rider stays unlinked. Ask them to visit the hub.',
      );
    } catch (e) {
      Alert.alert('Could not complete this', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusyKey(null);
    }
  };

  const confirmLink = (review: LinkReview, c: LinkCandidate) =>
    Alert.alert(
      `Link to ${c.name ?? 'this rider'}?`,
      `The person logging in with ${review.phone} will see ${c.name ?? 'this rider'}'s rentals and payments.\n\nLink only if you have met them and know this is the same person. A login can be linked once.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Link', onPress: () => run(review, c) },
      ],
    );

  const confirmNone = (review: LinkReview) =>
    Alert.alert('None of these?', 'The request is closed and the rider stays unlinked. They will need to come to the hub.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close request', style: 'destructive', onPress: () => run(review, null) },
    ]);

  const renderItem = ({ item }: { item: LinkReview }) => (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.phone}>{item.phone}</Text>
        <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
      </View>
      <Text style={styles.sub}>
        {item.reason ? `${item.reason} · ` : ''}Someone logged in with this number. Which rider is it?
      </Text>

      {item.candidates.length === 0 ? (
        <Text style={styles.meta}>No rider of your hub matches. Admin can resolve this one.</Text>
      ) : (
        item.candidates.map((c) => {
          const busy = busyKey === `${item.review_id}:${c.customer_id}`;
          return (
            <View key={c.customer_id} style={styles.candidate}>
              <View style={{ flex: 1 }}>
                <Text style={styles.candName}>{c.name ?? 'Unnamed rider'}</Text>
                <Text style={styles.candMeta}>
                  {c.store_name ?? 'No hub'} · since {new Date(c.since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {c.has_open_rental ? ' · rental open' : ''}
                </Text>
              </View>
              <Pressable
                disabled={busyKey !== null}
                onPress={() => confirmLink(item, c)}
                style={({ pressed }) => [styles.linkBtn, (pressed || busy) && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`Link to ${c.name ?? 'this rider'}`}
              >
                {busy ? <ActivityIndicator size="small" color={Colors.brandNavy} /> : <Text style={styles.linkBtnText}>This one</Text>}
              </Pressable>
            </View>
          );
        })
      )}

      <Pressable
        disabled={busyKey !== null}
        onPress={() => confirmNone(item)}
        style={({ pressed }) => [styles.noneBtn, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="None of these riders"
      >
        <Text style={styles.noneText}>None of these</Text>
      </Pressable>
    </View>
  );

  if (!canResolve) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="lock-closed-outline" size={32} color={Colors.textMuted} />
        <Text style={styles.emptyTitle}>Captains only</Text>
        <Text style={styles.emptyBody}>Rider matches are decided by the hub Captain.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Ionicons name="people-outline" size={20} color={Colors.brandTealDim} style={{ marginRight: 6 }} />
        <Text style={styles.headerTitle}>Rider Match</Text>
        {(data?.length ?? 0) > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{data?.length} waiting</Text>
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
          <Text style={styles.emptyTitle}>Could not load matches</Text>
          <Text style={styles.emptyBody}>{error.message}</Text>
          <Pressable onPress={() => refetch()} style={[styles.noneBtn, { marginTop: Spacing.md, paddingHorizontal: Spacing.xl }]}>
            <Text style={styles.noneText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.review_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.brandTealDim} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-done-circle-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Nothing to match</Text>
              <Text style={styles.emptyBody}>When a phone number fits more than one rider, the login waits here for you.</Text>
            </View>
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
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phone: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  timestamp: { fontSize: 11, color: Colors.textMuted, fontWeight: '500', marginLeft: 8 },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },
  meta: { fontSize: 12, color: Colors.textMuted, marginTop: Spacing.sm },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.sm,
    padding: Spacing.sm + 2,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  candName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  candMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  linkBtn: { minWidth: 92, minHeight: 44, borderRadius: Radius.button, backgroundColor: Colors.brandTeal, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.md },
  linkBtnText: { ...Typography.buttonPrimary, color: Colors.brandNavy, fontSize: 13 },
  noneBtn: { minHeight: 44, borderRadius: Radius.button, borderWidth: 1, borderColor: Colors.borderInput, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.md },
  noneText: { ...Typography.buttonSecondary, color: Colors.textSecondary },
  emptyBox: { alignItems: 'center', padding: Spacing.xl },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginTop: 12, marginBottom: 4 },
  emptyBody: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', maxWidth: 280, lineHeight: 18 },
});
