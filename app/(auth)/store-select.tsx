// ─────────────────────────────────────────────────────────────────────────────
// Store Selection Screen — captain picks their ZAP Point
// DESIGN_OPS.md §6.2 spec
// ─────────────────────────────────────────────────────────────────────────────

import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { useStores } from '../../src/hooks/useQueries';
import { useAuthStore } from '../../src/stores/authStore';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import type { Store } from '../../src/lib/database.types';
import { EmptyState, SkeletonCard } from '../../src/components/ui';

export default function StoreSelectScreen() {
  const { data: stores, isLoading, error } = useStores();
  const { setSelectedStore } = useStoreSelectionStore();
  const { signOut, profile } = useAuthStore();
  const [selected, setSelected] = useState<Store | null>(null);

  const handleConfirm = async () => {
    if (!selected) return;
    await setSelectedStore(selected);
    router.replace('/(app)');
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>YANA</Text>
        <Pressable onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.container}>
        <Text style={[Typography.h1Screen, { color: Colors.textPrimary, marginBottom: 4 }]}>
          Select Your ZAP Point
        </Text>
        <Text style={[Typography.bodySecondary, { color: Colors.textSecondary, marginBottom: Spacing.lg }]}>
          {profile?.role === 'ADMIN' ? 'Admin — you can view all stores' : 'Choose the store you\'re operating from today'}
        </Text>

        {isLoading ? (
          <View style={{ gap: 12 }}>
            {[1, 2, 3].map((k) => <SkeletonCard key={k} height={90} />)}
          </View>
        ) : error ? (
          <Text style={{ color: Colors.statusOverdue }}>Failed to load stores. Check your connection.</Text>
        ) : (
          <FlatList
            data={stores ?? []}
            keyExtractor={(item) => item.store_id}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.storeCard, selected?.store_id === item.store_id && styles.storeCardSelected]}
                onPress={() => setSelected(item)}
              >
                <View style={styles.storeCardLeft}>
                  <Text style={[Typography.bodyPrimary, { fontWeight: '700', color: Colors.textPrimary }]}>
                    {item.name}
                  </Text>
                  <Text style={[Typography.bodySecondary, { color: Colors.textSecondary, marginTop: 2 }]}>
                    {item.location}
                  </Text>
                  <View style={styles.stateTag}>
                    <Text style={styles.stateTagText}>{item.state_name}</Text>
                  </View>
                </View>
                {selected?.store_id === item.store_id && (
                  <View style={styles.checkIcon}>
                    <Text style={{ fontSize: 20 }}>✓</Text>
                  </View>
                )}
              </Pressable>
            )}
            ListEmptyComponent={<EmptyState message="No ZAP Points found." sub="Contact your admin." />}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Bottom CTA */}
      {selected && (
        <View style={styles.bottomBar}>
          <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
            <Text style={styles.confirmBtnText}>SET AS MY STORE — {selected.name}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgApp },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  wordmark: { fontSize: 22, fontWeight: '900', color: Colors.brandCyan, letterSpacing: 2 },
  signOutText: { ...Typography.bodySecondary, color: Colors.statusOverdue, fontWeight: '600' },

  container: { flex: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.lg },

  storeCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  storeCardSelected: {
    borderColor: Colors.brandCyan,
    backgroundColor: '#E0FDFF',
    borderLeftWidth: 4,
  },
  storeCardLeft: { flex: 1 },
  stateTag: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: Colors.bgApp,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  stateTagText: { ...Typography.badgeText, color: Colors.textSecondary },
  checkIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.brandCyan, alignItems: 'center', justifyContent: 'center' },

  bottomBar: {
    padding: Spacing.md,
    backgroundColor: Colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  confirmBtn: {
    height: 54,
    backgroundColor: Colors.brandCyan,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: { ...Typography.buttonPrimary, color: Colors.brandNavy, letterSpacing: 1 },
});
