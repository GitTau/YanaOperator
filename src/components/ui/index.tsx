// ─────────────────────────────────────────────────────────────────────────────
// Reusable UI Components — YanaOperator v2
// Design system: Slate + Deep Teal, rounded-rectangle buttons, Ionicons only.
// No emoji icons. Muted palette. Premium B2B ops aesthetic.
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
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
import { useLayout } from '../../constants/layout';

// ── YanaButton ────────────────────────────────────────────────────────────────
interface YanaButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost' | 'success';
  loading?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  size?: 'sm' | 'md';
}

export function YanaButton({
  label,
  variant = 'primary',
  loading = false,
  icon,
  size = 'md',
  disabled,
  style,
  ...props
}: YanaButtonProps) {
  const bg = {
    primary:   Colors.brandTeal,
    secondary: Colors.surfaceCard,
    danger:    Colors.statusError,
    warning:   Colors.statusWarning,
    ghost:     'transparent',
    success:   Colors.statusActive,
  }[variant];

  const textColor = {
    primary:   '#FFFFFF',
    secondary: Colors.textPrimary,
    danger:    '#FFFFFF',
    warning:   '#FFFFFF',
    ghost:     Colors.textSecondary,
    success:   '#FFFFFF',
  }[variant];

  const isDisabled = disabled || loading;
  const btnHeight = size === 'sm' ? 36 : 44;

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          height: btnHeight,
          opacity: isDisabled ? 0.45 : pressed ? 0.88 : 1,
        },
        variant === 'secondary' && styles.buttonOutline,
        variant === 'ghost' && { paddingHorizontal: 0, height: undefined, minHeight: 36 },
        style as object,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <View style={styles.buttonRow}>
          {icon && (
            <Ionicons
              name={icon}
              size={size === 'sm' ? 14 : 16}
              color={textColor}
              style={styles.buttonIconMargin}
            />
          )}
          <Text style={[Typography.buttonPrimary, { color: textColor, fontSize: size === 'sm' ? 12 : 14 }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
const BADGE_CONFIG: Record<BookingStatusKey, { bg: string; text: string }> = {
  Draft:     { bg: '#F3F4F6', text: '#6B7280' },
  Active:    { bg: '#F0FDF4', text: '#059669' },
  Paused:    { bg: '#FFFBEB', text: '#D97706' },
  Completed: { bg: '#EFF6FF', text: '#2563EB' },
  Cancelled: { bg: '#F9FAFB', text: '#9CA3AF' },
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
        <Ionicons name="checkmark-circle" size={11} color={Colors.statusActive} />
        <Text style={[Typography.badgeText, { color: Colors.statusActive, marginLeft: 3 }]}>CLEAR</Text>
      </View>
    );
  }
  return (
    <View style={[styles.gateBadge, styles.gateBadgeNotClear]}>
      <Ionicons name="lock-closed" size={11} color={Colors.statusError} />
      <Text style={[Typography.badgeText, { color: Colors.statusError, marginLeft: 3 }]}>NOT CLEAR</Text>
    </View>
  );
}

// ── KPICard ───────────────────────────────────────────────────────────────────
interface KPICardProps {
  label: string;
  value: string | number;
  valueColor?: string;
  backgroundColor?: string;  // Coloured card background (green, pink, etc.)
  accentColor?: string;      // Left border accent (no background)
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
}

