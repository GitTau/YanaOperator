// ─────────────────────────────────────────────────────────────────────────────
// Login Screen
// Email + password auth. YANA cyan wordmark. Premium card-style form.
// Responsive: wordmark + subtitle scale with screen width via useLayout.
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
import { useLayout } from '../../src/constants/layout';
import { useAuthStore } from '../../src/stores/authStore';
import { YanaLogo } from '../../src/components/YanaLogo';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { signIn, isLoading, error, isAuthenticated, clearError } = useAuthStore();
  const { fontScale, scale, isSmallPhone } = useLayout();

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
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingHorizontal: scale(20), paddingVertical: scale(32) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* Hero */}
          <View style={[styles.hero, { marginBottom: isSmallPhone ? Spacing.lg : Spacing.xl }]}>
            <YanaLogo width={200} height={50} color={Colors.brandTeal} style={{ marginBottom: 8 }} />
            <Text style={[styles.tagline, { fontSize: fontScale(12) }]}>OPS CENTER</Text>
            <Text style={[styles.subTagline, { fontSize: fontScale(13) }]}>
              Fleet Operations Platform
            </Text>
          </View>


          {/* Card */}
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { fontSize: fontScale(20) }]}>Sign In</Text>
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
                textContentType="emailAddress"
                accessibilityLabel="Email address"
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
                  textContentType="password"
                  accessibilityLabel="Password"
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={12}
                  style={({ pressed }) => [styles.eyeBtn, { opacity: pressed ? 0.6 : 1 }]}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.signInBtn, { opacity: isLoading || pressed ? 0.8 : 1 }]}
              onPress={handleSignIn}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
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
  container: { flexGrow: 1, justifyContent: 'center' },

  hero: { alignItems: 'center' },
  wordmark: {
    fontWeight: '900',
    color: Colors.brandCyan,
    letterSpacing: 8,
    marginBottom: 4,
  },
  tagline: {
    color: Colors.textSecondary,
    fontWeight: '500',
    letterSpacing: 4,
  },
  subTagline: {
    color: Colors.textSecondary,
    fontWeight: '400',
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
  cardTitle: { fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
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
