// ─────────────────────────────────────────────────────────────────────────────
// Riders Screen — Customer list for this ZAP Point
// Search by name/phone, add new rider, tap existing for details
// ─────────────────────────────────────────────────────────────────────────────

import { useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { CustomerFormModal } from '../../src/components/modals/OpsModals';
import { EmptyState, ErrorBanner, SearchBar, SkeletonCard } from '../../src/components/ui';
import { useBookings, useCustomers, queryKeys } from '../../src/hooks/useQueries';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import { maskAadhaar } from '../../src/services/bookingService';
import type { BookingWithDetails, Customer } from '../../src/lib/database.types';

export default function RidersScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const storeId = selectedStore?.store_id ?? null;
  const queryClient = useQueryClient();

  const { data: customers, isLoading, error, refetch } = useCustomers(storeId);
  const { data: bookings } = useBookings(storeId);

  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selectedRider, setSelectedRider] = useState<Customer | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.customers(storeId ?? '') });

  // Build a quick lookup: customer id → active booking
  const activeBookingByCustomer = useMemo(() => {
    const map = new Map<string, BookingWithDetails>();
    (bookings as BookingWithDetails[] | undefined)
      ?.filter((b) => b.status === 'Active' || b.status === 'Paused')
      .forEach((b) => map.set(b.customer_id, b));
    return map;
  }, [bookings]);

  const filtered = useMemo(() => {
    if (!customers) return [];
    const q = search.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.aadhar_no && c.aadhar_no.slice(-4).includes(q)),
    );
  }, [customers, search]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[Typography.overline, { color: Colors.textSecondary }]}>ZAP POINT RIDERS</Text>
          <Text style={[Typography.h1Screen, { color: Colors.textPrimary }]}>Rider Registry</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>+ ADD RIDER</Text>
        </Pressable>
      </View>

      <View style={styles.searchContainer}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, phone, last 4 of Aadhaar..."
        />
        <Text style={[Typography.bodySecondary, { color: Colors.textSecondary, marginTop: 6 }]}>
          {customers?.length ?? 0} riders registered
        </Text>
      </View>

      {error && <ErrorBanner message="Failed to load riders" onRetry={refetch} />}

      {isLoading ? (
        <View style={{ padding: Spacing.md, gap: 12 }}>
          {[1, 2, 3].map((k) => <SkeletonCard key={k} height={90} />)}
        </View>
      ) : selectedRider ? (
        <RiderDetail
          rider={selectedRider}
          activeBooking={activeBookingByCustomer.get(selectedRider.id) ?? null}
          onBack={() => setSelectedRider(null)}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={invalidate} tintColor={Colors.brandCyan} />}
          ListEmptyComponent={
            <EmptyState
              message={search ? 'No riders match that search.' : 'No riders registered.'}
              sub={!search ? 'Tap + ADD RIDER to register your first rider.' : undefined}
            />
          }
          renderItem={({ item: rider }) => {
            const booking = activeBookingByCustomer.get(rider.id);
            const initials = rider.name.slice(0, 2).toUpperCase();
            return (
              <Pressable style={styles.riderCard} onPress={() => setSelectedRider(rider)}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={styles.riderInfo}>
                  <Text style={[Typography.bodyPrimary, { fontWeight: '700', color: Colors.textPrimary }]}>
                    {rider.name}
                  </Text>
                  <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>
                    {rider.phone}
                  </Text>
                  {rider.aadhar_no && (
                    <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>
                      Aadhaar: {maskAadhaar(rider.aadhar_no)}
                    </Text>
                  )}
                </View>
                <View style={styles.riderRight}>
                  {rider.kyc_status ? (
                    <View style={styles.kycBadge}>
                      <Text style={[Typography.badgeText, { color: Colors.statusActive }]}>✓ KYC</Text>
                    </View>
                  ) : (
                    <View style={[styles.kycBadge, { borderColor: Colors.amber }]}>
                      <Text style={[Typography.badgeText, { color: Colors.amber }]}>PENDING</Text>
                    </View>
                  )}
                  {booking && (
                    <View style={[
                      styles.activeBadge,
                      booking.status === 'Paused' && { backgroundColor: Colors.surfaceAmber }
                    ]}>
                      <Text style={[
                        Typography.badgeText,
                        {
                          color: booking.status === 'Paused' ? Colors.statusWarning : Colors.statusActive,
                          fontSize: 9,
                        }
                      ]}>
                        {booking.status.toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.chevron}>›</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <CustomerFormModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={() => { setShowAdd(false); invalidate(); }}
        storeId={storeId ?? ''}
      />
    </SafeAreaView>
  );
}

// ── Rider detail view ─────────────────────────────────────────────────────────
function RiderDetail({
  rider,
  activeBooking,
  onBack,
}: {
  rider: Customer;
  activeBooking: BookingWithDetails | null;
  onBack: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>← Back to Riders</Text>
      </Pressable>
      <View style={{ padding: Spacing.md }}>
        <View style={styles.detailHeader}>
          <View style={[styles.avatar, { width: 56, height: 56, borderRadius: 28 }]}>
            <Text style={[styles.avatarText, { fontSize: 20 }]}>{rider.name.slice(0, 2).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: Spacing.sm }}>
            <Text style={[Typography.h1Screen, { color: Colors.textPrimary, fontSize: 20 }]}>{rider.name}</Text>
            <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>{rider.phone}</Text>
          </View>
        </View>

        {activeBooking && (
          <View style={[
            styles.activeBookingBar,
            activeBooking.status === 'Paused' && {
              backgroundColor: Colors.surfaceAmber,
              borderLeftColor: Colors.statusWarning,
            }
          ]}>
            <Text style={[Typography.badgeText, { color: activeBooking.status === 'Paused' ? Colors.statusWarning : Colors.statusActive }]}>
              {activeBooking.status === 'Paused' ? '🟡 PAUSED' : '🟢 ACTIVE'} — {activeBooking.vehicle?.plate_number ?? 'No Vehicle'} · {activeBooking.rental_plan}
            </Text>
          </View>
        )}

        <View style={styles.detailCard}>
          <DetailRow label="Aadhaar" value={maskAadhaar(rider.aadhar_no)} />
          <DetailRow label="PAN" value={rider.pan_no ?? '—'} />
          <DetailRow label="Address" value={rider.address ?? '—'} />
          <DetailRow label="Emergency 1" value={rider.emergency_contact_1 ?? '—'} />
          <DetailRow label="Emergency 2" value={rider.emergency_contact_2 ?? '—'} />
          <DetailRow label="Bank" value={rider.bank_name ?? '—'} />
          <DetailRow label="Account" value={rider.account_number ? '••••' + rider.account_number.slice(-4) : '—'} />
          <DetailRow label="IFSC" value={rider.ifsc_code ?? '—'} />
          <DetailRow label="UPI" value={rider.upi_id ?? '—'} />
          <DetailRow label="KYC Status" value={rider.kyc_status ? '✅ Verified' : '⏳ Pending'} />
        </View>
      </View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[Typography.bodySecondary, { color: Colors.textSecondary, flex: 1 }]}>{label}</Text>
      <Text style={[Typography.bodySecondary, { color: Colors.textPrimary, fontWeight: '600', flex: 2, textAlign: 'right' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgApp },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  addBtn: { backgroundColor: Colors.brandCyan, borderRadius: Radius.button, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { ...Typography.buttonSecondary, color: Colors.brandNavy, fontWeight: '700' },
  searchContainer: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  listContent: { padding: Spacing.md, gap: 10, paddingBottom: 100 },

  riderCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.borderLight,
    padding: Spacing.md, gap: Spacing.sm,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.brandCyan, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.brandNavy, fontWeight: '800', fontSize: 15 },
  riderInfo: { flex: 1, gap: 2 },
  riderRight: { alignItems: 'flex-end', gap: 4 },
  kycBadge: { borderWidth: 1, borderColor: Colors.statusActive, borderRadius: Radius.badge, paddingHorizontal: 6, paddingVertical: 2 },
  activeBadge: { backgroundColor: Colors.statusAvailableBg, borderRadius: Radius.badge, paddingHorizontal: 6, paddingVertical: 2 },
  chevron: { fontSize: 20, color: Colors.textSecondary, marginTop: 2 },

  backBtn: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  backBtnText: { ...Typography.bodySecondary, color: Colors.brandCyan, fontWeight: '600' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  activeBookingBar: {
    backgroundColor: Colors.statusAvailableBg, borderRadius: Radius.sm,
    padding: 10, marginBottom: Spacing.md,
    borderLeftWidth: 3, borderLeftColor: Colors.statusActive,
  },
  detailCard: {
    backgroundColor: Colors.surfaceCard, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.borderLight, padding: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
});