export function KPICard({
  label,
  value,
  valueColor = Colors.textPrimary,
  backgroundColor = Colors.surfaceCard,
  accentColor,
  icon,
  onPress,
}: KPICardProps) {
  const { fontScale } = useLayout();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.kpiCard,
        { backgroundColor, opacity: pressed && onPress ? 0.88 : 1 },
        accentColor && !backgroundColor ? { borderLeftColor: accentColor, borderLeftWidth: 3 } : undefined,
      ]}
      accessibilityRole={onPress ? 'button' : 'text'}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={18}
          color={valueColor !== Colors.textPrimary ? valueColor : Colors.textSecondary}
          style={styles.kpiIcon}
        />
      )}
      <Text
        style={[Typography.h2Metric, { color: valueColor, fontSize: fontScale(30) }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
      <Text style={[Typography.labelCaps, styles.kpiLabel]}>
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

export function ProgressBar({ progress, height = 6 }: ProgressBarProps) {
  const clipped = Math.min(Math.max(progress, 0), 1);

  let fillColor = Colors.brandTeal;
  if (clipped >= 1) fillColor = Colors.statusActive;
  else if (clipped < 0.4) fillColor = Colors.statusWarning;

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
      placeholderTextColor={Colors.textMuted}
      style={[styles.searchBar, props.style]}
      accessibilityLabel={placeholder}
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
      <Ionicons name="warning-outline" size={16} color={Colors.statusError} style={{ marginRight: 8 }} />
      <Text style={styles.errorBannerText}>{message}</Text>
      <View style={styles.errorBannerActions}>
        {onRetry && (
          <Pressable onPress={onRetry} hitSlop={8}>
            <Text style={styles.errorBannerLink}>Retry</Text>
          </Pressable>
        )}
        {onDismiss && (
          <Pressable onPress={onDismiss} style={{ marginLeft: 12 }} hitSlop={8}>
            <Ionicons name="close" size={14} color={Colors.statusError} />
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
      <Ionicons name="cloud-offline-outline" size={14} color={Colors.statusWarning} style={{ marginRight: 6 }} />
      <Text style={styles.offlineBannerText}>No connection — showing last known data</Text>
    </View>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
export function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="file-tray-outline" size={32} color={Colors.textMuted} style={{ marginBottom: 8 }} />
      <Text style={styles.emptyStateTitle}>{message}</Text>
      {sub && <Text style={styles.emptyStateSub}>{sub}</Text>}
    </View>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────
export function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={styles.sectionHeader}>
      {sub && <Text style={[Typography.overline, styles.sectionOverline]}>{sub.toUpperCase()}</Text>}
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
      <Text style={[Typography.badgeText, { color: Colors.textSecondary }]}>LIVE</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIconMargin: {
    marginRight: 6,
  },

  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
  },
  gateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
  gateBadgeClear: {
    borderColor: Colors.statusActive,
    backgroundColor: Colors.surfaceGreen,
  },
  gateBadgeNotClear: {
    borderColor: Colors.statusError,
    backgroundColor: Colors.surfaceRed,
  },

  kpiCard: {
    flex: 1,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceCard,
    minHeight: 100,
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
    borderRadius: Radius.pill,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    borderRadius: Radius.pill,
  },

  searchBar: {
    minHeight: 44,
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.input,
    borderWidth: 1,
    borderColor: Colors.borderInput,
    paddingHorizontal: Spacing.md,
    ...Typography.bodyPrimary,
    color: Colors.textPrimary,
  },

  skeleton: {
    backgroundColor: '#EDEEF2',
    borderRadius: Radius.card,
    marginBottom: Spacing.sm,
  },

  errorBanner: {
    backgroundColor: Colors.surfaceRed,
    borderLeftWidth: 3,
    borderLeftColor: Colors.statusError,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorBannerText: {
    color: Colors.statusError,
    flex: 1,
    ...Typography.bodySecondary,
  },
  errorBannerActions: {
    flexDirection: 'row',
    marginLeft: 8,
    alignItems: 'center',
  },
  errorBannerLink: {
    color: Colors.statusError,
    fontWeight: '700',
    fontSize: 12,
  },

  offlineBanner: {
    backgroundColor: Colors.surfaceAmber,
    borderLeftWidth: 3,
    borderLeftColor: Colors.statusWarning,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  offlineBannerText: {
    color: Colors.statusWarning,
    ...Typography.bodySecondary,
    fontWeight: '600',
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: 4,
  },
  emptyStateTitle: {
    ...Typography.bodyPrimary,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
  },
  emptyStateSub: {
    ...Typography.bodySecondary,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
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
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignSelf: 'flex-start',
  },
  storeLiveDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.pill,
    backgroundColor: Colors.statusActive,
  },
});
