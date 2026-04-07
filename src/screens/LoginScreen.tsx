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
        <Text style={styles.title}>Guard Gate Pass</Text>
        <Text style={styles.subtitle}>Staff sign-in (same as admin web)</Text>
        <Text style={styles.hint}>
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
          placeholderTextColor="#6e7681"
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
          placeholderTextColor="#6e7681"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSigningIn}
          accessibilityLabel="Account access code"
          textContentType="password"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, isSigningIn && styles.buttonDisabled]}
          onPress={() => void onSubmit()}
          disabled={isSigningIn}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
        >
          {isSigningIn ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </TouchableOpacity>

        {__DEV__ ? (
          <Text style={styles.devApiHint} selectable>
            API: {API_BASE_URL}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0d1117' },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 40,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#f0f6fc', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#8b949e', marginBottom: 10 },
  hint: { fontSize: 12, color: '#6e7681', lineHeight: 18, marginBottom: 20 },
  label: { fontSize: 13, color: '#8b949e', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#f0f6fc',
    marginBottom: 16,
    backgroundColor: '#161b22',
  },
  error: { color: '#f85149', marginBottom: 12, fontSize: 14 },
  button: {
    backgroundColor: '#238636',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  devApiHint: { marginTop: 20, fontSize: 11, color: '#484f58' },
});
