// ─────────────────────────────────────────────────────────────────────────────
// AssetPickerModal — resume a paused rental: tap a free scooter and a free
// battery at this ZAP Point, then one button hands them over. No scooter is held
// during a pause (D-023); the server re-checks both are still free.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Typography } from '../../constants/design';
import { useBatteries, useVehicles } from '../../hooks/useQueries';
import { DeskButton } from './DeskCard';
import { DeskSheet } from './DeskSheet';

interface AssetPickerModalProps {
  visible: boolean;
  storeId: string | null;
  riderName: string;
  busy: boolean;
  errorText: string | null;
  onCancel: () => void;
  onConfirm: (vehicleId: string, batteryId: string) => void;
}

interface Choice { id: string; label: string }

function Grid({ title, items, selected, onSelect }: { title: string; items: Choice[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={[Typography.labelCaps, { color: Colors.textMuted, marginBottom: 6 }]}>{title}</Text>
      {items.length === 0 ? (
        <Text style={[Typography.bodySecondary, { color: Colors.textMuted }]}>None free at this ZAP Point</Text>
      ) : (
        <View style={styles.grid}>
          {items.map((i) => {
            const on = i.id === selected;
            return (
              <Pressable
                key={i.id}
                onPress={() => onSelect(i.id)}
                style={({ pressed }) => [styles.opt, on && styles.optOn, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={[Typography.buttonSecondary, { color: Colors.textPrimary }]}>{i.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function AssetPickerModal({ visible, storeId, riderName, busy, errorText, onCancel, onConfirm }: AssetPickerModalProps) {
  const { data: vehicles } = useVehicles(visible ? storeId : null);
  const { data: batteries } = useBatteries(visible ? storeId : null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [batteryId, setBatteryId] = useState<string | null>(null);
  useEffect(() => { if (visible) { setVehicleId(null); setBatteryId(null); } }, [visible]);

  const scooters = useMemo<Choice[]>(() => (vehicles ?? []).filter((v) => v.status === 'Available').map((v) => ({ id: v.id, label: v.plate_number })), [vehicles]);
  const packs = useMemo<Choice[]>(() => (batteries ?? []).filter((b) => b.status === 'Available').map((b) => ({ id: b.id, label: b.serial_number })), [batteries]);
  const sLabel = scooters.find((s) => s.id === vehicleId)?.label;
  const bLabel = packs.find((b) => b.id === batteryId)?.label;

  return (
    <DeskSheet visible={visible} onClose={onCancel} title={`Resume ${riderName.split(' ')[0] ?? riderName}`} subtitle="Pick any free scooter and battery here.">
      <Grid title="SCOOTER" items={scooters} selected={vehicleId} onSelect={setVehicleId} />
      <Grid title="BATTERY" items={packs} selected={batteryId} onSelect={setBatteryId} />
      {errorText && <Text style={[Typography.bodySecondary, { color: Colors.textError, marginTop: 8 }]}>{errorText}</Text>}
      <View style={{ flexDirection: 'row', marginTop: 16 }}>
        <DeskButton
          big
          kind="teal"
          label={sLabel && bLabel ? `Hand over ${sLabel} + ${bLabel}` : 'Pick a scooter and a battery'}
          disabled={!vehicleId || !batteryId}
          loading={busy}
          onPress={() => vehicleId && batteryId && onConfirm(vehicleId, batteryId)}
        />
      </View>
    </DeskSheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: {
    width: '48%', minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.borderLight,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceCard,
  },
  optOn: { borderColor: Colors.brandTeal, backgroundColor: Colors.brandTealSubtle },
});
