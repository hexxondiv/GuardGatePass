import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { API_BASE_URL } from '../config/app_constants';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../utils/apiErrors';
import { sanitizePhoneForApi } from '../utils/phoneInput';
import { color, font, radii, space } from '../theme/tokens';

export default function LoginScreen() {
  const { signIn, isSigningIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    const phoneForApi = sanitizePhoneForApi(phone);
    if (!phoneForApi || !accessCode.trim()) {
      setError('Enter your phone number and access code.');
      return;
    }
    try {
      await signIn(phoneForApi, accessCode.trim());
    } catch (e) {
      setError(getApiErrorMessage(e, 'Sign-in failed. Please try again.'));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title} maxFontSizeMultiplier={1.75}>
          Guard Gate Pass
        </Text>
        <Text style={styles.subtitle} maxFontSizeMultiplier={1.65}>
          Staff sign-in (same as admin web)
        </Text>
        <Text style={styles.hint} maxFontSizeMultiplier={1.55}>
          Use the phone and account access code from Gate Pass admin. If you see user not found, that number is not
          registered on the API you are calling — check Users in admin or your EXPO_PUBLIC_DEV_API_BASE_URL (same host as
          the server where the account exists).
        </Text>

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone number on your account"
          placeholderTextColor={color.textPlaceholder}
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSigningIn}
          accessibilityLabel="Phone number"
        />

        <Text style={styles.label}>Access code</Text>
        <TextInput
          style={styles.input}
          value={accessCode}
          onChangeText={setAccessCode}
          placeholder="Your account access code"
          placeholderTextColor={color.textPlaceholder}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSigningIn}
          accessibilityLabel="Account access code"
          textContentType="password"
        />

        <View style={styles.errorSlot} accessibilityLiveRegion="polite">
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <TouchableOpacity
          style={[styles.button, isSigningIn && styles.buttonDisabled]}
          onPress={() => void onSubmit()}
          disabled={isSigningIn}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
        >
          {isSigningIn ? (
            <ActivityIndicator color={color.text} />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </TouchableOpacity>

        {__DEV__ ? (
          <Text style={styles.devApiHint} selectable maxFontSizeMultiplier={1.4}>
            API: {API_BASE_URL}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: space.xxl,
    paddingBottom: 40,
  },
  title: { fontSize: font.titleScreen, fontWeight: '700', color: color.text, marginBottom: space.sm },
  subtitle: { fontSize: font.bodySm, color: color.textMuted, marginBottom: 10 },
  hint: { fontSize: font.caption, color: color.textFaint, lineHeight: 18, marginBottom: space.xl },
  label: { fontSize: 13, color: color.textMuted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radii.xs,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: color.text,
    marginBottom: space.lg,
    backgroundColor: color.surface,
    minHeight: 48,
  },
  errorSlot: {
    minHeight: 22,
    marginBottom: space.sm,
    justifyContent: 'center',
  },
  error: { color: color.danger, marginBottom: 0, fontSize: font.bodySm },
  button: {
    backgroundColor: color.primaryBtn,
    paddingVertical: 14,
    borderRadius: radii.xs,
    alignItems: 'center',
    marginTop: space.sm,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  devApiHint: { marginTop: space.xl, fontSize: 11, color: color.borderStrong },
});
