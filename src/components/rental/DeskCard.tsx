// ─────────────────────────────────────────────────────────────────────────────
// DeskCard — Rental Desk card in the RentalCard v4 look (v1.9):
// avatar + name + reason line, status pills, scooter/battery chips, plan tag,
// then one or two big action buttons. Small co-located helpers: DeskPill, DeskButton.
// ─────────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Colors, Spacing, Typography } from '../../constants/design';

export type DeskTone = 'red' | 'amber' | 'blue' | 'none';

export function DeskPill({ label, kind }: { label: string; kind: 'red' | 'amber' | 'blue' | 'green' | 'slate' | 'clear' | 'notclear' }) {
  const cfg = {
    red: { bg: Colors.surfaceRed, fg: Colors.textError, border: '#FECACA' },
    amber: { bg: Colors.surfaceAmber, fg: Colors.textWarning, border: Colors.borderLight },
    blue: { bg: Colors.surfaceBlue, fg: Colors.blueText, border: Colors.borderLight },
    green: { bg: Colors.surfaceGreen, fg: Colors.textSuccess, border: Colors.borderLight },
    slate: { bg: Colors.borderLight, fg: Colors.textSecondary, border: Colors.borderLight },
    clear: { bg: Colors.surfaceGreen, fg: Colors.textSuccess, border: Colors.statusActive },
    notclear: { bg: Colors.surfaceRed, fg: Colors.textError, border: Colors.statusError },
  }[kind];
  return (
    <View style={[styles.pill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      {kind === 'clear' && <Ionicons name="checkmark-circle" size={11} color={cfg.fg} style={{ marginRight: 3 }} />}
      {kind === 'notclear' && <Ionicons name="lock-closed" size={11} color={cfg.fg} style={{ marginRight: 3 }} />}
      <Text style={[Typography.badgeText, { color: cfg.fg }]}>{label}</Text>
    </View>
  );
}

type ButtonKind = 'teal' | 'orange' | 'green' | 'red' | 'ghost' | 'outline';
export function DeskButton({
  label, kind, onPress, disabled, loading, big, icon, style,
}: {
  label: string; kind: ButtonKind; onPress: () => void; disabled?: boolean; loading?: boolean; big?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name']; style?: StyleProp<ViewStyle>;
}) {
  const bg = { teal: Colors.brandTeal, orange: Colors.statusWarning, green: Colors.statusActive, red: Colors.statusError, ghost: Colors.bgApp, outline: Colors.surfaceCard }[kind];
  const fg = { teal: Colors.brandNavy, orange: '#FFFFFF', green: '#FFFFFF', red: '#FFFFFF', ghost: Colors.textSecondary, outline: Colors.textTeal }[kind];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, minHeight: big ? 50 : 48, opacity: off ? 0.45 : 1, transform: [{ scale: pressed && !off ? 0.96 : 1 }] },
        kind === 'ghost' && styles.btnGhost,
        kind === 'outline' && styles.btnOutline,
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : (
        <View style={styles.btnRow}>
          {icon && <Ionicons name={icon} size={16} color={fg} style={{ marginRight: 6 }} />}
          <Text style={[Typography.buttonPrimary, { color: fg, fontSize: big ? 14 : 13, letterSpacing: 0.4 }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

interface DeskCardProps {
  name: string;
  /** Short line under the name: why this card is here. */
  reason: React.ReactNode;
  reasonTone?: 'red' | 'amber' | 'muted' | 'normal';
  tone?: DeskTone;
  pills?: React.ReactNode;
  plate: string | null;
  battery: string | null;
  plan: string | null;
  children?: React.ReactNode; // middle content (e.g. expandable money row)
  actions?: React.ReactNode;
}

export function DeskCard({ name, reason, reasonTone = 'normal', tone = 'none', pills, plate, battery, plan, children, actions }: DeskCardProps) {
  const initials = name.split(' ').map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase();
  const reasonColor = reasonTone === 'red' ? Colors.textError : reasonTone === 'amber' ? Colors.textWarning : reasonTone === 'muted' ? Colors.textMuted : Colors.textSecondary;
  return (
    <View style={[styles.card, tone === 'red' && styles.cardRed, tone === 'amber' && styles.cardAmber, tone === 'blue' && styles.cardBlue]}>
      <View style={styles.headerRow}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={[Typography.bodySecondary, { color: reasonColor, fontWeight: reasonTone === 'red' || reasonTone === 'amber' ? '700' : '500' }]}>{reason}</Text>
        </View>
        {pills ? <View style={styles.pills}>{pills}</View> : null}
      </View>
      <View style={styles.sep} />
      <View style={styles.metaRow}>
        <View style={styles.assetChip}>
          <Ionicons name="bicycle-outline" size={11} color={Colors.brandTeal} />
          <Text style={styles.assetChipText}>{plate ?? 'No scooter held'}</Text>
        </View>
        {battery ? (
          <View style={styles.assetChip}>
            <Ionicons name="battery-charging-outline" size={11} color={Colors.brandTeal} />
            <Text style={styles.assetChipText}>{battery}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {plan ? <View style={styles.planChip}><Text style={styles.planChipText}>{plan.toUpperCase()}</Text></View> : null}
      </View>
      {children}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceCard, borderRadius: 18, borderWidth: 1, borderColor: '#ECEEF4', marginBottom: 12,
    shadowColor: '#B0BAD0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2,
  },
  cardRed: { borderLeftWidth: 3, borderLeftColor: Colors.statusError, borderColor: '#FECACA' },
  cardAmber: { borderLeftWidth: 3, borderLeftColor: Colors.statusWarning },
  cardBlue: { borderLeftWidth: 3, borderLeftColor: Colors.statusInfo },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, paddingBottom: 12, gap: Spacing.sm },
  avatar: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.surfaceTeal, borderWidth: 1.5, borderColor: '#B2EBF5',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '800', color: Colors.textTeal },
  name: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.2 },
  pills: { alignItems: 'flex-end', gap: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, borderWidth: 1 },
  sep: { height: 1, backgroundColor: '#F0F2F7', marginHorizontal: Spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 10 },
  assetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0FDFF', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#B2EBF5',
  },
  assetChipText: { ...Typography.caption, color: Colors.textTeal, fontWeight: '700' },
  planChip: { backgroundColor: Colors.bgApp, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.borderLight },
  planChipText: { ...Typography.badgeText, color: Colors.textSecondary, fontSize: 10 },
  actions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: '#F0F2F7', padding: Spacing.md, paddingTop: 12 },
  btn: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnRow: { flexDirection: 'row', alignItems: 'center' },
  btnGhost: { borderWidth: 1, borderColor: '#ECEEF4' },
  btnOutline: { borderWidth: 1.5, borderColor: Colors.brandTeal },
});
