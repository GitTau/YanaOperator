// ─────────────────────────────────────────────────────────────────────────────
// Profile Screen — YanaOperator
// Displays: Captain identity, Operator ID, Store assignment, Performance snapshot,
// Password change capability, App runtime details, and Sign Out.
// Strictly uses design tokens from src/constants/design.ts and Ionicons.
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../src/constants/design';
import { useAuthStore } from '../../src/stores/authStore';
import { useStoreSelectionStore } from '../../src/stores/storeSelectionStore';
import { useCaptainByStore } from '../../src/hooks/useQueries';
import { supabase } from '../../src/lib/supabase';

export default function ProfileScreen() {
  const { user, profile, captain: storeCaptain, signOut } = useAuthStore();
  const { selectedStore } = useStoreSelectionStore();
  const storeId = selectedStore?.store_id ?? null;

  // Fetch live captain metrics & store details
  const { data: storeAssignedCaptain } = useCaptainByStore(storeId);
  const captain = storeCaptain || storeAssignedCaptain;

  // Change Password state
  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const getInitials = (name?: string) => {
    if (!name) return 'CP';
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Invalid Password', 'New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match. Please re-enter.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      Alert.alert('Success', 'Your password has been updated successfully.');
      setChangePasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update password.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Confirm Sign Out',
      'Are you sure you want to end your session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top App Header with Back Arrow */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.topBarTitle}>Operator Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Hero Identity Card ────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.heroRow}>
            <View style={styles.avatarWrap}>
              <Text style={styles.avatarText}>{getInitials(captain?.name)}</Text>
            </View>

            <View style={styles.heroDetails}>
              <Text style={styles.captainName} numberOfLines={1}>
                {captain?.name || 'Store Operator'}
              </Text>

              {/* Operator ID Pill */}
              <View style={styles.idRow}>
                <Ionicons name="key-outline" size={13} color={Colors.textTeal} style={{ marginRight: 4 }} />
                <Text style={styles.idText}>
                  ID: <Text style={styles.idTextHighlight}>{captain?.login_id || 'UNSET'}</Text>
                </Text>
              </View>

              <View style={styles.badgesRow}>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>{profile?.role || 'OPERATOR'}</Text>
                </View>
                <View style={styles.statusBadge}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>Active</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── 2. Store Assignment ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="business-outline" size={18} color={Colors.textTeal} />
            <Text style={styles.cardHeaderTitle}>ZAP Point Assignment</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Assigned Store</Text>
            <Text style={styles.infoValHighlight}>
              {selectedStore?.name || captain?.zap_point || 'Unassigned'}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Location</Text>
            <Text style={styles.infoValue}>
              {selectedStore?.location ? `${selectedStore.location}, ${selectedStore.state_name}` : 'Franchise Network'}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Joined Date</Text>
            <Text style={styles.infoValue}>{captain?.joined_date || 'N/A'}</Text>
          </View>
        </View>

        {/* ── 3. Performance & Tasks Link ─────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="ribbon-outline" size={18} color={Colors.textTeal} />
            <Text style={styles.cardHeaderTitle}>Performance & Daily Tasks</Text>
          </View>

          <Text style={styles.cardDesc}>
            View daily task ratings, bonus grades, appraisal cycle results, and feedback from ground supervisors.
          </Text>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push('/(app)/performance' as Parameters<typeof router.push>[0])}
          >
            <Ionicons name="bar-chart-outline" size={16} color={Colors.brandNavy} style={{ marginRight: 8 }} />
            <Text style={styles.actionBtnText}>VIEW PERFORMANCE DESK</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.brandNavy} style={{ marginLeft: 6 }} />
          </Pressable>
        </View>

        {/* ── 4. Account Security ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textTeal} />
            <Text style={styles.cardHeaderTitle}>Account Security</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>System Email</Text>
            <Text style={styles.infoValueMono}>{user?.email || 'N/A'}</Text>
          </View>

          <View style={styles.divider} />

          <Pressable
            style={({ pressed }) => [styles.outlineBtn, { opacity: pressed ? 0.7 : 1, marginTop: Spacing.sm }]}
            onPress={() => setChangePasswordModal(true)}
          >
            <Ionicons name="key-outline" size={16} color={Colors.textTeal} style={{ marginRight: 8 }} />
            <Text style={styles.outlineBtnText}>CHANGE MY PASSWORD</Text>
          </Pressable>
        </View>

        {/* ── 5. App & System Info ────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="phone-portrait-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.cardHeaderMuted}>System & Device Diagnostics</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>App Version</Text>
            <Text style={styles.infoValue}>1.9 (Development)</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>OTA Channel</Text>
            <Text style={styles.infoValue}>{Updates.channel || 'Development'}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Push Notifications</Text>
            <Text style={styles.infoValue}>{captain?.push_token ? 'Active' : 'Not Registered'}</Text>
          </View>
        </View>

        {/* ── 6. Sign Out Button ──────────────────────────────────────────── */}
        <Pressable
          style={({ pressed }) => [styles.signOutBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out of account"
        >
          <Ionicons name="log-out-outline" size={18} color={Colors.statusError} style={{ marginRight: 8 }} />
          <Text style={styles.signOutBtnText}>SIGN OUT</Text>
        </Pressable>

        <Text style={styles.footerNote}>
          Yana Yantron Technology Pvt. Ltd.{'\n'}Authorized Personnel Only
        </Text>
      </ScrollView>

      {/* ── Change Password Modal ────────────────────────────────────────── */}
      {changePasswordModal && (
        <Modal
          transparent
          animationType="fade"
          visible={changePasswordModal}
          onRequestClose={() => setChangePasswordModal(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="key" size={20} color={Colors.textTeal} />
                  <Text style={styles.modalTitle}>Change Password</Text>
                </View>
                <Pressable onPress={() => setChangePasswordModal(false)} hitSlop={12}>
                  <Ionicons name="close" size={20} color={Colors.textMuted} />
                </Pressable>
              </View>

              <Text style={styles.modalSub}>
                Enter your new password below. It will be required the next time you sign into YanaOS.
              </Text>

              <View style={styles.modalField}>
                <Text style={styles.inputLabel}>NEW PASSWORD</Text>
                <View style={styles.passwordInputWrap}>
                  <TextInput
                    style={styles.passwordInput}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Minimum 6 characters"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <Pressable
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={8}
                    style={{ padding: 4 }}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={Colors.textSecondary}
                    />
                  </Pressable>
                </View>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.inputLabel}>CONFIRM NEW PASSWORD</Text>
                <TextInput
                  style={styles.textInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter new password"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => setChangePasswordModal(false)}
                  disabled={isUpdatingPassword}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={[styles.modalSubmitBtn, { opacity: isUpdatingPassword ? 0.7 : 1 }]}
                  onPress={handleUpdatePassword}
                  disabled={isUpdatingPassword}
                >
                  {isUpdatingPassword ? (
                    <ActivityIndicator size="small" color={Colors.brandNavy} />
                  ) : (
                    <Text style={styles.modalSubmitText}>SAVE PASSWORD</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgApp,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: {
    padding: 4,
  },
  topBarTitle: {
    ...Typography.h1Screen,
    fontSize: 18,
    color: Colors.textPrimary,
  },
  container: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl + 20,
    gap: Spacing.md,
  },

  // ── Card Styles ─────────────────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  cardHeaderTitle: {
    ...Typography.labelCaps,
    color: Colors.textPrimary,
  },
  cardHeaderMuted: {
    ...Typography.labelCaps,
    color: Colors.textMuted,
  },
  cardDesc: {
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },

  // ── Hero Section ───────────────────────────────────────────────────────────
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceTeal,
    borderWidth: 2,
    borderColor: Colors.brandTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textTeal,
  },
  heroDetails: {
    flex: 1,
    gap: 4,
  },
  captainName: {
    ...Typography.h1Screen,
    fontSize: 18,
    color: Colors.textPrimary,
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  idText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: 'Nunito-Medium',
  },
  idTextHighlight: {
    fontWeight: '700',
    color: Colors.textTeal,
    fontFamily: 'Courier',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  roleBadge: {
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceGreen,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.statusActive,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.statusActive,
  },

  // ── Info Row Styles ────────────────────────────────────────────────────────
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoLabel: {
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
  },
  infoValue: {
    ...Typography.bodyPrimary,
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  infoValHighlight: {
    ...Typography.bodyPrimary,
    fontSize: 13,
    color: Colors.textTeal,
    fontWeight: '700',
  },
  infoValueMono: {
    fontSize: 12,
    fontFamily: 'Courier',
    color: Colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 4,
  },

  // ── Action Buttons ─────────────────────────────────────────────────────────
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandTeal,
    borderRadius: Radius.button,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
  },
  actionBtnText: {
    ...Typography.buttonPrimary,
    fontSize: 12,
    color: Colors.brandNavy,
    letterSpacing: 1,
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderInput,
    borderRadius: Radius.button,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
  },
  outlineBtnText: {
    ...Typography.buttonPrimary,
    fontSize: 12,
    color: Colors.textTeal,
    letterSpacing: 0.8,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRed,
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: Radius.button,
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  signOutBtnText: {
    ...Typography.buttonPrimary,
    fontSize: 13,
    color: Colors.statusError,
    letterSpacing: 1.5,
  },
  footerNote: {
    textAlign: 'center',
    ...Typography.bodySecondary,
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: Spacing.md,
    lineHeight: 16,
  },

  // ── Modal Styles ───────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.modal,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  modalTitle: {
    ...Typography.h1Screen,
    fontSize: 17,
    color: Colors.textPrimary,
  },
  modalSub: {
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  modalField: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    ...Typography.labelCaps,
    fontSize: 10,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  textInput: {
    height: 46,
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderInput,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    ...Typography.bodyPrimary,
    color: Colors.textPrimary,
  },
  passwordInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderInput,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    ...Typography.bodyPrimary,
    color: Colors.textPrimary,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalCancelText: {
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    backgroundColor: Colors.brandTeal,
    borderRadius: Radius.sm,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  modalSubmitText: {
    ...Typography.buttonPrimary,
    fontSize: 11,
    color: Colors.brandNavy,
    letterSpacing: 1,
  },
});
