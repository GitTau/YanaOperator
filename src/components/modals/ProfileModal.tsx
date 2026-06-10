import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Colors, Radius, Spacing, Typography } from '../../constants/design';
import type { BookingWithDetails, Vehicle, AuditLog } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../services/bookingService';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

interface Customer {
  id: string;
  name: string;
  phone: string;
  created_at?: string;
}

interface MaintenanceJob {
  id: string;
  vehicle_id: string;
  store_id: string;
  status: string;
  description: string;
  resolution_notes?: string | null;
  created_at: string;
  closed_at?: string | null;
  vehicle?: {
    plate_number: string;
    status: string;
  };
}

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
  operatorName?: string;
  operatorEmail?: string;
  role?: string;
  storeName?: string;
  storeLocation?: string;
  bookings: BookingWithDetails[];
  vehicles: Vehicle[];
  customers: Customer[];
  maintenanceJobs: MaintenanceJob[];
}

export function ProfileModal({
  visible,
  onClose,
  operatorName = 'Anup (Operator)',
  operatorEmail = 'anup@yana.co',
  role = 'OPERATOR',
  storeName = 'ZAP Point Bhubaneswar',
  storeLocation = 'Patia, Bhubaneswar',
  bookings = [],
  vehicles = [],
  customers = [],
  maintenanceJobs = [],
}: ProfileModalProps) {
  const [generating, setGenerating] = useState(false);

  // Get Store ID from bookings or vehicles
  const storeId = useMemo(() => {
    return bookings[0]?.store_id || vehicles[0]?.store_id || null;
  }, [bookings, vehicles]);

  // ── Start of Today (Local Time) ─────────────────────────────────────────────
  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [visible]);

  // ── Fetch today's audit logs scoped to the store ────────────────────────────
  const { data: auditLogs = [], refetch: refetchLogs } = useQuery<AuditLog[]>({
    queryKey: ['audit_logs_today', storeId],
    enabled: !!storeId && visible,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('store_id', storeId)
        .gte('timestamp', startOfToday.toISOString());
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000, // Poll every 30s
  });

  // ── 1. Revenue Collected today (cash/online) ────────────────────────────────
  const { cashRevenue, onlineRevenue, totalRevenue } = useMemo(() => {
    let cashTotal = 0;
    let onlineTotal = 0;

    auditLogs.forEach((log) => {
      if (log.type === 'BOOKING') {
        // Parse custom breakdown logs
        if (log.reason && log.reason.includes('Breakdown: Cash:')) {
          const cashMatch = log.reason.match(/Cash:\s*₹?\s*([\d,]+)/i);
          const onlineMatch = log.reason.match(/Online:\s*₹?\s*([\d,]+)/i);
          if (cashMatch) {
            cashTotal += parseFloat(cashMatch[1].replace(/,/g, '')) || 0;
          }
          if (onlineMatch) {
            onlineTotal += parseFloat(onlineMatch[1].replace(/,/g, '')) || 0;
          }
        } else if (log.message && log.message.startsWith('Payment of Rs.')) {
          // Parse RPC-inserted logs
          const amtMatch = log.message.match(/Rs\.\s*([\d.]+)/i);
          if (amtMatch) {
            cashTotal += parseFloat(amtMatch[1]) || 0;
          }
        }
      }
    });

    return {
      cashRevenue: cashTotal,
      onlineRevenue: onlineTotal,
      totalRevenue: cashTotal + onlineTotal,
    };
  }, [auditLogs]);

  // ── 2. Riders Onboarded today ───────────────────────────────────────────────
  const ridersOnboardedToday = useMemo(() => {
    return customers.filter(
      (c) => c.created_at && new Date(c.created_at) >= startOfToday
    ).length;
  }, [customers, startOfToday]);

  // ── 3. Rides Paused today ───────────────────────────────────────────────────
  const ridesPausedToday = useMemo(() => {
    return auditLogs.filter(
      (log) => log.type === 'BOOKING' && log.message === 'Booking Paused'
    ).length;
  }, [auditLogs]);

  // ── 4. Vehicle Swapped today ────────────────────────────────────────────────
  const vehiclesSwappedToday = useMemo(() => {
    return auditLogs.filter(
      (log) => log.type === 'SYSTEM' && log.message && log.message.includes('Swapped')
    ).length;
  }, [auditLogs]);

  // ── 5. Vehicles went to maintenance today ───────────────────────────────────
  const wentToMaintenanceToday = useMemo(() => {
    return maintenanceJobs.filter(
      (job) => job.created_at && new Date(job.created_at) >= startOfToday
    ).length;
  }, [maintenanceJobs, startOfToday]);

  // ── 6. Vehicles Repaired today ──────────────────────────────────────────────
  const repairedToday = useMemo(() => {
    return maintenanceJobs.filter(
      (job) =>
        job.status === 'Closed' &&
        job.closed_at &&
        new Date(job.closed_at) >= startOfToday
    ).length;
  }, [maintenanceJobs, startOfToday]);

  // ── 7. Total Vehicles under maintenance ─────────────────────────────────────
  const totalUnderMaintenance = useMemo(() => {
    return vehicles.filter((v) => v.status === 'Maintenance').length;
  }, [vehicles]);

  // ── 8. Total Vehicles Available for booking ─────────────────────────────────
  const totalAvailableForBooking = useMemo(() => {
    return vehicles.filter((v) => v.status === 'Available').length;
  }, [vehicles]);

  // ── 9. Total Active rentals (paused rentals are not active rentals) ─────────
  const totalActiveRentals = useMemo(() => {
    return bookings.filter((b) => b.status === 'Active').length;
  }, [bookings]);

  // ── Generate PDF Daily Operations Report ───────────────────────────────────
  const handleGeneratePDF = async () => {
    setGenerating(true);
    try {
      await refetchLogs();

      const todayStr = new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      // Filter active rentals
      const activeRentalsList = bookings.filter(
        (b) => b.status === 'Draft' || b.status === 'Active' || b.status === 'Paused'
      );

      const rowsHtml = activeRentalsList
        .map((b) => {
          const balance = b.total_amount + b.deposit_amount + b.fines_amount - b.amount_paid;
          const badgeClass = b.status.toLowerCase();
          return `
            <tr>
              <td><strong>${b.customer?.name || '—'}</strong></td>
              <td>${b.customer?.phone || '—'}</td>
              <td>🛵 ${b.vehicle?.plate_number || '—'}</td>
              <td>${b.rental_plan}</td>
              <td style="color: #059669; font-weight: 700;">₹${b.amount_paid}</td>
              <td style="color: ${balance > 0 ? '#E11D48' : '#334155'}; font-weight: 700;">₹${Math.max(0, balance)}</td>
              <td><span class="badge ${badgeClass}">${b.status}</span></td>
            </tr>
          `;
        })
        .join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #0F172A;
            background-color: #FAFBFC;
            padding: 30px;
            margin: 0;
          }
          .header {
            border-bottom: 2px solid #00eaff;
            padding-bottom: 15px;
            margin-bottom: 25px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .title {
            font-size: 24px;
            font-weight: 800;
            margin: 0;
            color: #0F1C2E;
            letter-spacing: 0.5px;
          }
          .subtitle {
            font-size: 13px;
            color: #475569;
            margin-top: 5px;
          }
          .meta {
            text-align: right;
            font-size: 11px;
            color: #94A3B8;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 30px;
          }
          .card {
            background-color: #FFFFFF;
            border: 1px solid #ECEEF4;
            border-radius: 12px;
            padding: 15px;
          }
          .card-label {
            font-size: 10px;
            font-weight: 700;
            color: #64748B;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 5px;
          }
          .card-value {
            font-size: 20px;
            font-weight: 800;
            color: #0F1C2E;
          }
          .card-value.green { color: #059669; }
          .card-value.cyan { color: #0891b2; }
          .card-value.rose { color: #E11D48; }
          .card-value.blue { color: #2563EB; }
          
          .section-title {
            font-size: 14px;
            font-weight: 700;
            color: #0F1C2E;
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            border-left: 3px solid #00eaff;
            padding-left: 8px;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 25px;
            background-color: #FFFFFF;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #ECEEF4;
          }
          th {
            background-color: #0F1C2E;
            color: #FFFFFF;
            text-align: left;
            padding: 10px 12px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          td {
            padding: 10px 12px;
            border-bottom: 1px solid #F1F5F9;
            font-size: 11px;
            color: #334155;
          }
          tr:last-child td {
            border-bottom: none;
          }
          .badge {
            padding: 3px 8px;
            border-radius: 100px;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            display: inline-block;
          }
          .badge.active { background-color: #ECFDF5; color: #047857; }
          .badge.draft { background-color: #F1F5F9; color: #475569; }
          .badge.paused { background-color: #FFFBEB; color: #B45309; }
          
          .footer {
            text-align: center;
            font-size: 10px;
            color: #94A3B8;
            margin-top: 40px;
            border-top: 1px solid #E2E8F0;
            padding-top: 15px;
          }
        </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">YanaOS Daily Operations Report</div>
              <div class="subtitle">ZAP Point: ${storeName}</div>
            </div>
            <div class="meta">
              <div>Date: ${todayStr}</div>
              <div>Generated by: ${operatorName} (${role})</div>
            </div>
          </div>
          
          <div class="grid">
            <div class="card">
              <div class="card-label">Revenue Collected Today</div>
              <div class="card-value green">₹${totalRevenue.toLocaleString('en-IN')}</div>
              <div style="font-size: 10px; color: #64748B; margin-top: 4px;">
                Cash: ₹${cashRevenue.toLocaleString('en-IN')} · Online: ₹${onlineRevenue.toLocaleString('en-IN')}
              </div>
            </div>
            <div class="card">
              <div class="card-label">Riders Onboarded Today</div>
              <div class="card-value cyan">${ridersOnboardedToday}</div>
            </div>
            <div class="card">
              <div class="card-label">Rides Paused Today</div>
              <div class="card-value blue">${ridesPausedToday}</div>
            </div>
            <div class="card">
              <div class="card-label">Vehicles Swapped Today</div>
              <div class="card-value cyan">${vehiclesSwappedToday}</div>
            </div>
            <div class="card">
              <div class="card-label">Went to Maintenance Today</div>
              <div class="card-value rose">${wentToMaintenanceToday}</div>
            </div>
            <div class="card">
              <div class="card-label">Vehicles Repaired Today</div>
              <div class="card-value green">${repairedToday}</div>
            </div>
            <div class="card">
              <div class="card-label">Fleet in Maintenance</div>
              <div class="card-value rose">${totalUnderMaintenance}</div>
            </div>
            <div class="card">
              <div class="card-label">Available for Booking</div>
              <div class="card-value green">${totalAvailableForBooking}</div>
            </div>
            <div class="card">
              <div class="card-label">Active Rentals</div>
              <div class="card-value blue">${totalActiveRentals}</div>
            </div>
          </div>
          
          <div class="section-title">Active Fleet Lifecycle Registry</div>
          <table>
            <thead>
              <tr>
                <th>Rider</th>
                <th>Phone</th>
                <th>Vehicle</th>
                <th>Plan</th>
                <th>Paid</th>
                <th>Due Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="7" style="text-align: center; color: #94A3B8;">No active bookings today</td></tr>'}
            </tbody>
          </table>
        
          <div class="footer">
            © 2026 Yantron Technology Pvt. Ltd. | Bhubaneswar, Odisha | Confidential Operations Registry
          </div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Daily_Report_${todayStr.replace(/\s/g, '_')}`,
      });
    } catch (err) {
      console.error('[ProfileModal] PDF Generation failed:', err);
      Alert.alert('Error', 'Failed to generate PDF report.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.handle} />

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.titleRow}>
            <Text style={[Typography.h1Screen, { color: Colors.textPrimary }]}>Operator Profile</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          {/* Profile details */}
          <View style={styles.profileCard}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>
                {operatorName.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.profileName}>{operatorName}</Text>
            <Text style={styles.profileEmail}>{operatorEmail}</Text>

            <View style={styles.badgeRow}>
              <View style={styles.pillBadge}>
                <Ionicons name="shield-checkmark-outline" size={12} color={Colors.textSecondary} style={{ marginRight: 4 }} />
                <Text style={styles.pillBadgeText}>{role}</Text>
              </View>
              <View style={styles.pillBadge}>
                <Ionicons name="location-outline" size={12} color={Colors.textSecondary} style={{ marginRight: 4 }} />
                <Text style={styles.pillBadgeText}>{storeLocation}</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionDivider} />

          {/* Daily Operations Metrics section */}
          <Text style={[Typography.labelCaps, styles.sectionHeader]}>DAILY OPERATIONS MANDATED SUMMARY</Text>

          <View style={styles.statsGrid}>
            <StatBox
              label="Revenue today (split)"
              value={formatCurrency(totalRevenue)}
              valueColor={Colors.statusActive}
              sub={`Cash: ₹${cashRevenue.toLocaleString('en-IN')} · Online: ₹${onlineRevenue.toLocaleString('en-IN')}`}
            />
            <StatBox
              label="Riders Onboarded today"
              value={String(ridersOnboardedToday)}
              valueColor={Colors.brandTealDim}
            />
            <StatBox
              label="Rides Paused today"
              value={String(ridesPausedToday)}
              valueColor={Colors.statusWarning}
            />
            <StatBox
              label="Vehicles Swapped today"
              value={String(vehiclesSwappedToday)}
              valueColor={Colors.blueText}
            />
            <StatBox
              label="Went to maintenance today"
              value={String(wentToMaintenanceToday)}
              valueColor={Colors.statusError}
            />
            <StatBox
              label="Vehicles Repaired today"
              value={String(repairedToday)}
              valueColor={Colors.statusActive}
            />
            <StatBox
              label="Total under maintenance"
              value={String(totalUnderMaintenance)}
              valueColor={Colors.statusError}
            />
            <StatBox
              label="Available for booking"
              value={String(totalAvailableForBooking)}
              valueColor={Colors.statusActive}
            />
            <StatBox
              label="Total Active rentals"
              value={String(totalActiveRentals)}
              valueColor={Colors.blueText}
              sub="Excludes paused bookings"
            />
          </View>

          {/* Generate PDF button */}
          <Pressable
            style={({ pressed }) => [
              styles.reportBtn,
              { opacity: pressed ? 0.88 : 1 },
              generating && styles.reportBtnDisabled,
            ]}
            onPress={handleGeneratePDF}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color={Colors.brandNavy} size="small" />
            ) : (
              <>
                <Ionicons name="document-text-outline" size={20} color={Colors.brandNavy} style={{ marginRight: 8 }} />
                <Text style={styles.reportBtnText}>Generate Comprehensive PDF Report</Text>
              </>
            )}
          </Pressable>

          <View style={{ height: Spacing.xl }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function StatBox({
  label,
  value,
  valueColor,
  sub,
}: {
  label: string;
  value: string;
  valueColor: string;
  sub?: string;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgApp },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderLight,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  scroll: { flex: 1, paddingHorizontal: Spacing.md },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  closeBtn: { fontSize: 20, color: Colors.textSecondary, padding: 4 },

  profileCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.lg,
    alignItems: 'center',
    shadowColor: '#B0BAD0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.brandTealSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avatarLargeText: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.brandTeal,
  },
  profileName: {
    ...Typography.h1Screen,
    color: Colors.textPrimary,
  },
  profileEmail: {
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  pillBadgeText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: Spacing.lg,
  },
  sectionHeader: {
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  statBox: {
    width: '47%',
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
    gap: Spacing.xs,
    minHeight: 100,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontWeight: '700',
    fontSize: 9,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  statSub: {
    ...Typography.caption,
    fontSize: 9,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  reportBtn: {
    backgroundColor: Colors.brandTeal,
    borderRadius: Radius.button,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.brandTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  reportBtnDisabled: {
    backgroundColor: Colors.borderLight,
    shadowOpacity: 0,
    elevation: 0,
  },
  reportBtnText: {
    ...Typography.buttonPrimary,
    color: Colors.brandNavy,
    fontWeight: '800',
  },
});
