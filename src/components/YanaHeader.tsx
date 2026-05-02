// ─────────────────────────────────────────────────────────────────────────────
// YanaHeader — Global App Header
// Appears on every screen post-login. Shows wordmark + store name + role badge.
// Safe-area aware: respects device top inset (notch / status bar).
// Touch targets: sign-out button meets 44pt minimum via hitSlop.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography } from '../constants/design';

interface YanaHeaderProps {
  storeName?: string;
  role?: string;
  onSignOut?: () => void;
}

export function YanaHeader({ storeName, role, onSignOut }: YanaHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
      {/* Wordmark */}
      <View style={styles.left}>
        <Text style={styles.wordmark}>YANA</Text>
        {storeName && (
          <Text style={styles.storeName} numberOfLines={1}>
            {storeName}
          </Text>
        )}
      </View>

      {/* Right: role badge + sign out */}
      <View style={styles.right}>
        {role && (
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{role}</Text>
          </View>
        )}
        {onSignOut && (
          <Pressable
            onPress={onSignOut}
            style={({ pressed }) => [styles.signOutBtn, { opacity: pressed ? 0.6 : 1 }]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Sign out"
            accessibilityRole="button"
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        )}
      </View>
    </View>
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
  },
  left: {
    flex: 1,
  },
  wordmark: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.brandCyan,
    letterSpacing: 2,
  },
  storeName: {
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  signOutBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  signOutText: {
    ...Typography.bodySecondary,
    color: Colors.statusOverdue,
    fontWeight: '600',
  },
});
