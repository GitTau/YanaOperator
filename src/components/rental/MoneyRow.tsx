// ─────────────────────────────────────────────────────────────────────────────
// MoneyRow — the "TO PAY NOW" row on a rider card, styled like RentalCard's
// FINANCIAL HEALTH row. Tap to open the breakdown inside the card:
// fines → security top-up → rent (D-028), rent timeline, late fines, next fine.
// ─────────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing, Typography } from '../../constants/design';
import { rupees, type RentalStatement } from '../../services/rentalEngineService';
import { shortDate, shortDateTime } from './rentalFormat';

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.line}>
      <Text style={[Typography.caption, { color: Colors.textSecondary, fontSize: 12, flex: 1 }]}>{label}</Text>
      <Text style={[Typography.caption, { color: color ?? Colors.textPrimary, fontSize: 12, fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

const partName = (st: RentalStatement, i: RentalStatement['installments'][number]): string =>
  i.dueDay <= 0 ? 'Start payment' : st.plan === 'Weekly' ? `Week ${i.cycle} rent` : `Month ${i.cycle} · part ${i.part}`;

export function MoneyRow({ st, expanded, onToggle }: { st: RentalStatement; expanded: boolean; onToggle: () => void }) {
  const clear = st.totalDueNowPaise === 0;
  const color = st.recoveryRequired ? Colors.statusError : clear ? Colors.statusActive : Colors.statusWarning;
  let shownUpcoming = false;
  const parts = st.installments.filter((i) => {
    if (i.status !== 'upcoming' && i.status !== 'on_hold') return true;
    if (shownUpcoming) return false;
    shownUpcoming = true;
    return true;
  });

  return (
    <>
      <Pressable
        style={styles.row}
        onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.create(140, 'easeOut', 'opacity')); onToggle(); }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`To pay now ${rupees(st.totalDueNowPaise)}. ${expanded ? 'Hide' : 'Show'} details`}
      >
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[Typography.badgeText, { color: Colors.textSecondary, marginLeft: 6, flex: 1 }]}>TO PAY NOW</Text>
        <Text style={[Typography.buttonPrimary, { color }]}>{rupees(st.totalDueNowPaise)}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={Colors.textMuted} style={{ marginLeft: 6 }} />
      </Pressable>
      {expanded && (
        <View style={styles.detail}>
          <Line label="1 · Fines owed" value={rupees(st.unpaidFinesPaise)} color={st.unpaidFinesPaise ? Colors.statusError : undefined} />
          <Line label="2 · Security top-up" value={rupees(st.securityTopUpPaise)} color={st.securityTopUpPaise ? Colors.textWarning : undefined} />
          <Line label="3 · Rent due" value={rupees(st.rentDuePaise)} />
          <View style={styles.div} />
          <Line label="Security held" value={`${rupees(st.securityBalancePaise)} / ₹1,000`} />
          <Text style={styles.subHead}>RENT</Text>
          {parts.map((i) => (
            <Line
              key={i.id}
              label={`${partName(st, i)}${i.dueDay > 0 && i.dueDate ? ` · ${shortDate(i.dueDate)}` : ''}`}
              value={i.status === 'paid' ? 'Paid' : `${rupees(i.amountPaise - i.paidPaise)} · ${i.status.replace('_', ' ')}`}
              color={i.status === 'paid' ? Colors.textSuccess : i.status === 'overdue' ? Colors.statusError : undefined}
            />
          ))}
          {st.fines.length > 0 && (
            <>
              <Text style={styles.subHead}>FINES · ₹300 EACH</Text>
              {st.fines.map((f) => (
                <Line
                  key={f.id}
                  label={`${shortDate(f.date)} · 10 AM`}
                  value={f.waived ? 'Waived by Admin' : f.unpaidPaise ? `${rupees(f.unpaidPaise)} owed` : 'From security'}
                  color={f.waived ? Colors.textMuted : Colors.statusError}
                />
              ))}
            </>
          )}
          {st.nextFineAt && (
            <Text style={[Typography.caption, { color: Colors.textError, marginTop: 6 }]}>
              Next fine {shortDateTime(st.nextFineAt)}. Paid by 10:10 AM = no fine.
            </Text>
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#F0F2F7' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  detail: { marginHorizontal: Spacing.md, marginBottom: 12, backgroundColor: Colors.bgApp, borderRadius: 10, padding: Spacing.sm, borderWidth: 1, borderColor: '#F0F2F7' },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 8 },
  div: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 4 },
  subHead: { ...Typography.badgeText, fontSize: 10, color: Colors.textMuted, letterSpacing: 1.2, marginTop: 8, marginBottom: 2 },
});
