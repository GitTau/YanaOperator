import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/design';

interface CalendarModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
}

const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
};

export function CalendarModal({ visible, onClose, selectedDate, onSelectDate }: CalendarModalProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    // Parse selected date or fallback to today
    const parsed = new Date(selectedDate);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth(); // 0-indexed

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekdayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const todayStr = formatDate(new Date());

  // Generate days grid
  const cells: { dayNum: number | null; dateString: string | null }[] = [];

  // Padding cells before start of month
  for (let i = 0; i < firstDayIndex; i++) {
    cells.push({ dayNum: null, dateString: null });
  }

  // Days of the month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ dayNum: d, dateString });
  }

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const handleSelectDay = (dateString: string) => {
    onSelectDate(dateString);
    onClose();
  };

  if (!visible) return null;

  return (
    <View style={styles.backdrop}>
      <View style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Select Start Date</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {/* Month selector */}
        <View style={styles.monthSelector}>
          <Pressable onPress={handlePrevMonth} hitSlop={8} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthNames[month]} {year}</Text>
          <Pressable onPress={handleNextMonth} hitSlop={8} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
          </Pressable>
        </View>

        {/* Weekday labels */}
        <View style={styles.weekdayRow}>
          {weekdayNames.map((day, idx) => (
            <Text key={idx} style={styles.weekdayLabel}>{day}</Text>
          ))}
        </View>

        {/* Days Grid */}
        <View style={styles.grid}>
          {cells.map((cell, idx) => {
            if (cell.dayNum === null || cell.dateString === null) {
              return <View key={`empty-${idx}`} style={styles.gridCell} />;
            }

            const isSelected = cell.dateString === selectedDate;
            const isToday = cell.dateString === todayStr;

            return (
              <Pressable
                key={cell.dateString}
                style={styles.gridCell}
                onPress={() => handleSelectDay(cell.dateString!)}
              >
                <View
                  style={[
                    styles.dayCircle,
                    isSelected && styles.dayCircleSelected,
                    isToday && !isSelected && styles.dayCircleToday,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isSelected && styles.dayTextSelected,
                      isToday && !isSelected && styles.dayTextToday,
                    ]}
                  >
                    {cell.dayNum}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <Pressable
            style={styles.todayBtn}
            onPress={() => {
              onSelectDate(todayStr);
              setCurrentMonth(new Date());
              onClose();
            }}
          >
            <Text style={styles.todayBtnText}>Reset to Today</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 28, 46, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
    zIndex: 9999,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.modal,
    padding: Spacing.md,
    shadowColor: Colors.brandNavy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.bodyPrimary,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  closeButton: {
    padding: 2,
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.sm,
    paddingVertical: 6,
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.md,
  },
  navBtn: {
    padding: 6,
  },
  monthLabel: {
    ...Typography.bodyPrimary,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekdayLabel: {
    width: '14.28%',
    textAlign: 'center',
    ...Typography.caption,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridCell: {
    width: '14.28%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: {
    backgroundColor: Colors.brandTeal,
  },
  dayCircleToday: {
    borderWidth: 1.5,
    borderColor: Colors.brandTeal,
  },
  dayText: {
    ...Typography.bodyPrimary,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  dayTextSelected: {
    color: Colors.brandNavy,
    fontWeight: '800',
  },
  dayTextToday: {
    color: Colors.brandTeal,
    fontWeight: '700',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: Spacing.sm,
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  todayBtn: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
  },
  todayBtnText: {
    ...Typography.buttonSecondary,
    color: Colors.brandTeal,
    fontWeight: '700',
  },
});
