// ─────────────────────────────────────────────────────────────────────────────
// Rental Desk — Captain screen for the rental engine (12 Oct 2026 rules)
// v1.9 look: KPI tiles, segment bar, RentalCard-style cards, one big button each.
//   To do   : one list, most urgent first — recover, inspect, approve, collect, resume
//   Riders  : every live rental with an expandable TO PAY NOW breakdown
//   Cash    : Supervisor / Admin "Collected" check (D-025)
// "Receive" (top right) takes back a scooter brought to this ZAP Point (D-017).
// Existing Rentals / Payments screens are unchanged.
// ─────────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { ChecklistModal } from '../../src/components/modals/ChecklistModal';
import { AssetPickerModal } from '../../src/components/rental/AssetPickerModal';
import { DeskButton, DeskCard, DeskPill } from '../../src/components/rental/DeskCard';
import { MoneyRow } from '../../src/components/rental/MoneyRow';
import { ReceiveReturnModal } from '../../src/components/rental/ReceiveReturnModal';
import { RecordCashModal } from '../../src/components/rental/RecordCashModal';
import { shortDateTime } from '../../src/components/rental/rentalFormat';
import { ErrorBanner, KPICard, SkeletonCard } from '../../src/components/ui';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { useBookings } from '../../src/hooks/useQueries';
import {
  rentalErrorText,
  useMyStaffPermissions,
  usePendingPauseInspections,
  useRecoveryTasks,
  useRentalAction,
  useReturnsAwaitingApproval,
  useStoreQuotes,
  useUnverifiedCash,
} from '../../src/hooks/useRentalEngine';
import type { BookingWithDetails } from '../../src/lib/database.types';
import { rentalEngine, rupees, type RentalStatement } from '../../src/services/rentalEngineService';
import { useAuthStore } from '../../src/stores/authStore';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';

type Segment = 'todo' | 'riders' | 'cash';

type TodoItem =
  | { kind: 'recover'; key: string; booking: BookingWithDetails | undefined; bookingId: string; taskId: string; started: boolean; since: string; st: RentalStatement | null }
  | { kind: 'inspect'; key: string; booking: BookingWithDetails | undefined; bookingId: string; pauseId: string; since: string }
  | { kind: 'approve'; key: string; booking: BookingWithDetails | undefined; bookingId: string; handoffId: string; at: string; where: string }
  | { kind: 'collect'; key: string; booking: BookingWithDetails; bookingId: string; st: RentalStatement }
  | { kind: 'resume'; key: string; booking: BookingWithDetails; bookingId: string; st: RentalStatement };

interface ChecklistJob { booking: BookingWithDetails; type: 'pause' | 'return'; after: () => void }

