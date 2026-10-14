// ─────────────────────────────────────────────────────────────────────────────
// ReceiveReturnModal — a scooter comes back to THIS ZAP Point (D-017). Type the
// scooter number, tick "here and checked", confirm. Own-store rentals close at
// once; other stores' go to their Captain for approval (D-026).
// ─────────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors, Typography } from '../../constants/design';
import { rentalErrorText } from '../../hooks/useRentalEngine';
import { newIdempotencyKey, rentalEngine, RentalCommandError, type PlateLookup } from '../../services/rentalEngineService';
import { DeskButton, DeskPill } from './DeskCard';
import { DeskSheet } from './DeskSheet';

interface ReceiveReturnModalProps {
  visible: boolean;
  busy: boolean;
  errorText: string | null;
  onCancel: () => void;
  onConfirm: (bookingId: string, idempotencyKey: string) => void;
}

export function ReceiveReturnModal({ visible, busy, errorText, onCancel, onConfirm }: ReceiveReturnModalProps) {
  const [plate, setPlate] = useState('');
  const [found, setFound] = useState<PlateLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [checked, setChecked] = useState(false);
  const key = useMemo(() => (visible ? newIdempotencyKey() : ''), [visible]);

  useEffect(() => { if (visible) { setPlate(''); setFound(null); setLookupError(null); setChecked(false); } }, [visible]);

  const search = async () => {
    if (plate.length < 3) return;
    setSearching(true); setLookupError(null); setFound(null); setChecked(false);
    try {
      setFound(await rentalEngine.findRentalByPlate(plate));
    } catch (e) {
      setLookupError(rentalErrorText(e instanceof RentalCommandError ? e : new RentalCommandError('unknown', String(e))));
    } finally {
      setSearching(false);
    }
  };

  return (
    <DeskSheet visible={visible} onClose={onCancel} title="Receive a returned scooter">
      <View style={styles.searchRow}>
        <TextInput
          value={plate}
          onChangeText={(t) => { setPlate(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)); setFound(null); }}
          autoCapitalize="characters"
          placeholder="Scooter no. e.g. XEM44"
          placeholderTextColor={Colors.textMuted}
          style={[styles.input, Typography.bodyPrimary]}
          onSubmitEditing={search}
          returnKeyType="search"
          accessibilityLabel="Scooter number"
        />
        <DeskButton label="Find" kind="teal" onPress={search} loading={searching} disabled={plate.length < 3} style={{ flex: 0, paddingHorizontal: 20 }} />
      </View>
      {lookupError && <Text style={[Typography.bodySecondary, { color: Colors.textError, marginTop: 6 }]}>{lookupError}</Text>}

      {found && (
        <>
          <View style={styles.found}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{found.plate} · {found.riderFirstName}</Text>
              <Text style={[Typography.bodySecondary, { color: Colors.textSecondary }]}>Booked at {found.bookingStoreName || 'another store'}</Text>
            </View>
            <DeskPill label={found.isMyStore ? 'YOUR STORE' : 'OTHER STORE'} kind={found.isMyStore ? 'green' : 'blue'} />
          </View>
          <Pressable
            onPress={() => setChecked((c) => !c)}
            style={[styles.tick, checked && styles.tickOn]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
          >
            <View style={[styles.box, checked && styles.boxOn]}>{checked && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}</View>
            <Text style={[Typography.bodyPrimary, { color: Colors.textPrimary, fontWeight: '700' }]}>Scooter & battery are here, checked</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <DeskButton
              big
              kind="green"
              label={found.isMyStore ? 'Close rental' : `Send to ${found.bookingStoreName || 'booking store'} for approval`}
              disabled={!checked}
              loading={busy}
              onPress={() => onConfirm(found.bookingId, key)}
            />
          </View>
        </>
      )}
      {errorText && <Text style={[Typography.bodySecondary, { color: Colors.textError, marginTop: 8 }]}>{errorText}</Text>}
    </DeskSheet>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  input: {
    flex: 1, borderWidth: 1, borderColor: Colors.borderInput, borderRadius: 12, paddingHorizontal: 12, minHeight: 48,
    color: Colors.textPrimary, backgroundColor: Colors.surfaceCard,
  },
  found: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 14, borderRadius: 14,
    borderWidth: 1, borderColor: '#ECEEF4', backgroundColor: Colors.bgApp,
  },
  name: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  tick: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, marginTop: 10, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1.5, borderColor: Colors.borderLight,
  },
  tickOn: { borderColor: Colors.statusActive, backgroundColor: Colors.surfaceGreen },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.statusActive, borderColor: Colors.statusActive },
});
