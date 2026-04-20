// ─────────────────────────────────────────────────────────────────────────────
// App Tab Layout — 5 tabs: Overview, Rentals, Fleet, Payments, Riders
// Custom styled tab bar per DESIGN_OPS.md §5.2
// ─────────────────────────────────────────────────────────────────────────────

import { Tabs, router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { YanaHeader } from '../../src/components/YanaHeader';
import { useAuthStore } from '../../src/stores/authStore';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';

interface TabItemProps {
  icon: string;
  label: string;
  focused: boolean;
  onPress: () => void;
}

function TabItem({ icon, label, focused, onPress }: TabItemProps) {
  return (
    <Pressable onPress={onPress} style={styles.tabItem}>
      <View style={[styles.tabPill, focused && styles.tabPillActive]}>
        <Text style={styles.tabIcon}>{icon}</Text>
        <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const { signOut, profile } = useAuthStore();
  const { selectedStore, clearStore } = useStoreSelectionStore();

  const handleSignOut = async () => {
    await clearStore();
    await signOut();
    router.replace('/(auth)/login');
  };

  return (
    <View style={{ flex: 1 }}>
      <YanaHeader
        storeName={selectedStore?.name}
        role={profile?.role}
        onSignOut={handleSignOut}
      />
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={({ state, navigation }) => (
          <View style={[styles.tabBar, { paddingBottom: insets.bottom + 4 }]}>
            {[
              { icon: '📊', label: 'Overview', route: 'index' },
              { icon: '📓', label: 'Rentals', route: 'rentals' },
              { icon: '🚚', label: 'Fleet', route: 'fleet' },
              { icon: '💳', label: 'Payments', route: 'payments' },
              { icon: '👤', label: 'Riders', route: 'riders' },
            ].map((tab, i) => (
              <TabItem
                key={tab.route}
                icon={tab.icon}
                label={tab.label}
                focused={state.index === i}
                onPress={() => {
                  const event = navigation.emit({ type: 'tabPress', target: state.routes[i]?.key ?? '', canPreventDefault: true });
                  if (!event.defaultPrevented) navigation.navigate(tab.route);
                }}
              />
            ))}
          </View>
        )}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="rentals" />
        <Tabs.Screen name="fleet" />
        <Tabs.Screen name="payments" />
        <Tabs.Screen name="riders" />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: Radius.button,
  },
  tabPillActive: {
    backgroundColor: Colors.brandCyan,
  },
  tabIcon: { fontSize: 14 },
  tabLabel: {
    ...Typography.badgeText,
    color: Colors.textSecondary,
    fontSize: 10,
  },
  tabLabelActive: {
    color: Colors.brandNavy,
    fontWeight: '700',
  },
});
