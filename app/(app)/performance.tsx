// ─────────────────────────────────────────────────────────────────────────────
// Performance Screen — Captain Appraisal Dashboard
// Read-only: captains see their scores. Admins score via web CRM.
//
// Layout:
//   A) Cycle Banner — cycle name, days remaining, current performance group (E/M/A)
//   B) Daily Task View — tasks for today grouped by type, with stars + zero alerts
//   C) Weekly Score History — week-by-week breakdown + bonus eligibility tracker
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { ErrorBanner, SkeletonCard, StoreLiveBadge } from '../../src/components/ui';
import {
  useActiveCycle,
  useCaptainByStore,
  useMyTaskEntries,
  useMyWeeklyScores,
  queryKeys,
  type TaskEntry,
  type WeeklyScore,
  type AppraisalCycle,
} from '../../src/hooks/useQueries';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import { parseLocalDate, formatLocalDate } from '../../src/services/bookingService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO(): string {
  return formatLocalDate(new Date());
}

function daysRemaining(endDate: string): number {
  const end = parseLocalDate(endDate);
  if (!end) return 0;
  const now = new Date();
  end.setHours(23, 59, 59, 999);
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function formatDate(iso: string): string {
  const d = parseLocalDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ── Performance Group Config ──────────────────────────────────────────────────

const GROUP_CONFIG = {
  E: {
    label: 'Exceptional',
    letter: 'E',
    bg: '#ECFDF5',
    border: '#6EE7B7',
    text: '#047857',
    icon: 'ribbon' as const,
    desc: 'Top performer — bonus eligible',
  },
  M: {
    label: 'Meets Expectations',
    letter: 'M',
    bg: 'rgba(0, 234, 255, 0.08)',
    border: '#67E8F9',
    text: '#0891b2',
    icon: 'checkmark-circle' as const,
    desc: 'Performing on track',
  },
  A: {
    label: 'Needs Attention',
    letter: 'A',
    bg: '#FFFBEB',
    border: '#FCD34D',
    text: '#B45309',
    icon: 'alert-circle' as const,
    desc: 'Focus required this week',
  },
} as const;

const TASK_TYPE_CONFIG = {
  regular:     { label: 'Regular',      icon: 'checkmark-circle-outline' as const, color: Colors.brandTeal },
  non_regular: { label: 'Non-Regular',  icon: 'star-outline' as const,              color: Colors.statusWarning },
  emergency:   { label: 'Emergency',    icon: 'flash-outline' as const,             color: Colors.statusError },
} as const;

// ── Star Rating Display ───────────────────────────────────────────────────────

function StarRow({ stars }: { stars: number }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Ionicons
          key={s}
          name={s <= stars ? 'star' : 'star-outline'}
          size={13}
          color={s <= stars ? '#F59E0B' : Colors.borderInput}
        />
      ))}
    </View>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({ task }: { task: TaskEntry }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TASK_TYPE_CONFIG[task.task_type];

  const isDone         = task.status === 'done';
  const isOverride     = task.is_override_zero;
  const isPending      = task.status === 'pending';

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      style={({ pressed }) => [styles.taskCard, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`Task: ${task.task_name}`}
    >
      <View style={styles.taskCardInner}>
        {/* Left: status indicator strip */}
        <View style={[
          styles.taskStrip,
          {
            backgroundColor: isDone
              ? Colors.statusActive
              : isOverride
              ? Colors.statusError
              : Colors.borderInput,
          },
        ]} />

        {/* Content */}
        <View style={{ flex: 1, gap: 4 }}>
          {/* Type chip + override badge */}
          <View style={styles.taskChipRow}>
            <View style={[styles.taskChip, { borderColor: cfg.color }]}>
              <Ionicons name={cfg.icon} size={10} color={cfg.color} />
              <Text style={[styles.taskChipText, { color: cfg.color }]}>
                {cfg.label.toUpperCase()}
              </Text>
            </View>

            {isOverride && (
              <View style={styles.overrideBadge}>
                <Ionicons name="alert-circle" size={10} color={Colors.statusError} />
                <Text style={styles.overrideBadgeText}>
                  ZERO — {(task.override_reason ?? 'override').replace('_', ' ').toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          {/* Task name */}
          <Text style={[
            styles.taskName,
            isDone && { color: Colors.textSecondary },
          ]}>
            {task.task_name}
          </Text>

          {/* Stars (if scored) */}
          {isDone && task.stars !== null && (
            <StarRow stars={task.stars} />
          )}

          {/* Done but not yet starred */}
          {isDone && task.stars === null && (
            <Text style={styles.pendingRating}>Awaiting rating…</Text>
          )}

          {/* Pending indicator */}
          {isPending && !isOverride && (
            <Text style={styles.pendingRating}>Pending</Text>
          )}
        </View>

        {/* Chevron */}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={Colors.textMuted}
        />
      </View>

      {/* Remarks (expanded) */}
      {expanded && task.remarks && (
        <View style={styles.remarksBox}>
          <Text style={styles.remarksLabel}>ADMIN REMARK</Text>
          <Text style={styles.remarksText}>{task.remarks}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Task Group Section ────────────────────────────────────────────────────────

function TaskGroup({
  type,
  tasks,
}: {
  type: keyof typeof TASK_TYPE_CONFIG;
  tasks: TaskEntry[];
}) {
  const cfg = TASK_TYPE_CONFIG[type];
  if (tasks.length === 0) return null;

  return (
    <View style={styles.taskGroup}>
      <View style={styles.taskGroupHeader}>
        <Ionicons name={cfg.icon} size={14} color={cfg.color} />
        <Text style={[styles.taskGroupLabel, { color: cfg.color }]}>
          {cfg.label.toUpperCase()}
        </Text>
        <View style={[styles.taskGroupCount, { backgroundColor: cfg.color + '18' }]}>
          <Text style={[styles.taskGroupCountText, { color: cfg.color }]}>{tasks.length}</Text>
        </View>
      </View>
      {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
    </View>
  );
}

// ── Weekly Score Chip ─────────────────────────────────────────────────────────

function WeekChip({ score }: { score: WeeklyScore }) {
  const grp = score.performance_group;
  const cfg = GROUP_CONFIG[grp] ?? GROUP_CONFIG.M;

  return (
    <View style={[styles.weekChip, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Text style={[styles.weekChipWeek, { color: cfg.text }]}>W{score.week_number}</Text>
      <Text style={[styles.weekChipAvg, { color: cfg.text }]}>
        {Number(score.overall_avg).toFixed(1)}★
      </Text>
      <View style={[styles.weekChipBadge, { backgroundColor: cfg.text }]}>
        <Text style={styles.weekChipBadgeText}>{grp}</Text>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function PerformanceScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const storeId = selectedStore?.store_id ?? null;
  const queryClient = useQueryClient();

  const today = todayISO();

  const params = useLocalSearchParams<{ segment?: string }>();
  const initialSegment = (params.segment === 'tasks' || params.segment === 'performance' || params.segment === 'attendance' || params.segment === 'maintenance')
    ? params.segment
    : 'tasks';

  const [activeSegment, setActiveSegment] = useState<'tasks' | 'performance' | 'attendance' | 'maintenance'>(initialSegment);

  // Sync segment if query params change
  React.useEffect(() => {
    if (params.segment && (params.segment === 'tasks' || params.segment === 'performance' || params.segment === 'attendance' || params.segment === 'maintenance')) {
      setActiveSegment(params.segment);
    }
  }, [params.segment]);

  const { data: cycle, isLoading: cycleLoading, error: cycleError } = useActiveCycle();
  const { data: captain, isLoading: captainLoading }                = useCaptainByStore(storeId);
  const captainId = captain?.id ?? null;

  const {
    data: tasks,
    isLoading: tasksLoading,
    refetch: refetchTasks,
  } = useMyTaskEntries(captainId, today);

  const {
    data: weeklyScores,
    isLoading: scoresLoading,
  } = useMyWeeklyScores(captainId, cycle?.id ?? null);

  const isLoading = cycleLoading || captainLoading || tasksLoading || scoresLoading;

  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.activeCycle });
    queryClient.invalidateQueries({ queryKey: queryKeys.captainByStore(storeId ?? '') });
    if (captainId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.taskEntries(captainId, today) });
      if (cycle?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.weeklyScores(captainId, cycle.id) });
      }
    }
  };

  // ── Derived values ──────────────────────────────────────────────────────────
  const days       = cycle ? daysRemaining(cycle.end_date) : 0;
  const doneTasks  = tasks?.filter((t) => t.status === 'done').length ?? 0;
  const totalTasks = tasks?.length ?? 0;

  // Current week's performance group — from the latest weekly score
  const latestScore  = weeklyScores && weeklyScores.length > 0
    ? weeklyScores[weeklyScores.length - 1]
    : null;
  const currentGroup = latestScore?.performance_group ?? null;
  const groupCfg     = currentGroup ? GROUP_CONFIG[currentGroup] : null;

  // Tasks split by type
  const regularTasks    = tasks?.filter((t) => t.task_type === 'regular') ?? [];
  const nonRegularTasks = tasks?.filter((t) => t.task_type === 'non_regular') ?? [];
  const emergencyTasks  = tasks?.filter((t) => t.task_type === 'emergency') ?? [];

  // Bonus tracker
  const countE = weeklyScores?.filter((w) => w.performance_group === 'E').length ?? 0;
  const countM = weeklyScores?.filter((w) => w.performance_group === 'M').length ?? 0;
  const countA = weeklyScores?.filter((w) => w.performance_group === 'A').length ?? 0;
  const totalWeeks = weeklyScores?.length ?? 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={Colors.brandTeal} />
        }
      >
        {/* ── Screen Header ──────────────────────────────────────────────── */}
        <View style={styles.screenHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[Typography.overline, { color: Colors.textSecondary, letterSpacing: 1.5 }]}>
              CAPTAIN
            </Text>
            <Text style={[Typography.h2Metric, { color: Colors.textPrimary, fontFamily: 'Nunito-Bold', fontSize: 24, letterSpacing: -0.3, marginTop: 2, textTransform: 'uppercase' }]} numberOfLines={1}>
              {captain?.name || 'Operator'}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(app)')}
            style={({ pressed }) => [
              styles.profileBtn,
              {
                opacity: pressed ? 0.75 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Back to Overview"
          >
            <Ionicons name="arrow-back" size={18} color={Colors.textTeal} />
          </Pressable>
        </View>

        {/* ── Segmented Switcher ────────────────────────────────────────── */}
        <View style={styles.segmentContainer}>
          <Pressable
            onPress={() => setActiveSegment('tasks')}
            style={[styles.segmentBtn, activeSegment === 'tasks' && styles.segmentBtnActive]}
          >
            <Ionicons
              name={activeSegment === 'tasks' ? 'list' : 'list-outline'}
              size={14}
              color={activeSegment === 'tasks' ? Colors.brandNavy : Colors.textSecondary}
            />
            <Text style={[styles.segmentText, activeSegment === 'tasks' && styles.segmentTextActive]}>
              Tasks
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveSegment('performance')}
            style={[styles.segmentBtn, activeSegment === 'performance' && styles.segmentBtnActive]}
          >
            <Ionicons
              name={activeSegment === 'performance' ? 'ribbon' : 'ribbon-outline'}
              size={14}
              color={activeSegment === 'performance' ? Colors.brandNavy : Colors.textSecondary}
            />
            <Text style={[styles.segmentText, activeSegment === 'performance' && styles.segmentTextActive]}>
              Performance
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveSegment('attendance')}
            style={[styles.segmentBtn, activeSegment === 'attendance' && styles.segmentBtnActive]}
          >
            <Ionicons
              name={activeSegment === 'attendance' ? 'time' : 'time-outline'}
              size={14}
              color={activeSegment === 'attendance' ? Colors.brandNavy : Colors.textSecondary}
            />
            <Text style={[styles.segmentText, activeSegment === 'attendance' && styles.segmentTextActive]}>
              Attendance
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveSegment('maintenance')}
            style={[styles.segmentBtn, activeSegment === 'maintenance' && styles.segmentBtnActive]}
          >
            <Ionicons
              name={activeSegment === 'maintenance' ? 'construct' : 'construct-outline'}
              size={14}
              color={activeSegment === 'maintenance' ? Colors.brandNavy : Colors.textSecondary}
            />
            <Text style={[styles.segmentText, activeSegment === 'maintenance' && styles.segmentTextActive]}>
              Maint.
            </Text>
          </Pressable>
        </View>

        {cycleError && (
          <ErrorBanner message="Failed to load performance data" onRetry={onRefresh} />
        )}

        {isLoading ? (
          <View style={{ gap: 12 }}>
            {[1, 2, 3].map((k) => <SkeletonCard key={k} height={120} />)}
          </View>
        ) : (
          <>
            {/* ── Tab 1: Tasks ─────────────────────────────────────────── */}
            {activeSegment === 'tasks' && (
              <>
                {/* Today's Tasks Progress Card */}
                {totalTasks > 0 && (
                  <View style={styles.progressCard}>
                    <View style={styles.progressCardHeader}>
                      <Ionicons name="today" size={16} color={Colors.textTeal} />
                      <Text style={[Typography.labelCaps, { color: Colors.textSecondary, flex: 1 }]}>
                        TODAY'S PROGRESS
                      </Text>
                      <Text style={[Typography.badgeText, { color: Colors.textTeal }]}>
                        {doneTasks} / {totalTasks} COMPLETED
                      </Text>
                    </View>
                    <View style={styles.progressCardTrack}>
                      <View style={[styles.progressCardFill, { width: `${(doneTasks / totalTasks) * 100}%` }]} />
                    </View>
                  </View>
                )}

                {/* Daily Tasks List */}
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="list-outline" size={16} color={Colors.textSecondary} />
                    <Text style={[Typography.labelCaps, { color: Colors.textSecondary }]}>
                      TODAY'S TASKS
                    </Text>
                    <Text style={[Typography.caption, { color: Colors.textMuted, marginLeft: 'auto' }]}>
                      {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                    </Text>
                  </View>

                  {totalTasks === 0 ? (
                    <View style={styles.emptyTasks}>
                      <Ionicons name="checkmark-done-circle-outline" size={32} color={Colors.textMuted} />
                      <Text style={[Typography.bodySecondary, { color: Colors.textMuted, marginTop: 6 }]}>
                        No tasks assigned today
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: Spacing.sm }}>
                      <TaskGroup type="emergency"   tasks={emergencyTasks} />
                      <TaskGroup type="regular"     tasks={regularTasks} />
                      <TaskGroup type="non_regular" tasks={nonRegularTasks} />
                    </View>
                  )}
                </View>
              </>
            )}

            {/* ── Tab 2: Performance ───────────────────────────────────── */}
            {activeSegment === 'performance' && (
              <>
                {/* Active Cycle Banner */}
                {cycle ? (
                  <View style={styles.cycleBanner}>
                    <View style={styles.cycleBannerTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={[Typography.labelCaps, { color: Colors.textMuted }]}>
                          ACTIVE CYCLE
                        </Text>
                        <Text style={[Typography.h1Screen, { color: Colors.textPrimary, marginTop: 2 }]}>
                          {cycle.label}
                        </Text>
                        <Text style={[Typography.caption, { color: Colors.textSecondary, marginTop: 2 }]}>
                          {formatDate(cycle.start_date)} → {formatDate(cycle.end_date)}
                        </Text>
                      </View>

                      <View style={styles.daysBadge}>
                        <Text style={styles.daysBadgeNumber}>{days}</Text>
                        <Text style={styles.daysBadgeLabel}>days{'\n'}left</Text>
                      </View>
                    </View>

                    {/* Performance Group Card */}
                    {groupCfg ? (
                      <View style={[styles.groupCard, { backgroundColor: groupCfg.bg, borderColor: groupCfg.border }]}>
                        <View style={[styles.groupLetterCircle, { backgroundColor: groupCfg.text }]}>
                          <Text style={styles.groupLetterText}>{groupCfg.letter}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[Typography.labelCaps, { color: groupCfg.text, letterSpacing: 0.8 }]}>
                            PERFORMANCE GROUP
                          </Text>
                          <Text style={[styles.groupLabel, { color: groupCfg.text }]}>
                            {groupCfg.label}
                          </Text>
                          <Text style={[Typography.caption, { color: groupCfg.text, opacity: 0.75, marginTop: 2 }]}>
                            {groupCfg.desc}
                          </Text>
                        </View>
                        <Ionicons name={groupCfg.icon} size={28} color={groupCfg.text} style={{ opacity: 0.4 }} />
                      </View>
                    ) : (
                      <View style={styles.groupCardEmpty}>
                        <Ionicons name="hourglass-outline" size={20} color={Colors.textMuted} />
                        <Text style={[Typography.bodySecondary, { color: Colors.textMuted }]}>
                          No weekly score yet for this cycle
                        </Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.noCycleCard}>
                    <Ionicons name="ribbon-outline" size={32} color={Colors.textMuted} />
                    <Text style={[Typography.bodyPrimary, { color: Colors.textSecondary, marginTop: 8, textAlign: 'center' }]}>
                      No active appraisal cycle
                    </Text>
                    <Text style={[Typography.caption, { color: Colors.textMuted, textAlign: 'center' }]}>
                      Admin will activate one when the next sprint starts
                    </Text>
                  </View>
                )}

                {/* Weekly Scores Scroll view & Detailed Breakdown & Cycle Bonus Tracker */}
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="bar-chart-outline" size={16} color={Colors.textSecondary} />
                    <Text style={[Typography.labelCaps, { color: Colors.textSecondary }]}>
                      WEEKLY SCORES
                    </Text>
                  </View>

                  {!weeklyScores || weeklyScores.length === 0 ? (
                    <View style={styles.emptyTasks}>
                      <Ionicons name="analytics-outline" size={32} color={Colors.textMuted} />
                      <Text style={[Typography.bodySecondary, { color: Colors.textMuted, marginTop: 6 }]}>
                        No weekly scores yet
                      </Text>
                    </View>
                  ) : (
                    <>
                      {/* Horizontal week chips scroll */}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekScroll}>
                        <View style={styles.weekChipRow}>
                          {weeklyScores.map((ws) => <WeekChip key={ws.id} score={ws} />)}
                        </View>
                      </ScrollView>

                      {/* Detailed breakdown for the latest week */}
                      {latestScore && (
                        <View style={styles.breakdownCard}>
                          <Text style={[Typography.labelCaps, { color: Colors.textMuted, marginBottom: 10 }]}>
                            WEEK {latestScore.week_number} BREAKDOWN
                          </Text>
                          <BreakdownRow label="Regular Tasks"     value={latestScore.avg_stars_regular} />
                          <BreakdownRow label="Non-Regular Tasks" value={latestScore.avg_stars_non_regular} />
                          <BreakdownRow label="Emergency Tasks"   value={latestScore.avg_stars_emergency} />
                          <View style={styles.breakdownDivider} />
                          <View style={styles.breakdownTotalRow}>
                            <Text style={styles.breakdownTotalLabel}>Overall Average</Text>
                            <Text style={styles.breakdownTotalValue}>
                              {Number(latestScore.overall_avg).toFixed(2)} ★
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Bonus Eligibility Tracker */}
                      {totalWeeks > 0 && (
                        <View style={styles.bonusCard}>
                          <View style={styles.sectionHeader}>
                            <Ionicons name="gift-outline" size={14} color={Colors.textSecondary} />
                            <Text style={[Typography.labelCaps, { color: Colors.textSecondary }]}>
                              CYCLE BONUS TRACKER
                            </Text>
                          </View>

                          <View style={styles.bonusGroupRow}>
                            <BonusGroup letter="E" count={countE} total={totalWeeks} color="#047857" bg="#ECFDF5" />
                            <BonusGroup letter="M" count={countM} total={totalWeeks} color="#0891b2" bg="rgba(0,234,255,0.08)" />
                            <BonusGroup letter="A" count={countA} total={totalWeeks} color="#B45309" bg="#FFFBEB" />
                          </View>

                          {latestScore?.bonus_eligibility !== undefined && latestScore.bonus_eligibility > 0 && (
                            <View style={styles.bonusAmountRow}>
                              <Ionicons name="cash-outline" size={14} color={Colors.statusActive} />
                              <Text style={[Typography.bodySecondary, { color: Colors.statusActive, fontWeight: '700' }]}>
                                Projected Bonus: ₹{Number(latestScore.bonus_eligibility).toLocaleString('en-IN')}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </>
                  )}
                </View>
              </>
            )}

            {/* ── Tab 3: Attendance (Placeholder) ──────────────────────── */}
            {activeSegment === 'attendance' && (
              <View style={styles.sectionCard}>
                <View style={styles.attendancePlaceholder}>
                  <View style={styles.attendanceIconCircle}>
                    <Ionicons name="finger-print" size={32} color={Colors.textTeal} />
                  </View>
                  <Text style={[Typography.h1Screen, { color: Colors.textPrimary, marginTop: 12, textAlign: 'center' }]}>
                    Attendance Register
                  </Text>
                  <Text style={[Typography.bodySecondary, { color: Colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 }]}>
                    The digital shift register and biometric clock-in are currently under development. Soon you will be able to mark daily shifts, log break hours, and track ZAP Point operational timelines directly.
                  </Text>
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonText}>COMING SOON</Text>
                  </View>
                </View>
              </View>
            )}

            {/* ── Tab 4: Maintenance (Placeholder) ─────────────────────── */}
            {activeSegment === 'maintenance' && (
              <View style={styles.sectionCard}>
                <View style={styles.attendancePlaceholder}>
                  <View style={styles.attendanceIconCircle}>
                    <Ionicons name="construct" size={32} color={Colors.textTeal} />
                  </View>
                  <Text style={[Typography.h1Screen, { color: Colors.textPrimary, marginTop: 12, textAlign: 'center' }]}>
                    Maintenance Desk
                  </Text>
                  <Text style={[Typography.bodySecondary, { color: Colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 }]}>
                    The active vehicle workshop board, mechanic job scheduling, and spare parts inventory registry are currently under development. Soon you will be able to create, resolve, and audit vehicle repair tickets directly.
                  </Text>
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonText}>COMING SOON</Text>
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BreakdownRow({ label, value }: { label: string; value: number }) {
  const filled = Math.round(Number(value));
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <View style={styles.breakdownStars}>
        {[1, 2, 3, 4, 5].map((s) => (
          <Ionicons key={s} name={s <= filled ? 'star' : 'star-outline'} size={11} color={s <= filled ? '#F59E0B' : Colors.borderInput} />
        ))}
      </View>
      <Text style={styles.breakdownValue}>{Number(value).toFixed(1)}</Text>
    </View>
  );
}

function BonusGroup({
  letter,
  count,
  total,
  color,
  bg,
}: {
  letter: string;
  count: number;
  total: number;
  color: string;
  bg: string;
}) {
  const pct = total > 0 ? count / total : 0;
  return (
    <View style={[styles.bonusGroupItem, { backgroundColor: bg }]}>
      <View style={[styles.bonusGroupLetter, { backgroundColor: color }]}>
        <Text style={styles.bonusGroupLetterText}>{letter}</Text>
      </View>
      <Text style={[styles.bonusGroupCount, { color }]}>{count}</Text>
      <Text style={[Typography.caption, { color, opacity: 0.7 }]}>week{count !== 1 ? 's' : ''}</Text>
      <View style={styles.bonusGroupBar}>
        <View style={[styles.bonusGroupFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bgApp },
  scroll:  { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 40 },

  screenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  // ── Cycle Banner ─────────────────────────────────────────────────────────
  cycleBanner: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cycleBannerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  daysBadge: {
    alignItems: 'center',
    backgroundColor: Colors.brandTealSubtle,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 56,
  },
  daysBadgeNumber: {
    ...Typography.h1Screen,
    color: Colors.brandTeal,
    fontSize: 28,
    lineHeight: 32,
  },
  daysBadgeLabel: {
    ...Typography.caption,
    color: Colors.brandTeal,
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 13,
  },

  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    padding: Spacing.sm + 2,
  },
  groupLetterCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupLetterText: {
    fontSize: 22,
    fontFamily: 'Nunito-Black',
    fontWeight: '900',
    color: '#FFFFFF',
  },
  groupLabel: {
    ...Typography.bodyPrimary,
    fontWeight: '700',
    marginTop: 1,
  },
  groupCardEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },

  taskQuickBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  taskQuickBarProgress: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.borderLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  taskQuickBarFill: {
    height: '100%',
    backgroundColor: Colors.brandTeal,
    borderRadius: 2,
  },

  noCycleCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: 4,
  },

  // ── Sections ─────────────────────────────────────────────────────────────
  sectionCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // ── Task Group ────────────────────────────────────────────────────────────
  taskGroup: {
    gap: 6,
  },
  taskGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  taskGroupLabel: {
    ...Typography.labelCaps,
    fontSize: 10,
  },
  taskGroupCount: {
    borderRadius: Radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  taskGroupCountText: {
    ...Typography.badgeText,
    fontSize: 10,
  },

  // ── Task Card ─────────────────────────────────────────────────────────────
  taskCard: {
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
    minHeight: 52,
  },
  taskCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    paddingLeft: 0,
    minHeight: 52,
  },
  taskStrip: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    minHeight: 36,
  },
  taskChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  taskChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  taskChipText: {
    ...Typography.badgeText,
    fontSize: 9,
  },
  overrideBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.surfaceRed,
    borderRadius: Radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  overrideBadgeText: {
    ...Typography.badgeText,
    fontSize: 9,
    color: Colors.statusError,
  },
  taskName: {
    ...Typography.bodyPrimary,
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  starRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  pendingRating: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  remarksBox: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    padding: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    gap: 3,
  },
  remarksLabel: {
    ...Typography.labelCaps,
    color: Colors.textMuted,
    fontSize: 9,
  },
  remarksText: {
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  emptyTasks: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: 4,
  },

  // ── Profile / Back button ──────────────────────────────────────────────────
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceTeal,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.brandTeal,
    shadowColor: Colors.brandTeal,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },

  // ── Segmented Switcher ─────────────────────────────────────────────────────
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: Radius.button,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.button - 2,
    backgroundColor: 'transparent',
  },
  segmentBtnActive: {
    backgroundColor: Colors.brandTeal,
    shadowColor: Colors.brandTeal,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    ...Typography.badgeText,
    color: Colors.textSecondary,
    fontSize: 12,
  },
  segmentTextActive: {
    color: Colors.brandNavy,
    fontWeight: '800',
  },

  // ── Tasks Progress Card ────────────────────────────────────────────────────
  progressCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  progressCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressCardTrack: {
    height: 6,
    backgroundColor: Colors.borderLight,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  progressCardFill: {
    height: '100%',
    backgroundColor: Colors.brandTeal,
    borderRadius: Radius.pill,
  },

  // ── Attendance Placeholder ─────────────────────────────────────────────────
  attendancePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  attendanceIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceTeal,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.brandTeal,
  },
  comingSoonBadge: {
    backgroundColor: Colors.brandTealSubtle,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.brandTeal,
  },
  comingSoonText: {
    ...Typography.badgeText,
    color: Colors.textTeal,
    fontSize: 10,
  },

  // ── Weekly Scores ─────────────────────────────────────────────────────────
  weekScroll: {
    marginHorizontal: -Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  weekChipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingBottom: 4,
    paddingRight: Spacing.md,
  },
  weekChip: {
    alignItems: 'center',
    borderRadius: Radius.card,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 72,
    gap: 4,
  },
  weekChipWeek: {
    ...Typography.labelCaps,
    fontSize: 10,
  },
  weekChipAvg: {
    ...Typography.h1Screen,
    fontSize: 20,
    lineHeight: 24,
  },
  weekChipBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  weekChipBadgeText: {
    ...Typography.badgeText,
    color: '#FFFFFF',
    fontSize: 10,
  },

  // ── Breakdown Card ────────────────────────────────────────────────────────
  breakdownCard: {
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    gap: 6,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  breakdownLabel: {
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
    flex: 1,
  },
  breakdownStars: {
    flexDirection: 'row',
    gap: 2,
  },
  breakdownValue: {
    ...Typography.badgeText,
    color: Colors.textPrimary,
    width: 30,
    textAlign: 'right',
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 2,
  },
  breakdownTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownTotalLabel: {
    ...Typography.bodyPrimary,
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  breakdownTotalValue: {
    ...Typography.h1Screen,
    color: Colors.brandTeal,
    fontSize: 18,
  },

  // ── Bonus Tracker ─────────────────────────────────────────────────────────
  bonusCard: {
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  bonusGroupRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  bonusGroupItem: {
    flex: 1,
    alignItems: 'center',
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    gap: 3,
  },
  bonusGroupLetter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bonusGroupLetterText: {
    fontSize: 16,
    fontFamily: 'Nunito-Black',
    fontWeight: '900',
    color: '#FFFFFF',
  },
  bonusGroupCount: {
    ...Typography.h1Screen,
    fontSize: 22,
    lineHeight: 26,
  },
  bonusGroupBar: {
    width: '100%',
    height: 4,
    backgroundColor: Colors.borderLight,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  bonusGroupFill: {
    height: '100%',
    borderRadius: 2,
  },
  bonusAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceGreen,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
});
