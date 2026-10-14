// ─────────────────────────────────────────────────────────────────────────────
// RentalDuesSheet — what a rider owes right now, from the shared rental engine.
// Shows: amount to pay now, fines / security top-up / rent split (D-028),
// installment timeline with grace and fine times (D-004, D-011, D-012, D-020),
// and Captain actions: record cash, resume a paused rental with a new scooter.
// ─────────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/design';
import { rentalErrorText, useRentalQuote } from '../../hooks/useRentalEngine';
import { rupees, type RentalStatement } from '../../services/rentalEngineService';
import { ErrorBanner, SkeletonCard, YanaButton } from '../ui';
import { INSTALLMENT_CHIP, installmentLabel, shortDate, shortDateTime, visibleInstallments } from './rentalFormat';

interface RentalDuesSheetProps {
  visible: boolean;
  bookingId: string | null;
  riderName: string;
  plate: string | null;
  bookingStatus: string;
  onClose: () => void;
  onRecordCash: (bookingId: string, suggestedPaise: number) => void;
  onResume: (bookingId: string) => void;
}

function MoneyRow({ label, paise, tone }: { label: string; paise: number; tone?: 'error' | 'warning' | 'success' }) {
  const color = tone === 'error' ? Colors.textError : tone === 'warning' ? Colors.textWarning : tone === 'success' ? Colors.textSuccess : Colors.textPrimary;
  return (
    <View style={styles.moneyRow}>
      <Text style={[Typography.bodyPrimary, { color: Colors.textSecondary }]}>{label}</Text>
      <Text style={[Typography.bodyPrimary, { color, fontWeight: '800' }]}>{rupees(paise)}</Text>
    </View>
  );
}

function Headline({ st }: { st: RentalStatement }) {
  const state = st.recoveryRequired
    ? { text: 'OVERDUE · RECOVERY', bg: Colors.surfaceRed, fg: Colors.textError, icon: 'alert-circle' as const }
    : st.isPaused
      ? { text: 'PAUSED', bg: Colors.surfaceAmber, fg: Colors.textWarning, icon: 'pause-circle' as const }
      : st.totalDueNowPaise === 0
        ? { text: 'ALL CLEAR', bg: Colors.surfaceGreen, fg: Colors.textSuccess, icon: 'checkmark-circle' as const }
        : { text: 'PAYMENT DUE', bg: Colors.surfaceBlue, fg: Colors.blueText, icon: 'time' as const };
  return (
    <View style={styles.headline}>
      <View style={[styles.stateChip, { backgroundColor: state.bg }]}>
        <Ionicons name={state.icon} size={12} color={state.fg} />
        <Text style={[Typography.badgeText, { color: state.fg, marginLeft: 4 }]}>{state.text}</Text>
      </View>
      <Text style={[Typography.overline, { color: Colors.textMuted, marginTop: Spacing.sm }]}>TO PAY NOW</Text>
      <Text style={[Typography.h2Metric, { color: st.totalDueNowPaise > 0 ? Colors.textPrimary : Colors.textSuccess }]}>
        {rupees(st.totalDueNowPaise)}
      </Text>
      <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>
        {st.currentRentalDay !== null ? `Day ${st.currentRentalDay} of rental · ${st.plan}` : `${st.rentalDaysUsed} days used · ${st.plan}`}
      </Text>
      {st.nextFineAt && (
        <Text style={[Typography.bodySecondary, { color: Colors.textError, marginTop: 4 }]}>
          Next ₹300 fine at {shortDateTime(st.nextFineAt)} (paid by 10:10 AM = no fine)
        </Text>
      )}
    </View>
  );
}