const sameDay = (iso: string): boolean => new Date(iso).toDateString() === new Date().toDateString();
const when = (iso: string): string =>
  sameDay(iso) ? `today ${new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : shortDateTime(iso);

function collectReason(st: RentalStatement): string {
  if (st.unpaidFinesPaise > 0 || st.securityTopUpPaise > 0) return 'Fines taken from security';
  const open = st.installments.find((i) => i.status !== 'paid' && i.dueDay > 0 && i.status !== 'upcoming');
  if (!open) return 'Payment due';
  const name = st.plan === 'Weekly' ? `Week ${open.cycle} rent` : `Month ${open.cycle} · part ${open.part}`;
  const state = open.status === 'due' ? 'due today' : open.status === 'grace' ? 'in grace' : 'due';
  return `${name} ${state}${open.triggerAt ? ` · fine ${when(open.triggerAt)}` : ''}`;
}

export default function RentalDeskScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const { profile } = useAuthStore();
  const storeId = selectedStore?.store_id ?? null;
  const [segment, setSegment] = useState<Segment>('todo');
  const [expanded, setExpanded] = useState<string | null>(null);

  const bookingsQ = useBookings(storeId);
  const quotesQ = useStoreQuotes(storeId);
  const inspectionsQ = usePendingPauseInspections(storeId);
  const recoveriesQ = useRecoveryTasks(storeId);
  const returnsQ = useReturnsAwaitingApproval(storeId);
  const permsQ = useMyStaffPermissions(profile?.id ?? null);
  const canVerifyCash = profile?.role === 'ADMIN' || (permsQ.data ?? []).includes('VERIFY_CASH');
  const cashQ = useUnverifiedCash(canVerifyCash);
  const action = useRentalAction(storeId);

  const [cashFor, setCashFor] = useState<{ bookingId: string; name: string; suggested: number } | null>(null);
  const [resumeFor, setResumeFor] = useState<{ bookingId: string; name: string } | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistJob | null>(null);

  const bookings = (bookingsQ.data ?? []) as BookingWithDetails[];
  const byId = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);
  const live = useMemo(() => bookings.filter((b) => b.status === 'Active' || b.status === 'Paused'), [bookings]);
  const quotes = quotesQ.data;

  const todo = useMemo<TodoItem[]>(() => {
    const items: TodoItem[] = [];
    const recovering = new Set<string>();
    for (const r of recoveriesQ.data ?? []) {
      recovering.add(r.booking_id);
      items.push({ kind: 'recover', key: `r-${r.id}`, booking: byId.get(r.booking_id), bookingId: r.booking_id, taskId: r.id, started: r.status === 'IN_PROGRESS', since: r.triggered_at, st: quotes?.get(r.booking_id)?.statement ?? null });
    }
    for (const p of inspectionsQ.data ?? []) {
      items.push({ kind: 'inspect', key: `i-${p.id}`, booking: byId.get(p.booking_id), bookingId: p.booking_id, pauseId: p.id, since: p.started_at });
    }
    for (const h of returnsQ.data ?? []) {
      items.push({ kind: 'approve', key: `a-${h.id}`, booking: byId.get(h.booking_id), bookingId: h.booking_id, handoffId: h.id, at: h.received_at, where: h.receiving_store?.name ?? 'another store' });
    }
    for (const b of live) {
      const q = quotes?.get(b.id);
      if (!q?.enrolled || !q.statement || recovering.has(b.id)) continue;
      const st = q.statement;
      if (st.isPaused) {
        if (q.openPause?.inspected && st.unpaidFinesPaise === 0 && st.securityTopUpPaise === 0) items.push({ kind: 'resume', key: `m-${b.id}`, booking: b, bookingId: b.id, st });
      } else if (st.totalDueNowPaise > 0) {
        items.push({ kind: 'collect', key: `c-${b.id}`, booking: b, bookingId: b.id, st });
      }
    }
    return items;
  }, [recoveriesQ.data, inspectionsQ.data, returnsQ.data, live, quotes, byId]);

  const toCollect = useMemo(() => {
    let sum = 0;
    quotes?.forEach((q) => { if (q.statement) sum += q.statement.totalDueNowPaise; });
    return sum;
  }, [quotes]);
  const recoverCount = recoveriesQ.data?.length ?? 0;

  const errorText = rentalErrorText(action.error);
  const confirm = (title: string, message: string, yes: string, onYes: () => void) =>
    Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: yes, onPress: onYes }]);
  const nameOf = (b: BookingWithDetails | undefined, id: string) => b?.customer?.name ?? `Rental ${id.slice(0, 8)}`;

  const refreshing = bookingsQ.isRefetching || quotesQ.isRefetching || inspectionsQ.isRefetching || recoveriesQ.isRefetching || returnsQ.isRefetching;
  const refreshAll = () => {
    void bookingsQ.refetch(); void quotesQ.refetch(); void inspectionsQ.refetch(); void recoveriesQ.refetch(); void returnsQ.refetch();
    if (canVerifyCash) void cashQ.refetch();
  };
  const loadError = quotesQ.error ?? inspectionsQ.error ?? recoveriesQ.error ?? returnsQ.error;

  // ── Actions ───────────────────────────────────────────────────────────────
  const openCash = (b: BookingWithDetails, st: RentalStatement | null) => {
    action.clearError();
    setCashFor({ bookingId: b.id, name: b.customer?.name ?? 'Rider', suggested: st?.totalDueNowPaise ?? 0 });
  };
  const inspect = (item: Extract<TodoItem, { kind: 'inspect' }>) => {
    const finish = () => { void action.run(item.key, () => rentalEngine.finishPauseInspection(item.bookingId, item.pauseId)); };
    if (item.booking) setChecklist({ booking: item.booking, type: 'pause', after: finish });
    else confirm('Finish inspection?', 'Scooter and battery are here and checked.', 'Done', finish);
  };
  const backAtStore = (item: Extract<TodoItem, { kind: 'recover' }>) => {
    const finish = () => { void action.run(item.key, () => rentalEngine.completeRecovery(item.bookingId, item.taskId)); };
    if (item.booking) setChecklist({ booking: item.booking, type: 'return', after: finish });
    else confirm('Scooter back at store?', 'This closes the rental and stops fines.', 'Close rental', finish);
  };

  // ── Cards ─────────────────────────────────────────────────────────────────
  const renderTodo = ({ item }: { item: TodoItem }) => {
    const b = item.booking;
    const common = { name: nameOf(b, item.bookingId), plate: b?.vehicle?.plate_number ?? null, battery: b?.battery?.serial_number ?? null, plan: b?.rental_plan ?? null };
    const busy = action.busy === item.key;
    switch (item.kind) {
      case 'recover':
        return (
          <DeskCard {...common} tone="red" reasonTone="red"
            reason={`Overdue since ${when(item.since)}${item.st ? ` · owes ${rupees(item.st.totalDueNowPaise)}` : ''}`}
            pills={<DeskPill label="RECOVER" kind="red" />}
            actions={<>
              {!item.started && <DeskButton label="Start trip" kind="ghost" loading={action.busy === `${item.key}-start`}
                onPress={() => { void action.run(`${item.key}-start`, () => rentalEngine.startRecovery(item.bookingId, item.taskId)); }} />}
              <DeskButton label="Back at store" kind="green" loading={busy} onPress={() => backAtStore(item)} />
            </>}
          />
        );
      case 'inspect':
        return (
          <DeskCard {...common} tone="amber" reasonTone="amber" reason={`Paused ${when(item.since)} · rent stopped`}
            pills={<DeskPill label="INSPECT" kind="amber" />}
            actions={<DeskButton big label="Inspect scooter" kind="teal" icon="clipboard-outline" loading={busy} onPress={() => inspect(item)} />}
          />
        );
      case 'approve':
        return (
          <DeskCard {...common} tone="blue" reason={`Returned at ${item.where} · ${when(item.at)}`}
            pills={<DeskPill label="APPROVE" kind="blue" />}
            actions={<>
              <DeskButton label="Reject" kind="ghost" loading={action.busy === `${item.key}-no`}
                onPress={() => confirm('Reject this return?', 'The rental stays open.', 'Reject', () => { void action.run(`${item.key}-no`, () => rentalEngine.approveReturn(item.bookingId, item.handoffId, false)); })} />
              <DeskButton label="Approve" kind="green" loading={busy}
                onPress={() => confirm('Approve return?', `Closes the rental. The scooter now belongs to ${item.where}.`, 'Approve', () => { void action.run(item.key, () => rentalEngine.approveReturn(item.bookingId, item.handoffId, true)); })} />
            </>}
          />
        );
      case 'collect':
        return (
          <DeskCard {...common} reason={collectReason(item.st)} reasonTone={item.st.installments.some((i) => i.status === 'grace') ? 'amber' : 'normal'}
            pills={<DeskPill label={rupees(item.st.totalDueNowPaise)} kind="notclear" />}
            actions={<DeskButton big label={`Collect ${rupees(item.st.totalDueNowPaise)}`} kind="orange" onPress={() => openCash(item.booking, item.st)} />}
          />
        );
      case 'resume':
        return (
          <DeskCard {...common} plate={null} battery={null} reason={`Paused · ${item.st.rentalDaysUsed} days used · dues clear`}
            pills={<DeskPill label="PAUSED" kind="amber" />}
            actions={<DeskButton big label="Resume with new scooter" kind="outline"
              onPress={() => { action.clearError(); setResumeFor({ bookingId: item.bookingId, name: item.booking.customer?.name ?? 'Rider' }); }} />}
          />
        );
    }
  };

  const renderRider = ({ item: b }: { item: BookingWithDetails }) => {
    const q = quotes?.get(b.id);
    const status = <DeskPill label={b.status.toUpperCase()} kind={b.status === 'Paused' ? 'amber' : 'green'} />;
    const phone = <><Ionicons name="call-outline" size={10} color={Colors.textMuted} /> {b.customer?.phone ?? ''}</>;
    const paused = b.status === 'Paused';
    const plate = paused && q?.openPause?.inspected ? null : b.vehicle?.plate_number ?? null;
    if (!q?.enrolled || !q.statement) {
      return (
        <DeskCard name={b.customer?.name ?? 'Rider'} reason={phone} reasonTone="muted" plate={plate} battery={b.battery?.serial_number ?? null} plan={b.rental_plan}
          pills={<>{status}<DeskPill label="OLD SYSTEM" kind="slate" /></>}>
          <Text style={[Typography.caption, styles.oldNote]}>{quotes ? 'Still on the old payment system. Ask Admin to add this rider.' : 'Loading dues…'}</Text>
        </DeskCard>
      );
    }
    const st = q.statement;
    const clear = st.totalDueNowPaise === 0;
    const canResume = paused && !!q.openPause?.inspected && st.unpaidFinesPaise === 0 && st.securityTopUpPaise === 0;
    return (
      <DeskCard name={b.customer?.name ?? 'Rider'} reason={phone} reasonTone="muted" tone={st.recoveryRequired ? 'red' : 'none'}
        plate={plate} battery={paused && q.openPause?.inspected ? null : b.battery?.serial_number ?? null} plan={b.rental_plan}
        pills={<>{status}<DeskPill label={clear ? 'CLEAR' : 'NOT CLEAR'} kind={clear ? 'clear' : 'notclear'} /></>}
        actions={<>
          <DeskButton label={clear ? 'Record cash' : `Collect ${rupees(st.totalDueNowPaise)}`} kind={clear ? 'ghost' : 'orange'} onPress={() => openCash(b, st)} />
          {paused && <DeskButton label="Resume" kind="outline" disabled={!canResume}
            onPress={() => { action.clearError(); setResumeFor({ bookingId: b.id, name: b.customer?.name ?? 'Rider' }); }} />}
        </>}
      >
        <MoneyRow st={st} expanded={expanded === b.id} onToggle={() => setExpanded((e) => (e === b.id ? null : b.id))} />
      </DeskCard>
    );
  };

  const segments: { key: Segment; label: string; count: number; urgent?: boolean }[] = [
    { key: 'todo', label: 'To do', count: todo.length, urgent: recoverCount > 0 },
    { key: 'riders', label: 'Riders', count: live.length },
    ...(canVerifyCash ? [{ key: 'cash' as const, label: 'Cash', count: cashQ.data?.length ?? 0 }] : []),
  ];

  const header = (
    <View style={{ gap: 12, marginBottom: 12 }}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[Typography.overline, { color: Colors.textSecondary }]}>DUES · PAUSES · RETURNS</Text>
          <Text style={[Typography.h1Screen, { color: Colors.textPrimary, marginTop: 2 }]}>Rental Desk</Text>
        </View>
        <DeskButton label="Receive" kind="outline" icon="return-down-back-outline" style={{ flex: 0, minHeight: 40, paddingHorizontal: 14 }}
          onPress={() => { action.clearError(); setReceiveOpen(true); }} />
      </View>
      <View style={styles.kpiRow}>
        <KPICard label="TO COLLECT" value={rupees(toCollect)} valueColor={toCollect ? Colors.textWarning : Colors.textPrimary} icon="cash-outline" />
        <KPICard label="RECOVER NOW" value={recoverCount} valueColor={recoverCount ? Colors.statusError : Colors.textPrimary}
          backgroundColor={recoverCount ? Colors.surfaceRed : Colors.surfaceCard} icon="alert-circle-outline" />
      </View>
      <View style={styles.segBar} accessibilityRole="tablist">
        {segments.map((s) => {
          const on = segment === s.key;
          return (
            <Pressable key={s.key} onPress={() => setSegment(s.key)} style={[styles.seg, on && styles.segOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Text style={[Typography.buttonSecondary, { color: on ? Colors.brandNavy : Colors.textSecondary, fontWeight: on ? '900' : '700' }]}>{s.label}</Text>
              {s.count > 0 && (
                <View style={[styles.cnt, s.urgent && styles.cntRed]}>
                  <Text style={[Typography.badgeText, { fontSize: 10, color: s.urgent ? '#FFFFFF' : Colors.textPrimary }]}>{s.count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      {loadError && <ErrorBanner message={rentalErrorText(loadError instanceof Error ? loadError : null) ?? 'Could not load the Rental Desk'} onRetry={refreshAll} />}
      {errorText && !cashFor && !resumeFor && !receiveOpen && <ErrorBanner message={errorText} onDismiss={action.clearError} />}
    </View>
  );

  const loading = bookingsQ.isLoading || quotesQ.isLoading;
  const empty = (title: string, sub: string) => (
    <View style={styles.empty}>
      <Ionicons name="checkmark-done-circle-outline" size={28} color={Colors.statusActive} />
      <Text style={[Typography.bodyPrimary, { color: Colors.textSuccess, fontWeight: '800', marginTop: 6 }]}>{title}</Text>
      <Text style={[Typography.caption, { color: Colors.textMuted, marginTop: 2 }]}>{sub}</Text>
    </View>
  );
  const listProps = {
    contentContainerStyle: styles.list,
    ListHeaderComponent: header,
    refreshControl: <RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={Colors.brandTeal} />,
    keyboardShouldPersistTaps: 'handled' as const,
  };

  return (
    <SafeAreaView style={styles.safe}>
      {segment === 'todo' && (
        <FlatList data={todo} keyExtractor={(i) => i.key} renderItem={renderTodo} {...listProps}
          ListEmptyComponent={loading ? <SkeletonCard height={150} /> : empty('All done', 'Nothing waiting at your ZAP Point.')} />
      )}
      {segment === 'riders' && (
        <FlatList data={live} keyExtractor={(b) => b.id} renderItem={renderRider} extraData={`${expanded}-${quotesQ.dataUpdatedAt}`} {...listProps}
          ListEmptyComponent={loading ? <SkeletonCard height={150} /> : empty('No riders', 'No active or paused rentals.')} />
      )}
      {segment === 'cash' && (
        <FlatList data={cashQ.data ?? []} keyExtractor={(c) => c.id} {...listProps}
          ListEmptyComponent={cashQ.isLoading ? <SkeletonCard height={120} /> : empty('All cash collected', 'Nothing waiting for you.')}
          renderItem={({ item }) => {
            const b = byId.get(item.booking_id);
            return (
              <DeskCard name={nameOf(b, item.booking_id)} reason={`${item.store?.name ?? 'Store'} · ${when(item.occurred_at)}`}
                plate={b?.vehicle?.plate_number ?? null} battery={null} plan={b?.rental_plan ?? null}
                pills={<DeskPill label={rupees(item.amount_paise)} kind="amber" />}
                actions={<DeskButton big label={`Collected ${rupees(item.amount_paise)}`} kind="green" icon="checkmark-done" loading={action.busy === `cash-${item.id}`}
                  onPress={() => { void action.run(`cash-${item.id}`, () => rentalEngine.verifyCash(item.booking_id, item.id)); }} />}
              />
            );
          }}
        />
      )}

      <RecordCashModal
        visible={!!cashFor}
        riderName={cashFor?.name ?? ''}
        suggestedPaise={cashFor?.suggested ?? 0}
        busy={action.busy === 'cash'}
        errorText={cashFor ? errorText : null}
        onCancel={() => setCashFor(null)}
        onConfirm={async (amountPaise, key) => {
          if (!cashFor) return;
          const ok = await action.run('cash', () => rentalEngine.recordCash(cashFor.bookingId, amountPaise, key));
          if (ok) setCashFor(null);
        }}
      />
      <AssetPickerModal
        visible={!!resumeFor}
        storeId={storeId}
        riderName={resumeFor?.name ?? ''}
        busy={action.busy === 'resume'}
        errorText={resumeFor ? errorText : null}
        onCancel={() => setResumeFor(null)}
        onConfirm={async (vehicleId, batteryId) => {
          if (!resumeFor) return;
          const ok = await action.run('resume', () => rentalEngine.resume(resumeFor.bookingId, vehicleId, batteryId));
          if (ok) setResumeFor(null);
        }}
      />
      <ReceiveReturnModal
        visible={receiveOpen}
        busy={action.busy === 'receive'}
        errorText={receiveOpen ? errorText : null}
        onCancel={() => setReceiveOpen(false)}
        onConfirm={async (bookingId, key) => {
          const res = await action.run('receive', () => rentalEngine.receiveReturn(bookingId, key));
          if (res) {
            setReceiveOpen(false);
            Alert.alert('Return received', res.needsApprovalFromBookingStore ? 'Sent to the booking-store Captain for approval.' : 'Rental closed. Scooter and battery are free again.');
          }
        }}
      />
      <ChecklistModal
        visible={!!checklist}
        booking={checklist?.booking ?? null}
        checklistType={checklist?.type ?? 'pause'}
        onClose={() => setChecklist(null)}
        onComplete={() => { const job = checklist; setChecklist(null); job?.after(); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgApp },
  list: { padding: Spacing.md, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  kpiRow: { flexDirection: 'row', gap: 10 },
  segBar: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: Radius.card, backgroundColor: Colors.surfaceCard, borderWidth: 1, borderColor: Colors.borderLight },
  seg: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderRadius: 9 },
  segOn: { backgroundColor: Colors.brandTeal },
  cnt: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.borderLight },
  cntRed: { backgroundColor: Colors.statusError },
  empty: { alignItems: 'center', paddingVertical: 36 },
  oldNote: { color: Colors.textMuted, paddingHorizontal: Spacing.md, paddingBottom: 12 },
});
