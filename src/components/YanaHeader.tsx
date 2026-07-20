// ─────────────────────────────────────────────────────────────────────────────
// YanaHeader — Global App Header
// Appears on every screen post-login. Shows wordmark + store name + role badge.
// v2: Adds hamburger menu (top-right) with Maintenance, Performance, Tasks items.
// Safe-area aware: respects device top inset (notch / status bar).
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing, Typography } from '../constants/design';
import { YanaLogo } from './YanaLogo';

interface YanaHeaderProps {
  storeName?: string;
  role?: string;
  onSignOut?: () => void;
  /** True after 10 PM IST — EOD button glows green */
  isEodTime?: boolean;
}

type MenuItemDef = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  route?: string;
  isPlaceholder?: boolean;
};

const MENU_ITEMS: MenuItemDef[] = [
  { id: 'maintenance', label: 'Maintenance',  icon: 'construct-outline',       route: '/(app)/maintenance' },
  { id: 'performance', label: 'Performance',  icon: 'bar-chart-outline',       route: '/(app)/performance?segment=performance' },
  { id: 'tasks',       label: 'Tasks',         icon: 'checkbox-outline',        route: '/(app)/performance?segment=tasks' },
  { id: 'signout',     label: 'Sign Out',      icon: 'log-out-outline' },
];

export function YanaHeader({ storeName, role, onSignOut, isEodTime = false }: YanaHeaderProps) {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  // Pulsing glow animation for EOD button
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isEodTime) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0,  duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isEodTime, pulseAnim]);

  const openMenu = () => {
    setMenuOpen(true);
    Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  };

  const closeMenu = () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() =>
      setMenuOpen(false),
    );
  };

  const handleMenuItemPress = (item: MenuItemDef) => {
    closeMenu();
    if (item.id === 'signout') {
      if (onSignOut) onSignOut();
      return;
    }
    if (item.isPlaceholder) return; // TODO: show toast when implemented
    if (item.route) {
      router.push(item.route as Parameters<typeof router.push>[0]);
    }
  };

  return (
    <>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        {/* Wordmark logo */}
        <View style={styles.left}>
          <YanaLogo width={90} height={24} color={Colors.brandTeal} />
          {storeName && (
            <Text style={styles.storeName} numberOfLines={1}>
              {storeName}
            </Text>
          )}
        </View>

        {/* Right: role badge + EOD button + hamburger + sign out */}
        <View style={styles.right}>
          {role && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{role}</Text>
            </View>
          )}

          {/* EOD / Operator button */}
          <Animated.View style={{ transform: [{ scale: isEodTime ? pulseAnim : 1 }] }}>
            <Pressable
              onPress={() => router.push('/(app)/eod' as Parameters<typeof router.push>[0])}
              style={({ pressed }) => [
                styles.eodBtn,
                isEodTime && styles.eodBtnActive,
                { opacity: pressed ? 0.8 : 1 },
              ]}
              accessibilityLabel={isEodTime ? 'View EOD Report — ready for download' : 'View EOD Report'}
              accessibilityRole="button"
            >
              <Ionicons
                name={isEodTime ? 'document-text' : 'document-text-outline'}
                size={12}
                color={isEodTime ? '#fff' : Colors.textSecondary}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.eodBtnText, isEodTime && styles.eodBtnTextActive]}>
                {isEodTime ? 'EOD ●' : 'Operator'}
              </Text>
            </Pressable>
          </Animated.View>

          {/* Hamburger menu button */}
          <Pressable
            onPress={openMenu}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Open menu"
            accessibilityRole="button"
          >
            <Ionicons name="menu-outline" size={24} color={Colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* ── Hamburger Dropdown ─────────────────────────────────────────────── */}
      {menuOpen && (
        <Modal transparent animationType="none" visible={menuOpen} onRequestClose={closeMenu}>
          <TouchableWithoutFeedback onPress={closeMenu}>
            <View style={styles.backdrop} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.dropdown, { opacity: fadeAnim }]}>
            {MENU_ITEMS.map((item, idx) => {
              const isSignOut = item.id === 'signout';
              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.menuItem,
                    idx < MENU_ITEMS.length - 1 && styles.menuItemBorder,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={() => handleMenuItemPress(item)}
                >
                  <View
                    style={[
                      styles.menuIconWrap,
                      {
                        backgroundColor: isSignOut
                          ? '#FEE2E2'
                          : item.isPlaceholder
                          ? Colors.bgApp
                          : `${Colors.brandTeal}15`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={16}
                      color={isSignOut ? Colors.statusError : item.isPlaceholder ? Colors.textMuted : Colors.brandTeal}
                    />
                  </View>
                  <Text
                    style={[
                      styles.menuLabel,
                      isSignOut
                        ? { color: Colors.statusError }
                        : item.isPlaceholder && { color: Colors.textMuted },
                    ]}
                  >
                    {item.label}
                  </Text>
                  {isSignOut ? (
                    null
                  ) : item.isPlaceholder ? (
                    <View style={styles.soonBadge}>
                      <Text style={styles.soonText}>SOON</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                  )}
                </Pressable>
              );
            })}
            <View style={styles.debugFooter}>
              <Text style={styles.debugTitle}>OTA UPDATE STATUS</Text>
              <Text style={styles.debugVal}>Enabled: {Updates.isEnabled ? 'Yes' : 'No'}</Text>
              <Text style={styles.debugVal}>Channel: {Updates.channel || 'N/A'}</Text>
              <Text style={styles.debugVal}>Runtime Ver: {Updates.runtimeVersion || 'N/A'}</Text>
              <Text style={styles.debugVal}>Type: {Updates.isEmbeddedLaunch ? 'Embedded Build' : 'OTA Update'}</Text>
              <Text style={styles.debugVal} numberOfLines={1}>ID: {Updates.updateId ? Updates.updateId.substring(0, 8) : 'None'}</Text>
            </View>
          </Animated.View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingHorizontal: Spacing.md,
    paddingBottom: 12,
    zIndex: 10,
  },
  left: {
    flex: 1,
  },
  storeName: {
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleBadge: {
    backgroundColor: Colors.bgApp,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  roleText: {
    ...Typography.badgeText,
    color: Colors.textSecondary,
  },

  // ── EOD Button ─────────────────────────────────────────────────────────────
  eodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.bgApp,
  },
  eodBtnActive: {
    backgroundColor: Colors.statusActive,
    borderColor: Colors.statusActive,
    shadowColor: Colors.statusActive,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  eodBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },
  eodBtnTextActive: {
    color: '#fff',
  },

  iconBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  signOutBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  signOutText: {
    ...Typography.bodySecondary,
    color: Colors.statusOverdue,
    fontWeight: '600',
  },

  // ── Dropdown ──────────────────────────────────────────────────────────────
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  dropdown: {
    position: 'absolute',
    top: 72,
    right: Spacing.md,
    width: 210,
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.modal,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    gap: 10,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  menuIconWrap: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    ...Typography.bodyPrimary,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontSize: 13,
  },
  soonBadge: {
    backgroundColor: Colors.bgApp,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  soonText: {
    fontSize: 8,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  debugFooter: {
    padding: Spacing.sm,
    backgroundColor: Colors.bgApp,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  debugTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  debugVal: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontFamily: 'System',
    lineHeight: 14,
  },
});
