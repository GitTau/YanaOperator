// ─────────────────────────────────────────────────────────────────────────────
// Reusable UI Components — YanaOperator
// All components follow DESIGN_OPS.md specs exactly.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/design';
import type { BookingStatusKey } from '../../constants/design';

// ── YanaButton ────────────────────────────────────────────────────────────────
interface YanaButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost' | 'success';
  loading?: boolean;
  icon?: React.ReactNode;
}

export function YanaButton({
  label,
  variant = 'primary',
  loading = false,
  icon,
  disabled,
  style,
  ...props
}: YanaButtonProps) {
  const bg = {
    primary: Colors.brandCyan,
    secondary: Colors.surfaceCard,
    danger: Colors.statusOverdue,
    warning: Colors.statusWarning,
    ghost: 'transparent',
    success: Colors.statusActive,
  }[variant];

  const textColor = {
    primary: Colors.brandNavy,
    secondary: Colors.textPrimary,
    danger: '#FFFFFF',
    warning: '#FFFFFF',
    ghost: Colors.textSecondary,
    success: '#FFFFFF',
  }[variant];

  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: isDisabled ? 0.5 : pressed ? 0.88 : 1 },
        variant === 'secondary' && styles.buttonOutline,
        variant === 'ghost' && { paddingHorizontal: 0 },
        style as object,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <View style={styles.buttonRow}>
          {icon && <View style={styles.buttonIcon}>{icon}</View>}
          <Text style={[Typography.buttonPrimary, { color: textColor }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
const BADGE_CONFIG: Record<BookingStatusKey, { bg: string; text: string }> = {
  Draft: { bg: '#EEEEEE', text: '#616161' },
  Active: { bg: '#E8F5E9', text: '#00C853' },
  Paused: { bg: '#FFF8E1', text: '#FF8F00' },
  Completed: { bg: '#E3F2FD', text: '#1565C0' },
  Cancelled: { bg: '#FAFAFA', text: '#9E9E9E' },
};

interface StatusBadgeProps {
  status: BookingStatusKey;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = BADGE_CONFIG[status];
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[Typography.badgeText, { color: config.text }]}>{status.toUpperCase()}</Text>
    </View>
  );
}

// ── PaymentGateBadge (NOT CLEAR / CLEAR) ─────────────────────────────────────
export function PaymentGateBadge({ isCleared }: { isCleared: boolean }) {
  if (isCleared) {
    return (
      <View style={[styles.gateBadge, styles.gateBadgeClear]}>
        <Text style={[Typography.badgeText, { color: Colors.statusActive }]}>✓ CLEAR</Text>
      </View>
    );
  }
  return (
    <View style={[styles.gateBadge, styles.gateBadgeNotClear]}>
      <Text style={[Typography.badgeText, { color: Colors.statusNotClear }]}>🔒 NOT CLEAR</Text>
    </View>
  );
}

// ── KPICard ───────────────────────────────────────────────────────────────────
interface KPICardProps {
  label: string;
  value: string | number;
  valueColor?: string;
  backgroundColor?: string;
  icon?: React.ReactNode;
  onPress?: () => void;
}

