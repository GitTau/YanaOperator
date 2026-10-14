// Small "write a reason" dialog (Alert.prompt only exists on iOS). Used where the server requires a
// written reason: rejecting a KYC check (the rider sees it), an Admin Aadhaar override.
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/design';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  /** Minimum characters the server will accept. */
  minLength?: number;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function ReasonModal({ visible, title, message, confirmLabel, minLength = 3, destructive, onCancel, onConfirm }: Props) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (visible) setText('');
  }, [visible]);
  const ok = text.trim().length >= minLength;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write the reason"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            multiline
            maxLength={300}
            autoFocus
            accessibilityLabel="Reason"
          />
          <View style={styles.row}>
            <Pressable onPress={onCancel} style={[styles.btn, styles.btnGhost]} accessibilityRole="button">
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!ok}
              onPress={() => onConfirm(text.trim())}
              style={[styles.btn, destructive ? styles.btnDanger : styles.btnPrimary, !ok && { opacity: 0.4 }]}
              accessibilityRole="button"
            >
              <Text style={destructive ? styles.btnDangerText : styles.btnPrimaryText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.lg },
  sheet: { backgroundColor: Colors.surfaceCard, borderRadius: Radius.card, padding: Spacing.lg },
  title: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  message: { fontSize: 13, color: Colors.textSecondary, marginTop: 6, lineHeight: 18 },
  input: {
    minHeight: 84,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderInput,
    borderRadius: Radius.sm,
    padding: Spacing.sm + 2,
    textAlignVertical: 'top',
    color: Colors.textPrimary,
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  btn: { flex: 1, minHeight: 48, borderRadius: Radius.button, justifyContent: 'center', alignItems: 'center' },
  btnGhost: { borderWidth: 1, borderColor: Colors.borderInput },
  btnGhostText: { ...Typography.buttonSecondary, color: Colors.textSecondary },
  btnPrimary: { backgroundColor: Colors.brandTeal },
  btnPrimaryText: { ...Typography.buttonPrimary, color: Colors.brandNavy },
  btnDanger: { backgroundColor: Colors.statusError },
  btnDangerText: { ...Typography.buttonPrimary, color: '#FFFFFF' },
});