export function RentalDuesSheet({
  visible, bookingId, riderName, plate, bookingStatus, onClose, onRecordCash, onResume,
}: RentalDuesSheetProps) {
  const { data, isLoading, error, refetch } = useRentalQuote(visible ? bookingId : null);
  const st = data?.statement;
  const notEnrolled = data && !data.enrolled;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[Typography.overline, { color: Colors.textMuted }]}>DUES & FINES</Text>
              <Text style={[Typography.h1Screen, { color: Colors.textPrimary }]} numberOfLines={1}>{riderName}</Text>
              {plate && <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>{plate} · {bookingStatus}</Text>}
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close" style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {isLoading && (
              <View style={{ gap: 10 }}>
                <SkeletonCard height={120} />
                <SkeletonCard height={160} />
              </View>
            )}
            {error && <ErrorBanner message={rentalErrorText(error) ?? 'Could not load dues'} onRetry={refetch} />}

            {notEnrolled && (
              <View style={[styles.card, styles.infoCard]}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.blueText} />
                <Text style={[Typography.bodyPrimary, { color: Colors.textSecondary, flex: 1, marginLeft: 8 }]}>
                  This rental is still on the old payment system. Ask Admin to add it to the new rental system — then
                  dues, fines and pause will show here.
                </Text>
              </View>
            )}

            {st && !notEnrolled && (
              <>
                <View style={styles.card}>
                  <Headline st={st} />
                </View>

                <View style={styles.card}>
                  <Text style={[Typography.labelCaps, styles.cardTitle]}>WHAT A PAYMENT CLEARS FIRST</Text>
                  <MoneyRow label="1 · Fines owed" paise={st.unpaidFinesPaise} tone={st.unpaidFinesPaise > 0 ? 'error' : undefined} />
                  <MoneyRow label="2 · Security top-up" paise={st.securityTopUpPaise} tone={st.securityTopUpPaise > 0 ? 'warning' : undefined} />
                  <MoneyRow label="3 · Rent due" paise={st.rentDuePaise} />
                  {st.creditPaise > 0 && <MoneyRow label="Extra paid (credit)" paise={st.creditPaise} tone="success" />}
                  <View style={styles.divider} />
                  <MoneyRow label="Security held" paise={st.securityBalancePaise} />
                  <Text style={[Typography.caption, { color: Colors.textMuted }]}>Target ₹1,000 — fines are taken from security first.</Text>
                </View>

                <View style={styles.card}>
                  <Text style={[Typography.labelCaps, styles.cardTitle]}>RENT TIMELINE</Text>
                  {visibleInstallments(st).map((i) => {
                    const chip = INSTALLMENT_CHIP[i.status];
                    return (
                      <View key={i.id} style={styles.instRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[Typography.bodyPrimary, { color: Colors.textPrimary }]}>{installmentLabel(st.plan, i)}</Text>
                          <Text style={[Typography.caption, { color: Colors.textMuted }]}>
                            {i.dueDay > 0 ? `Due Day ${i.dueDay} (${shortDate(i.dueDate)})` : 'Due before dispatch'}
                            {i.triggerAt && i.status !== 'paid' ? ` · fine from ${shortDateTime(i.triggerAt)}` : ''}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[Typography.bodyPrimary, { color: Colors.textPrimary, fontWeight: '800' }]}>
                            {rupees(i.amountPaise - i.paidPaise > 0 ? i.amountPaise - i.paidPaise : i.amountPaise)}
                          </Text>
                          <View style={[styles.chip, { backgroundColor: chip.bg }]}>
                            <Text style={[Typography.badgeText, { color: chip.text, fontSize: 9 }]}>{chip.label}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {st.fines.length > 0 && (
                  <View style={styles.card}>
                    <Text style={[Typography.labelCaps, styles.cardTitle]}>LATE FINES ({st.fines.length})</Text>
                    {st.fines.map((f) => (
                      <View key={f.id} style={styles.instRow}>
                        <Text style={[Typography.bodyPrimary, { color: f.waived ? Colors.textMuted : Colors.textPrimary, flex: 1 }]}>
                          {shortDate(f.date)} · 10 AM
                        </Text>
                        <Text style={[Typography.bodySecondary, { color: f.waived ? Colors.textMuted : Colors.textError }]}>
                          {f.waived ? 'Waived by Admin' : f.unpaidPaise > 0 ? `${rupees(f.unpaidPaise)} owed` : `${rupees(f.fromSecurityPaise)} from security`}
                        </Text>
                      </View>
                    ))}
                    <Text style={[Typography.caption, { color: Colors.textMuted, marginTop: 4 }]}>Only Admin can waive a fine.</Text>
                  </View>
                )}

                <View style={styles.actions}>
                  <YanaButton
                    label="Record cash"
                    icon="cash-outline"
                    onPress={() => bookingId && onRecordCash(bookingId, st.totalDueNowPaise)}
                    style={{ flex: 1 }}
                  />
                  {st.isPaused && (
                    <YanaButton
                      label="Resume"
                      icon="play-outline"
                      variant="secondary"
                      disabled={st.unpaidFinesPaise > 0 || st.securityTopUpPaise > 0}
                      onPress={() => bookingId && onResume(bookingId)}
                      style={{ flex: 1 }}
                    />
                  )}
                </View>
                {st.isPaused && (st.unpaidFinesPaise > 0 || st.securityTopUpPaise > 0) && (
                  <Text style={[Typography.caption, { color: Colors.textWarning, textAlign: 'center' }]}>
                    Clear fines and security top-up before resuming.
                  </Text>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bgApp, borderTopLeftRadius: Radius.modal, borderTopRightRadius: Radius.modal,
    maxHeight: '92%', paddingBottom: Spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, backgroundColor: Colors.surfaceCard,
    borderTopLeftRadius: Radius.modal, borderTopRightRadius: Radius.modal, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { padding: Spacing.md, gap: 12 },
  card: {
    backgroundColor: Colors.surfaceCard, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.borderInput,
    padding: Spacing.md,
  },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.surfaceBlue },
  cardTitle: { color: Colors.textPrimary, marginBottom: Spacing.sm },
  headline: { alignItems: 'flex-start' },
  stateChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.badge },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 6 },
  instRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, gap: 8,
  },
  chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.badge, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10 },
});
