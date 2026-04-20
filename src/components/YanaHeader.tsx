// ─────────────────────────────────────────────────────────────────────────────
// YanaHeader — Global App Header
// Appears on every screen post-login. Shows wordmark + store name + role badge.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing, Typography } from '../constants/design';

interface YanaHeaderProps {
  storeName?: string;
  role?: string;
  onSignOut?: () => void;
}

export function YanaHeader({ storeName, role, onSignOut }: YanaHeaderProps) {
  return (
    <View style={styles.header}>
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
          <Pressable onPress={onSignOut} style={styles.signOutBtn} hitSlop={12}>
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
    paddingVertical: 12,
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
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  roleText: {
    ...Typography.badgeText,
    color: Colors.textSecondary,
  },
  signOutBtn: {
    paddingHorizontal: 4,
  },
  signOutText: {
    ...Typography.bodySecondary,
    color: Colors.statusOverdue,
    fontWeight: '600',
  },
});
