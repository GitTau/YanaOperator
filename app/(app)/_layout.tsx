// ─────────────────────────────────────────────────────────────────────────────
// App Tab Layout — 5 tabs: Overview, Rentals, Fleet, Payments, Riders
// Uses @expo/vector-icons (Ionicons) — no emoji icons.
// Touch targets: each TabItem meets 48×48dp minimum.
// Safe area: bottom inset applied to tab bar.
// ─────────────────────────────────────────────────────────────────────────────

import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { YanaHeader } from '../../src/components/YanaHeader';
import { useAuthStore } from '../../src/stores/authStore';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import { useIsEodTime, useCaptainByStore } from '../../src/hooks/useQueries';
import { updateCaptainPushToken } from '../../src/services/bookingService';

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
      style={({ pressed }) => [
        styles.tabItem,
        {
          opacity: pressed ? 0.75 : 1,
        },
      ]}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
    >
      <Ionicons
        name={focused ? iconActive : iconInactive}
        size={20}
        color={focused ? Colors.brandTeal : Colors.textSecondary}
      />
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
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

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#06B6D4',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Failed to get push token for push notification! Permission not granted.');
    return null;
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('No Expo project ID found');
      return null;
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    console.log('Expo Push Token generated:', token);
    return token;
  } catch (error) {
    console.error('Error getting expo push token', error);
    return null;
  }
}

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const { signOut, profile } = useAuthStore();
  const { selectedStore, clearStore } = useStoreSelectionStore();
  const isEodTime = useIsEodTime();

  const storeId = selectedStore?.store_id ?? null;
  const { data: captain } = useCaptainByStore(storeId);
  const captainId = captain?.id ?? null;

  useEffect(() => {
    if (!captainId) return;

    async function setupNotifications() {
      try {
        const token = await registerForPushNotificationsAsync();
        if (token && captain?.push_token !== token) {
          await updateCaptainPushToken(captainId, token);
          console.log(`Updated push token for captain ${captainId}`);
        }
      } catch (err) {
        console.warn('Failed to set up notifications:', err);
      }
    }

    setupNotifications();
  }, [captainId, captain?.push_token]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.segment === 'tasks') {
        router.push('/(app)/performance?segment=tasks');
      }
    });
    return () => subscription.remove();
  }, []);

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
        isEodTime={isEodTime}
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
        <Tabs.Screen name="index"       />
        <Tabs.Screen name="rentals"     />
        <Tabs.Screen name="fleet"       />
        <Tabs.Screen name="payments"    />
        <Tabs.Screen name="riders"      />
        {/* maintenance — hidden from tab bar, accessed via hamburger menu */}
        <Tabs.Screen name="maintenance" options={{ href: null }} />
        {/* performance — hidden from tab bar, accessed via hamburger menu */}
        <Tabs.Screen name="performance" options={{ href: null }} />
        {/* eod — hidden from tab bar, accessed via Operator button in header */}
        <Tabs.Screen name="eod"         options={{ href: null }} />
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
    paddingTop: 8,
    paddingHorizontal: 8,
    height: 56, // Standard mobile stacked tab bar height
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    position: 'relative',
  },
  tabLabel: {
    ...Typography.badgeText,
    color: Colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: Colors.brandTeal, // High-energy cyan text
    fontWeight: '800',
  },
});


