// ─────────────────────────────────────────────────────────────────────────────
// PurchaseRequestModal.tsx — Raise Store Parts Replenishment Request
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/design';
import { usePartsCatalog } from '../../hooks/useQueries';
import { createPurchaseRequestService } from '../../services/bookingService';

interface PurchaseRequestModalProps {
  visible: boolean;
  storeId: string;
  initialPartId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function PurchaseRequestModal({
  visible,
  storeId,
  initialPartId,
  onClose,
  onSuccess,
}: PurchaseRequestModalProps) {
  const [selectedPartId, setSelectedPartId] = useState<string>(initialPartId ?? '');
  const [quantity, setQuantity] = useState('5');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: allParts, isLoading: partsLoading } = usePartsCatalog();

  const handleSubmit = async () => {
    const pId = selectedPartId || initialPartId;
    if (!pId) {
      Alert.alert('Part Required', 'Please select which component needs to be ordered.');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      Alert.alert('Quantity Required', 'Please enter a valid order quantity.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createPurchaseRequestService(storeId, pId, qty, reason || null);
      Alert.alert('Request Submitted', 'Purchase request raised for Admin approval.');
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Request Failed', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Raise Purchase Request</Text>
              <Text style={styles.subtitle}>Request store stock replenishment from Admin</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {/* Part Selection */}
            <Text style={styles.label}>Select Part to Order</Text>
            {partsLoading ? (
              <ActivityIndicator color={Colors.brandTeal} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.partsScroll}>
                {(allParts ?? []).map((p) => {
                  const isSel = (selectedPartId || initialPartId) === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      style={[styles.partChip, isSel && styles.partChipActive]}
                      onPress={() => setSelectedPartId(p.id)}
                    >
                      <Text style={[styles.partChipText, isSel && styles.partChipTextActive]}>
                        {p.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Quantity */}
            <View style={{ marginTop: 14 }}>
              <Text style={styles.label}>Quantity Requested</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
                placeholder="5"
              />
            </View>

            {/* Justification / Reason */}
            <View style={{ marginTop: 14 }}>
              <Text style={styles.label}>Reason / Urgency Notes</Text>
              <TextInput
                style={styles.textArea}
                placeholder="e.g. Zero stock in store, 2 bikes waiting for brake shoes..."
                placeholderTextColor={Colors.textMuted}
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Submit */}
            <Pressable
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
              disabled={isSubmitting}
              onPress={handleSubmit}
            >
              {isSubmitting ? (
                <ActivityIndicator color={Colors.brandNavy} size="small" />
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={16} color={Colors.brandNavy} style={{ marginRight: 6 }} />
                  <Text style={styles.submitBtnText}>Submit to Admin</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,28,46,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surfaceCard,
    borderTopLeftRadius: Radius.modal,
    borderTopRightRadius: Radius.modal,
    maxHeight: '85%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: Spacing.md,
  },
  label: {
    ...Typography.labelCaps,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  partsScroll: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  partChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginRight: 8,
  },
  partChipActive: {
    backgroundColor: Colors.brandTeal,
    borderColor: Colors.brandTeal,
  },
  partChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  partChipTextActive: {
    color: Colors.brandNavy,
    fontWeight: '800',
  },
  textInput: {
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.input,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  textArea: {
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.input,
    padding: 10,
    fontSize: 13,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandTeal,
    height: 44,
    borderRadius: Radius.button,
    marginTop: 20,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.brandNavy,
  },
});
