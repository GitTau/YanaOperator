import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { NotificationItem, useCaptainByStore, useMyNotifications } from '../../src/hooks/useQueries';
import { markAllNotificationsAsRead, markNotificationAsRead } from '../../src/services/bookingService';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';

type FilterSegment = 'all' | 'unread' | 'task';

export default function NotificationsScreen() {
  const { selectedStore } = useStoreSelectionStore();
  const storeId = selectedStore?.store_id ?? null;
  const { data: captain } = useCaptainByStore(storeId);
  const captainId = captain?.id ?? null;

  const { data: notifications, isLoading, refetch, isRefetching } = useMyNotifications(storeId, captainId);
  const [filter, setFilter] = useState<FilterSegment>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = useMemo(() => {
    return notifications?.filter((n) => !n.is_read).length ?? 0;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (!notifications) return [];
    if (filter === 'unread') return notifications.filter((n) => !n.is_read);
    if (filter === 'task') return notifications.filter((n) => n.type === 'task');
    return notifications;
  }, [notifications, filter]);

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsAsRead(storeId, captainId);
      refetch();
    } catch (err) {
      console.warn('Failed to mark all as read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleItemPress = async (item: NotificationItem) => {
    if (!item.is_read) {
      try {
        await markNotificationAsRead(item.id);
        refetch();
      } catch (err) {
        console.warn('Failed to mark item read:', err);
      }
    }

    if (item.data?.segment === 'tasks') {
      router.push('/(app)/performance?segment=tasks');
    } else if (item.data?.route) {
      router.push(item.data.route);
    }
  };

  const handleSingleMarkRead = async (id: string) => {
    try {
      await markNotificationAsRead(id);
      refetch();
    } catch (err) {
      console.warn('Failed to mark item read:', err);
    }
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const isUnread = !item.is_read;
    let iconName: React.ComponentProps<typeof Ionicons>['name'] = 'notifications-outline';
    let iconBg = Colors.surfaceTeal;
    let iconColor = Colors.brandTealDim;

    if (item.type === 'task') {
      iconName = 'checkbox-outline';
      iconBg = '#ECFDF5';
      iconColor = '#059669';
    } else if (item.type === 'alert' || item.type === 'emergency') {
      iconName = 'alert-circle-outline';
      iconBg = '#FFF1F2';
      iconColor = '#E11D48';
    } else if (item.type === 'maintenance') {
      iconName = 'construct-outline';
      iconBg = '#FFFBEB';
      iconColor = '#D97706';
    }

    return (
      <Pressable
        onPress={() => handleItemPress(item)}
        style={({ pressed }) => [
          styles.card,
          isUnread && styles.cardUnread,
          pressed && { opacity: 0.8 },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName} size={18} color={iconColor} />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
                {item.title}
              </Text>
              {isUnread && <View style={styles.unreadDot} />}
            </View>
            <Text style={styles.bodyText}>{item.body}</Text>
            <View style={styles.footerRow}>
              <Text style={styles.timestamp}>{formatTimestamp(item.created_at)}</Text>
              {isUnread && (
                <Pressable
                  onPress={() => handleSingleMarkRead(item.id)}
                  style={({ pressed }) => [styles.markReadBtn, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="checkmark-done" size={12} color={Colors.brandTealDim} style={{ marginRight: 2 }} />
                  <Text style={styles.markReadText}>Mark read</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.topBar}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="notifications" size={20} color={Colors.brandTealDim} style={{ marginRight: 6 }} />
          <Text style={styles.headerTitle}>Notification Center</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount} Unread</Text>
            </View>
          )}
        </View>

        {unreadCount > 0 && (
          <Pressable
            onPress={handleMarkAllRead}
            disabled={markingAll}
            style={({ pressed }) => [styles.markAllBtn, pressed && { opacity: 0.7 }]}
          >
            {markingAll ? (
              <ActivityIndicator size="small" color={Colors.brandTealDim} />
            ) : (
              <>
                <Ionicons name="checkmark-done-circle-outline" size={15} color={Colors.brandTealDim} style={{ marginRight: 4 }} />
                <Text style={styles.markAllText}>Mark all as read</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      {/* Filter Switcher */}
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setFilter('all')}
          style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            All ({notifications?.length ?? 0})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setFilter('unread')}
          style={[styles.filterChip, filter === 'unread' && styles.filterChipActive]}
        >
          <Text style={[styles.filterText, filter === 'unread' && styles.filterTextActive]}>
            Unread ({unreadCount})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setFilter('task')}
          style={[styles.filterChip, filter === 'task' && styles.filterChipActive]}
        >
          <Text style={[styles.filterText, filter === 'task' && styles.filterTextActive]}>
            Tasks
          </Text>
        </Pressable>
      </View>

      {/* Content list */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.brandTealDim} />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      ) : filteredNotifications.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="notifications-off-outline" size={36} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No Notifications</Text>
          <Text style={styles.emptyBody}>
            {filter === 'unread'
              ? 'You have read all your notifications!'
              : 'Tasks and system alerts will appear here when assigned.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.brandTealDim}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgApp,
  },
  topBar: {
    backgroundColor: Colors.surfaceCard,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.subtitle,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  unreadBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    marginLeft: 8,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E11D48',
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceTeal,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: `${Colors.brandTealDim}30`,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.brandTealDim,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  filterChipActive: {
    backgroundColor: Colors.brandNavy,
    borderColor: Colors.brandNavy,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  cardUnread: {
    backgroundColor: '#FFFFFF',
    borderColor: `${Colors.brandTealDim}50`,
    borderLeftWidth: 4,
    borderLeftColor: Colors.brandTealDim,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardBody: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },
  titleUnread: {
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brandTealDim,
    marginLeft: 6,
  },
  bodyText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timestamp: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  markReadText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.brandTealDim,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: Colors.textMuted,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceCard,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  emptyBody: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 18,
  },
});
