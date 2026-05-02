// ─────────────────────────────────────────────────────────────────────────────
// App Tab Layout — 5 tabs: Overview, Rentals, Fleet, Payments, Riders
// Uses @expo/vector-icons (Ionicons) — no emoji icons.
// Touch targets: each TabItem meets 48×48dp minimum.
// Safe area: bottom inset applied to tab bar.
// ─────────────────────────────────────────────────────────────────────────────

import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { YanaHeader } from '../../src/components/YanaHeader';
import { useAuthStore } from '../../src/stores/authStore';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabItemProps {
  iconActive: IoniconName;
  iconInactive: IoniconName;
  label: string;
  focused: boolean;
  onPress: () => void;
}

function TabItem({ iconActive, iconInactive, label, focused, onPress }: TabItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tabItem, { opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
    >
      <View style={[styles.tabPill, focused && styles.tabPillActive]}>
        <Ionicons
          name={focused ? iconActive : iconInactive}
          size={18}
          color={focused ? Colors.brandNavy : Colors.textSecondary}
        />
        <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const TAB_CONFIG: { iconActive: IoniconName; iconInactive: IoniconName; label: string; route: string }[] = [
  { iconActive: 'analytics',     iconInactive: 'analytics-outline',      label: 'Overview', route: 'index'    },
  { iconActive: 'document-text', iconInactive: 'document-text-outline',  label: 'Rentals',  route: 'rentals'  },
  { iconActive: 'car',           iconInactive: 'car-outline',            label: 'Fleet',    route: 'fleet'    },
  { iconActive: 'card',          iconInactive: 'card-outline',           label: 'Payments', route: 'payments' },
  { iconActive: 'people',        iconInactive: 'people-outline',         label: 'Riders',   route: 'riders'   },
];

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
          <View
            style={[
              styles.tabBar,
              { paddingBottom: Math.max(insets.bottom, 8) },
            ]}
          >
            {TAB_CONFIG.map((tab, i) => (
              <TabItem
                key={tab.route}
                iconActive={tab.iconActive}
                iconInactive={tab.iconInactive}
                label={tab.label}
                focused={state.index === i}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: state.routes[i]?.key ?? '',
                    canPreventDefault: true,
                  });
                  if (!event.defaultPrevented) navigation.navigate(tab.route);
                }}
              />
            ))}
          </View>
        )}
      >
        <Tabs.Screen name="index"    />
        <Tabs.Screen name="rentals"  />
        <Tabs.Screen name="fleet"    />
        <Tabs.Screen name="payments" />
        <Tabs.Screen name="riders"   />
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
    paddingHorizontal: Spacing.xs,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    // Ensure minimum touch target height is met
    minHeight: 48,
    justifyContent: 'center',
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.button,
  },
  tabPillActive: {
    backgroundColor: Colors.brandCyan,
  },
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
