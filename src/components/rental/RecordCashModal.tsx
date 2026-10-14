// ─────────────────────────────────────────────────────────────────────────────
// RecordCashModal — "Collect cash" bottom sheet. Opens with the exact amount due
// filled in, plus quick chips (Full / ₹1,000 / ₹500). One idempotency key per
// opening, so a double tap or retry never records the same cash twice.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors, Typography } from '../../constants/design';
import { newIdempotencyKey } from '../../services/rentalEngineService';
import { DeskButton } from './DeskCard';
import { DeskSheet } from './DeskSheet';

interface RecordCashModalProps {
  visible: boolean;
  riderName: string;
  suggestedPaise: number;
  busy: boolean;
  errorText: string | null;
  onCancel: () => void;
  onConfirm: (amountPaise: number, idempotencyKey: string, note: string) => void;
}

export function RecordCashModal({ visible, riderName, suggestedPaise, busy, errorText, onCancel, onConfirm }: RecordCashModalProps) {
  const [amount, setAmount] = useState('');
  const key = useMemo(() => (visible ? newIdempotencyKey() : ''), [visible]);
  const full = Math.round(suggestedPaise / 100);

  useEffect(() => {
    if (visible) setAmount(full > 0 ? String(full) : '');
  }, [visible, full]);

  const value = /^\d{1,6}$/.test(amount) ? Number(amount) : 0;
  const chips = Array.from(new Set([full, 1000, 500].filter((x) => x > 0)));

  return (
    <DeskSheet visible={visible} onClose={onCancel} title={`Collect cash · ${riderName.split(' ')[0] ?? riderName}`} subtitle="Clears fines first, then security, then rent.">
      <TextInput
        value={value ? `₹${value.toLocaleString('en-IN')}` : ''}
        onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, '').slice(0, 6))}
        keyboardType="number-pad"
        placeholder="₹0"
        placeholderTextColor={Colors.textMuted}
        style={styles.amount}
        accessibilityLabel="Cash amount in rupees"
      />
      <View style={styles.chips}>
        {chips.map((x) => (
          <Pressable
            key={x}
            onPress={() => setAmount(String(x))}
            style={({ pressed }) => [styles.chip, value === x && styles.chipOn, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
            accessibilityRole="button"
          >
            <Text style={[Typography.buttonSecondary, { color: Colors.textPrimary }]}>{x === full ? 'Full ' : ''}₹{x.toLocaleString('en-IN')}</Text>
          </Pressable>
        ))}
      </View>
      {errorText && <Text style={[Typography.bodySecondary, { color: Colors.textError, marginTop: 8 }]}>{errorText}</Text>}
      <View style={styles.row}>
        <DeskButton label="Cancel" kind="ghost" onPress={onCancel} disabled={busy} />
        <DeskButton
          label={value ? `Collect ₹${value.toLocaleString('en-IN')}` : 'Collect'}
          kind="orange"
          onPress={() => onConfirm(value * 100, key, '')}
          disabled={!value}
          loading={busy}
        />
      </View>
    </DeskSheet>
  );
}

const styles = StyleSheet.create({
  amount: {
    fontSize: 40, fontWeight: '900', fontFamily: 'Nunito-Black', color: Colors.textPrimary,
    borderBottomWidth: 2, borderBottomColor: Colors.brandTeal, paddingVertical: 6, marginTop: 6,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { borderWidth: 1, borderColor: Colors.borderInput, borderRadius: 100, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  chipOn: { borderColor: Colors.brandTeal, backgroundColor: Colors.brandTealSubtle },
  row: { flexDirection: 'row', gap: 8, marginTop: 16 },
});
