// ─────────────────────────────────────────────────────────────────────────────
// Login Screen
// Email + password auth. YANA cyan wordmark. Premium card-style form.
// ─────────────────────────────────────────────────────────────────────────────

import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
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

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { signIn, isLoading, error, isAuthenticated, clearError } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) router.replace('/(auth)/store-select');
  }, [isAuthenticated]);

  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    await signIn(email.trim(), password);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.wordmark}>YANA</Text>
            <Text style={styles.tagline}>OPS CENTER</Text>
            <Text style={styles.subTagline}>Fleet Operations Platform</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign In</Text>
            <Text style={styles.cardSub}>Captain & Admin access only</Text>

            {error && (
              <Pressable style={styles.errorBanner} onPress={clearError}>
                <Text style={styles.errorText}>⚠ {error}  ✕</Text>
              </Pressable>
            )}

            <View style={styles.field}>
              <Text style={[Typography.labelCaps, styles.fieldLabel]}>EMAIL</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(t) => { setEmail(t); clearError(); }}
                placeholder="captain@yana.in"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <Text style={[Typography.labelCaps, styles.fieldLabel]}>PASSWORD</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, { flex: 1, borderWidth: 0 }]}
                  value={password}
                  onChangeText={(t) => { setPassword(t); clearError(); }}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textSecondary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={12} style={styles.eyeBtn}>
                  <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.signInBtn, { opacity: isLoading || pressed ? 0.8 : 1 }]}
              onPress={handleSignIn}
              disabled={isLoading}
            >
              <Text style={styles.signInBtnText}>
                {isLoading ? 'SIGNING IN...' : 'SIGN IN'}
              </Text>
            </Pressable>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>
            Yana Yantron Technology Pvt. Ltd.{'\n'}Captain & Admin portal only
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgApp },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xl },

  hero: { alignItems: 'center', marginBottom: Spacing.xl },
  wordmark: {
    fontSize: 52, fontWeight: '900', color: Colors.brandCyan,
    letterSpacing: 8, marginBottom: 4,
  },
  tagline: {
    ...Typography.overline,
    color: Colors.textSecondary,
    letterSpacing: 4,
    fontSize: 13,
  },
  subTagline: {
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
    marginTop: 4,
  },

  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.card + 4,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  cardSub: { ...Typography.bodySecondary, color: Colors.textSecondary, marginBottom: Spacing.lg },

  errorBanner: {
    backgroundColor: Colors.overdueCardBg,
    borderRadius: Radius.sm,
    padding: 10,
    marginBottom: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.statusOverdue,
  },
  errorText: { color: Colors.statusOverdue, ...Typography.bodySecondary },

  field: { marginBottom: Spacing.md },
  fieldLabel: { color: Colors.textSecondary, marginBottom: 6 },
  input: {
    height: 50,
    backgroundColor: Colors.bgApp,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: Spacing.md,
    ...Typography.bodyPrimary,
    color: Colors.textPrimary,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.sm,
    paddingRight: 12,
    height: 50,
  },
  eyeBtn: { padding: 4 },
  eyeText: { fontSize: 18 },

  signInBtn: {
    height: 54,
    backgroundColor: Colors.brandCyan,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  signInBtnText: {
    ...Typography.buttonPrimary,
    color: Colors.brandNavy,
    letterSpacing: 2,
  },

  footer: {
    textAlign: 'center',
    ...Typography.bodySecondary,
    color: Colors.textSecondary,
    marginTop: Spacing.xl,
    lineHeight: 20,
  },
});
