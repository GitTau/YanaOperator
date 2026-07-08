// ─────────────────────────────────────────────────────────────────────────────
// EOD Report Screen — End-of-Day summary for ZAP Point operators
//
// Access: tap "Operator" button (top-right of header)
//   Before 10 PM IST: live snapshot, read-only
//   After  10 PM IST: final report + Share/Download button
//
// Content:
//   1. 9 KPI cards (3x3 grid)
//   2. Active rentals list - name, vehicle, dates, days left, amounts, pending
//
// Data: all derived from useBookings + useVehicles + useMaintenanceJobs
//       No extra DB queries - zero added load.
//
// Business rules:
//   - All data scoped to store_id
//   - Aadhaar never displayed
//   - "Today" = IST date
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { SkeletonCard } from '../../src/components/ui';
import {
  useBookings,
  useVehicles,
  useIsEodTime,
  useMaintenanceJobs,
} from '../../src/hooks/useQueries';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import { calculatePaymentGate, parseLocalDate } from '../../src/services/bookingService';
import type { BookingWithDetails } from '../../src/lib/database.types';

// ── IST date helpers ──────────────────────────────────────────────────────────

function todayIst(): string {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameIstDay(utcIso: string | null | undefined): boolean {
  if (!utcIso) return false;
  const today = todayIst();
  const entryIst = new Date(new Date(utcIso).getTime() + 5.5 * 60 * 60 * 1000);
  const y = entryIst.getUTCFullYear();
  const mo = String(entryIst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(entryIst.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}` === today;
}

function daysRemaining(endDateStr: string | null | undefined): number | null {
  if (!endDateStr) return null;
  const end = parseLocalDate(endDateStr);
  if (!end) return null;
  const todayDate = parseLocalDate(todayIst());
  if (!todayDate) return null;
  return Math.ceil((end.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

function fmtCurrency(n: number): string {
  return 'Rs.' + n.toLocaleString('en-IN');
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiProps {
  label: string;
  value: string | number;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  bg: string;
}

function EodKpiCard({ label, value, icon, color, bg }: KpiProps) {
  return (
    <View style={[styles.kpiCard, { backgroundColor: bg }]}>
      <View style={[styles.kpiIconWrap, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function EodReportScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const storeId = selectedStore?.store_id ?? null;
  const isEodTime = useIsEodTime();

  const { data: bookings, isLoading: bLoading, refetch: refetchB } = useBookings(storeId);
  const { data: vehicles, isLoading: vLoading, refetch: refetchV } = useVehicles(storeId);
  const { data: maintJobs, isLoading: mLoading, refetch: refetchM } = useMaintenanceJobs(storeId);

  const isLoading = bLoading || vLoading || mLoading;

  const onRefresh = () => {
    void refetchB();
    void refetchV();
    void refetchM();
  };

  // ── Compute KPIs ─────────────────────────────────────────────────────────────
  const { kpis, activeRentals } = useMemo(() => {
    const bList = (bookings as BookingWithDetails[] | undefined) ?? [];
    const vList = (vehicles as { id: string; status: string }[] | undefined) ?? [];
    const mList = (maintJobs as { created_at: string; status: string }[] | undefined) ?? [];

    const totalActiveRentals = bList.filter(b => b.status === 'Active').length;

    const totalRevenueCollectedToday = bList
      .filter(b => isSameIstDay(b.started_at) || isSameIstDay(b.created_at))
      .reduce((s, b) => s + (b.amount_paid || 0), 0);

    // Renewals: started today but created on a prior day
    const totalRenewalsToday = bList.filter(b =>
      b.status === 'Active' &&
      isSameIstDay(b.started_at) &&
      !isSameIstDay(b.created_at),
    ).length;

    const totalNewBookingsToday = bList.filter(b => isSameIstDay(b.created_at)).length;

    const totalCashReceivedToday = bList
      .filter(b => isSameIstDay(b.started_at) || isSameIstDay(b.created_at))
      .reduce((s, b) => s + (b.amount_paid_cash || 0), 0);

    const totalRidersOnPause = bList.filter(b => b.status === 'Paused').length;

    const totalIdleScooters = vList.filter(v => v.status === 'Available').length;

    const totalUnderMaintenanceToday = mList.filter(m => isSameIstDay(m.created_at)).length;

    const totalReturnsToday = bList.filter(b =>
      b.status === 'Completed' && isSameIstDay(b.completed_at),
    ).length;

    const kpisResult = {
      totalActiveRentals,
      totalRevenueCollectedToday,
      totalRenewalsToday,
      totalNewBookingsToday,
      totalCashReceivedToday,
      totalRidersOnPause,
      totalIdleScooters,
      totalUnderMaintenanceToday,
      totalReturnsToday,
    };

    // ── Active Rentals List ────────────────────────────────────────────────────
    const rentals = bList
      .filter(b => b.status === 'Active' || b.status === 'Paused')
      .map(b => {
        const gate = calculatePaymentGate(
          b.rental_plan,
          b.total_amount,
          b.deposit_amount,
          b.fines_amount,
          b.amount_paid,
          b.start_date,
          b.end_date,
          b.status,
        );
        const pendingAmount = Math.max(0, gate.gateAmount - (b.amount_paid || 0));
        return {
          bookingId: b.id,
          riderName: (b.customer as { name: string } | null)?.name ?? '-',
          vehicleNumber: (b.vehicle as { plate_number: string } | null)?.plate_number ?? '-',
          rentalPlan: b.rental_plan,
          startDate: b.start_date,
          endDate: b.end_date,
          daysRemaining: daysRemaining(b.end_date),
          totalRentCollected: b.amount_paid || 0,
          cashCollected: b.amount_paid_cash || 0,
          onlineCollected: b.amount_paid_online || 0,
          pendingAmount,
          pendingDueDate: gate.secondPartDueDateStr ?? null,
          status: b.status,
        };
      })
      .sort((a, b) => {
        if (a.pendingAmount > 0 && b.pendingAmount === 0) return -1;
        if (b.pendingAmount > 0 && a.pendingAmount === 0) return 1;
        return (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999);
      });

    return { kpis: kpisResult, activeRentals: rentals };
  }, [bookings, vehicles, maintJobs]);

  // ── Share ────────────────────────────────────────────────────────────────────
  const handleShare = async () => {
    if (!isEodTime) {
      Alert.alert('Not available yet', 'EOD report download is available after 10 PM.');
      return;
    }
    const today = todayIst();
    const lines: string[] = [
      `YanaOS EOD Report - ${selectedStore?.name ?? 'ZAP Point'}`,
      `Date: ${fmtDate(today)}`,
      '',
      '-- KPIs --',
      `Active Rentals:      ${kpis.totalActiveRentals}`,
      `Revenue Today:       ${fmtCurrency(kpis.totalRevenueCollectedToday)}`,
      `Cash Received:       ${fmtCurrency(kpis.totalCashReceivedToday)}`,
      `New Bookings:        ${kpis.totalNewBookingsToday}`,
      `Renewals:            ${kpis.totalRenewalsToday}`,
      `Returns:             ${kpis.totalReturnsToday}`,
      `On Pause:            ${kpis.totalRidersOnPause}`,
      `Idle Scooters:       ${kpis.totalIdleScooters}`,
      `Into Maintenance:    ${kpis.totalUnderMaintenanceToday}`,
      '',
      '-- Active Rentals --',
      ...activeRentals.map((r, i) =>
        `${i + 1}. ${r.riderName} | ${r.vehicleNumber} | ${r.rentalPlan} | ` +
        `Start: ${fmtDate(r.startDate)} | End: ${fmtDate(r.endDate)} | ` +
        `Days left: ${r.daysRemaining ?? '-'} | ` +
        `Collected: ${fmtCurrency(r.totalRentCollected)} (Cash: ${fmtCurrency(r.cashCollected)} / Online: ${fmtCurrency(r.onlineCollected)}) | ` +
        `Pending: ${r.pendingAmount > 0 ? fmtCurrency(r.pendingAmount) : 'NIL'}` +
        (r.pendingDueDate ? ` by ${fmtDate(r.pendingDueDate)}` : ''),
      ),
    ];
    try {
      await Share.share({ message: lines.join('\n'), title: `EOD Report ${today}` });
    } catch {
      Alert.alert('Share failed', 'Could not open the share sheet.');
    }
  };

  const now = new Date();
  const generatedAt = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const KPI_CONFIG: KpiProps[] = [
    { label: 'Active Rentals',    value: kpis.totalActiveRentals,                           icon: 'radio-button-on-outline',      color: Colors.brandTeal,       bg: Colors.surfaceTeal   },
    { label: 'Revenue Collected', value: fmtCurrency(kpis.totalRevenueCollectedToday),      icon: 'cash-outline',                 color: Colors.statusActive,    bg: Colors.surfaceGreen  },
    { label: 'New Bookings',      value: kpis.totalNewBookingsToday,                        icon: 'add-circle-outline',           color: Colors.statusInfo,      bg: Colors.surfaceBlue   },
    { label: 'Renewals Today',    value: kpis.totalRenewalsToday,                           icon: 'refresh-circle-outline',       color: '#7C3AED',              bg: '#F5F3FF'            },
    { label: 'Cash Received',     value: fmtCurrency(kpis.totalCashReceivedToday),          icon: 'wallet-outline',               color: Colors.statusWarning,   bg: Colors.surfaceAmber  },
    { label: 'Riders on Pause',   value: kpis.totalRidersOnPause,                           icon: 'pause-circle-outline',         color: '#D97706',              bg: '#FFFBEB'            },
    { label: 'Idle Scooters',     value: kpis.totalIdleScooters,                            icon: 'bicycle-outline',              color: Colors.textSecondary,   bg: Colors.bgApp         },
    { label: 'Into Maintenance',  value: kpis.totalUnderMaintenanceToday,                   icon: 'construct-outline',            color: Colors.statusError,     bg: Colors.surfaceRed    },
    { label: 'Returns Today',     value: kpis.totalReturnsToday,                            icon: 'checkmark-done-circle-outline',color: Colors.statusActive,    bg: Colors.surfaceGreen  },
  ];

  return (
    <SafeAreaView style={styles.safe}>

      {/* Header */}
      <View style={styles.screenHeader}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[Typography.overline, { color: Colors.textSecondary }]}>DAILY SUMMARY</Text>
          <Text style={[Typography.h1Screen, { color: Colors.textPrimary, marginTop: 1 }]}>EOD Report</Text>
        </View>

        <View style={[styles.statusPill, isEodTime ? styles.statusPillFinal : styles.statusPillLive]}>
          <View style={[styles.statusDot, { backgroundColor: isEodTime ? Colors.statusActive : Colors.brandTeal }]} />
          <Text style={[styles.statusPillText, { color: isEodTime ? Colors.statusActive : Colors.brandTeal }]}>
            {isEodTime ? 'FINAL' : 'LIVE'}
          </Text>
        </View>

        <Pressable
          onPress={() => { void handleShare(); }}
          style={({ pressed }) => [
            styles.shareBtn,
            isEodTime && styles.shareBtnActive,
            { opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons
            name="share-outline"
            size={14}
            color={isEodTime ? '#fff' : Colors.textMuted}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.shareBtnText, isEodTime && styles.shareBtnTextActive]}>
            {isEodTime ? 'Share' : 'After 10 PM'}
          </Text>
        </Pressable>
      </View>

      {/* Timestamp bar */}
      <View style={styles.timestampBar}>
        <Ionicons name="time-outline" size={11} color={Colors.textMuted} style={{ marginRight: 4 }} />
        <Text style={styles.timestampText}>
          {isEodTime
            ? `Final report generated at ${generatedAt}`
            : `Live snapshot - updates every 30s - as of ${generatedAt}`}
        </Text>
        <Text style={styles.storeNameText}>{selectedStore?.name}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={Colors.brandTeal} />
        }
      >
        {isLoading ? (
          <View style={{ gap: 10 }}>
            {[1, 2, 3, 4].map(k => <SkeletonCard key={k} height={90} />)}
          </View>
        ) : (
          <>
            {/* KPI Grid */}
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel}>KEY METRICS</Text>
            </View>
            <View style={styles.kpiGrid}>
              {KPI_CONFIG.map(k => (
                <EodKpiCard key={k.label} {...k} />
              ))}
            </View>

            {/* Active Rentals Table */}
            <View style={[styles.sectionLabelRow, { marginTop: Spacing.sm }]}>
              <Text style={styles.sectionLabel}>ACTIVE RENTALS ({activeRentals.length})</Text>
              {activeRentals.some(r => r.pendingAmount > 0) && (
                <View style={styles.pendingBadge}>
                  <Ionicons name="warning-outline" size={9} color={Colors.statusError} />
                  <Text style={styles.pendingBadgeText}>
                    {activeRentals.filter(r => r.pendingAmount > 0).length} with pending dues
                  </Text>
                </View>
              )}
            </View>

            {activeRentals.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="file-tray-outline" size={28} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No active rentals right now</Text>
              </View>
            ) : (
              <View style={styles.tableCard}>
                {activeRentals.map((rental, idx) => {
                  const dayColor =
                    rental.daysRemaining === null ? Colors.textMuted :
                    rental.daysRemaining <= 0    ? Colors.statusError :
                    rental.daysRemaining <= 2    ? Colors.statusWarning :
                    Colors.statusActive;

                  return (
                    <View
                      key={rental.bookingId}
                      style={[
                        styles.rentalRow,
                        idx < activeRentals.length - 1 && styles.rentalRowBorder,
                        rental.pendingAmount > 0 && styles.rentalRowPending,
                      ]}
                    >
                      <View style={[
                        styles.rowStripe,
                        {
                          backgroundColor:
                            rental.status === 'Paused'    ? Colors.statusWarning :
                            rental.pendingAmount > 0       ? Colors.statusError   :
                            Colors.statusActive,
                        },
                      ]} />

                      <View style={styles.rentalBody}>
                        {/* Row 1: Name + vehicle + plan + days */}
                        <View style={styles.rentalTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.riderName}>{rental.riderName}</Text>
                            <View style={styles.tagRow}>
                              <View style={styles.tag}>
                                <Ionicons name="bicycle-outline" size={9} color={Colors.textMuted} />
                                <Text style={styles.tagText}>{rental.vehicleNumber}</Text>
                              </View>
                              <View style={[styles.tag, styles.planTag]}>
                                <Text style={styles.tagText}>{rental.rentalPlan}</Text>
                              </View>
                              {rental.status === 'Paused' && (
                                <View style={[styles.tag, styles.pauseTag]}>
                                  <Text style={[styles.tagText, { color: Colors.statusWarning }]}>PAUSED</Text>
                                </View>
                              )}
                            </View>
                          </View>

                          {/* Days pill */}
                          <View style={[styles.daysPill, { borderColor: `${dayColor}40`, backgroundColor: `${dayColor}10` }]}>
                            <Text style={[styles.daysValue, { color: dayColor }]}>
                              {rental.daysRemaining === null ? '-' :
                               rental.daysRemaining <= 0    ? 'OVR' :
                               rental.daysRemaining}
                            </Text>
                            <Text style={[styles.daysSub, { color: dayColor }]}>
                              {rental.daysRemaining !== null && rental.daysRemaining > 0 ? 'days left' :
                               rental.daysRemaining === null ? '' : 'overdue'}
                            </Text>
                          </View>
                        </View>

                        {/* Row 2: Dates */}
                        <View style={styles.dateRow}>
                          <Ionicons name="calendar-outline" size={10} color={Colors.textMuted} style={{ marginRight: 4 }} />
                          <Text style={styles.dateText}>
                            {fmtDate(rental.startDate)} to {fmtDate(rental.endDate)}
                          </Text>
                        </View>

                        {/* Row 3: Financials */}
                        <View style={styles.finRow}>
                          <View style={styles.finCell}>
                            <Text style={styles.finLabel}>COLLECTED</Text>
                            <Text style={styles.finValue}>{fmtCurrency(rental.totalRentCollected)}</Text>
                            <Text style={styles.finSub}>
                              Cash: {fmtCurrency(rental.cashCollected)}  Online: {fmtCurrency(rental.onlineCollected)}
                            </Text>
                          </View>
                          <View style={styles.finDivider} />
                          <View style={styles.finCell}>
                            <Text style={[styles.finLabel, { color: rental.pendingAmount > 0 ? Colors.statusError : Colors.textMuted }]}>
                              PENDING
                            </Text>
                            <Text style={[styles.finValue, { color: rental.pendingAmount > 0 ? Colors.statusError : Colors.statusActive }]}>
                              {rental.pendingAmount > 0 ? fmtCurrency(rental.pendingAmount) : 'NIL'}
                            </Text>
                            {rental.pendingAmount > 0 && rental.pendingDueDate != null && (
                              <Text style={[styles.finSub, { color: Colors.statusError }]}>
                                due {fmtDate(rental.pendingDueDate)}
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bgApp },
  scroll:  { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 100 },

  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: { padding: 4 },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  statusPillLive:  { borderColor: Colors.brandTealSubtle, backgroundColor: Colors.surfaceTeal },
  statusPillFinal: { borderColor: Colors.surfaceGreen,    backgroundColor: Colors.surfaceGreen },
  statusDot:       { width: 6, height: 6, borderRadius: 3 },
  statusPillText:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.bgApp,
  },
  shareBtnActive:     { backgroundColor: Colors.statusActive, borderColor: Colors.statusActive },
  shareBtnText:       { fontSize: 10, fontWeight: '700', color: Colors.textMuted },
  shareBtnTextActive: { color: '#fff' },

  timestampBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  timestampText:  { flex: 1, fontSize: 10, color: Colors.textMuted, fontWeight: '500' },
  storeNameText:  { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },

  // KPI
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  sectionLabel: { ...Typography.labelCaps, color: Colors.textSecondary },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Colors.surfaceRed,
    borderWidth: 1,
    borderColor: `${Colors.statusError}30`,
  },
  pendingBadgeText: { fontSize: 9, fontWeight: '700', color: Colors.statusError },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiCard: {
    width: '31.5%',
    borderRadius: Radius.card,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 4,
  },
  kpiIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  kpiValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  kpiLabel: { fontSize: 9, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.2, lineHeight: 12 },

  // Table
  tableCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  rentalRow:         { flexDirection: 'row' },
  rentalRowBorder:   { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  rentalRowPending:  { backgroundColor: '#FFF8F8' },
  rowStripe:         { width: 3 },
  rentalBody:        { flex: 1, padding: 12, gap: 6 },

  rentalTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  riderName:    { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.2 },
  tagRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  planTag:  { backgroundColor: Colors.surfaceTeal, borderColor: Colors.brandTealSubtle },
  pauseTag: { backgroundColor: Colors.surfaceAmber, borderColor: Colors.surfaceAmber },
  tagText:  { fontSize: 9, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.2 },

  daysPill: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  daysValue: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  daysSub:   { fontSize: 8, fontWeight: '600', letterSpacing: 0.1, marginTop: 1 },

  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },

  finRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: Colors.bgApp,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
    marginTop: 2,
  },
  finCell:    { flex: 1, padding: 8, gap: 1 },
  finDivider: { width: 1, backgroundColor: Colors.borderLight },
  finLabel:   { fontSize: 8, fontWeight: '800', letterSpacing: 0.5, color: Colors.textMuted },
  finValue:   { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.2 },
  finSub:     { fontSize: 9, color: Colors.textMuted, fontWeight: '500' },

  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText:  { ...Typography.bodySecondary, color: Colors.textSecondary },
});
