// ─────────────────────────────────────────────────────────────────────────────
// DeskSheet — fast bottom sheet used by every Rental Desk action.
// Slides up quickly, closes on backdrop tap or back button, lifts above keyboard.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing, Typography } from '../../constants/design';

interface DeskSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Optional control at the right of the title (e.g. "All OK"). */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export function DeskSheet({ visible, title, subtitle, onClose, headerRight, children }: DeskSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.grab} />
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              {subtitle ? <Text style={[Typography.caption, { color: Colors.textMuted, marginTop: 2 }]}>{subtitle}</Text> : null}
            </View>
            {headerRight}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: {
    backgroundColor: Colors.surfaceCard, borderTopLeftRadius: Radius.modal, borderTopRightRadius: Radius.modal,
    paddingHorizontal: Spacing.md, paddingTop: 8, maxHeight: '90%',
  },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderInput, alignSelf: 'center', marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 19, fontWeight: '800', color: Colors.textPrimary, fontFamily: 'Nunito-ExtraBold' },
});