export function KPICard({
  label,
  value,
  valueColor = Colors.textPrimary,
  backgroundColor = Colors.surfaceCard,
  icon,
  onPress,
}: KPICardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.kpiCard,
        { backgroundColor, opacity: pressed && onPress ? 0.88 : 1 },
      ]}
    >
      {icon && <View style={styles.kpiIcon}>{icon}</View>}
      <Text style={[Typography.h2Card, { color: valueColor }]}>{value}</Text>
      <Text style={[Typography.labelCaps, styles.kpiLabel, { color: Colors.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── ProgressBar ───────────────────────────────────────────────────────────────
interface ProgressBarProps {
  progress: number; // 0–1
  height?: number;
}

export function ProgressBar({ progress, height = 8 }: ProgressBarProps) {
  const clipped = Math.min(Math.max(progress, 0), 1);

  let fillColor = Colors.brandCyan;
  if (clipped >= 1) fillColor = Colors.statusActive;
  else if (clipped < 0.5) fillColor = Colors.amber;

  return (
    <View style={[styles.progressTrack, { height }]}>
      <View
        style={[
          styles.progressFill,
          { width: `${clipped * 100}%`, backgroundColor: fillColor, height },
        ]}
      />
    </View>
  );
}

// ── SearchBar ─────────────────────────────────────────────────────────────────
interface SearchBarProps extends TextInputProps {
  placeholder?: string;
}

export function SearchBar({ placeholder = 'Search...', ...props }: SearchBarProps) {
  return (
    <TextInput
      {...props}
      placeholder={placeholder}
      placeholderTextColor={Colors.textSecondary}
      style={[styles.searchBar, props.style]}
    />
  );
}

// ── SkeletonCard ──────────────────────────────────────────────────────────────
export function SkeletonCard({ height = 100 }: { height?: number }) {
  return <View style={[styles.skeleton, { height }]} />;
}

// ── ErrorBanner ───────────────────────────────────────────────────────────────
interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onRetry, onDismiss }: ErrorBannerProps) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorBannerText}>⚠ {message}</Text>
      <View style={styles.errorBannerActions}>
        {onRetry && (
          <Pressable onPress={onRetry}>
            <Text style={styles.errorBannerLink}>Retry</Text>
          </Pressable>
        )}
        {onDismiss && (
          <Pressable onPress={onDismiss} style={{ marginLeft: 12 }}>
            <Text style={styles.errorBannerLink}>✕</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── OfflineBanner ─────────────────────────────────────────────────────────────
export function OfflineBanner() {
  return (
    <View style={styles.offlineBanner}>
      <Text style={styles.offlineBannerText}>
        📡 No connection — showing last known data
      </Text>
    </View>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
export function EmptyState({
  message,
  sub,
}: {
  message: string;
  sub?: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>{message}</Text>
      {sub && <Text style={styles.emptyStateSub}>{sub}</Text>}
    </View>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────
export function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[Typography.overline, styles.sectionOverline]}>{sub?.toUpperCase()}</Text>
      <Text style={[Typography.h1Screen, { color: Colors.textPrimary }]}>{title}</Text>
    </View>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider({ style }: ViewProps) {
  return <View style={[styles.divider, style]} />;
}

// ── StoreLiveBadge ────────────────────────────────────────────────────────────
export function StoreLiveBadge() {
  return (
    <View style={styles.storeLive}>
      <View style={styles.storeLiveDot} />
      <Text style={[Typography.badgeText, { color: Colors.textPrimary }]}>STORE LIVE</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  buttonOutline: {
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonIcon: {
    marginRight: 4,
  },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.badge,
    alignSelf: 'flex-start',
  },
  gateBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.badge,
    borderWidth: 1.5,
    alignSelf: 'flex-start',
  },
  gateBadgeClear: {
    borderColor: Colors.statusActive,
    backgroundColor: Colors.statusAvailableBg,
  },
  gateBadgeNotClear: {
    borderColor: Colors.statusNotClear,
    backgroundColor: Colors.overdueCardBg,
  },

  kpiCard: {
    flex: 1,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    minHeight: 110,
  },
  kpiIcon: {
    marginBottom: Spacing.xs,
  },
  kpiLabel: {
    marginTop: Spacing.xs,
    color: Colors.textSecondary,
  },

  progressTrack: {
    backgroundColor: Colors.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    borderRadius: 4,
  },

  searchBar: {
    height: 48,
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: Spacing.md,
    ...Typography.bodyPrimary,
    color: Colors.textPrimary,
  },

  skeleton: {
    backgroundColor: '#E8E8E8',
    borderRadius: Radius.card,
    marginBottom: Spacing.md,
  },

  errorBanner: {
    backgroundColor: '#FFEBEE',
    borderLeftWidth: 4,
    borderLeftColor: Colors.statusOverdue,
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorBannerText: {
    color: Colors.statusOverdue,
    flex: 1,
    ...Typography.bodySecondary,
  },
  errorBannerActions: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  errorBannerLink: {
    color: Colors.statusOverdue,
    fontWeight: '700',
    fontSize: 12,
  },

  offlineBanner: {
    backgroundColor: '#FFF8E1',
    borderLeftWidth: 4,
    borderLeftColor: Colors.amber,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  offlineBannerText: {
    color: Colors.amber,
    ...Typography.bodySecondary,
    fontWeight: '600',
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyStateTitle: {
    ...Typography.bodyPrimary,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
  },
  emptyStateSub: {
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  sectionHeader: {
    marginBottom: Spacing.md,
  },
  sectionOverline: {
    color: Colors.textSecondary,
    marginBottom: 2,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: Spacing.sm,
  },

  storeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: Colors.surfaceCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignSelf: 'flex-start',
  },
  storeLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.statusActive,
  },
});
