import React, { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInput as TextInputType,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../utils/apiErrors';
import { sanitizePhoneForApi } from '../utils/phoneInput';
import { color, font, radii, space } from '../theme/tokens';

export default function LoginScreen() {
  const { signIn, isSigningIn } = useAuth();
  const accessCodeRef = useRef<TextInputType>(null);
  const [phone, setPhone] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [focusedField, setFocusedField] = useState<'phone' | 'accessCode' | null>(null);
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

  const focusAccessCode = () => {
    if (!sanitizePhoneForApi(phone)) {
      setError('Enter your phone number.');
      return;
    }
    setError(null);
    accessCodeRef.current?.focus();
  };

  const submitFromAccessCode = () => {
    if (!accessCode.trim()) {
      setError('Enter your access code.');
      return;
    }
    void onSubmit();
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
        <View style={styles.hero}>
          <LinearGradient
            colors={['rgba(88,166,255,0.24)', 'rgba(63,185,80,0.13)', 'rgba(240,180,41,0.06)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGlow}
          />
          <View style={styles.logoWrap} accessibilityElementsHidden>
            <Image source={require('../assets/guard_icon.png')} style={styles.logo} resizeMode="cover" />
          </View>
          <Text style={styles.title} maxFontSizeMultiplier={1.45}>
            Guard Gate Pass
          </Text>
          <Text style={styles.subtitle} maxFontSizeMultiplier={1.35}>
            Sign in to manage estate entry.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Phone number</Text>
          <View style={[styles.inputWrap, focusedField === 'phone' && styles.inputWrapFocused]}>
            <Ionicons
              name="call-outline"
              size={20}
              color={focusedField === 'phone' ? color.brandAmber : color.textMuted}
              accessibilityElementsHidden
            />
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="0800 000 0000"
              placeholderTextColor={color.textPlaceholder}
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSigningIn}
              accessibilityLabel="Phone number"
              textContentType="telephoneNumber"
              cursorColor={color.brandAmber}
              selectionColor={color.brandAmber}
              returnKeyType="next"
              blurOnSubmit={false}
              onFocus={() => setFocusedField('phone')}
              onBlur={() => setFocusedField(null)}
              onSubmitEditing={focusAccessCode}
            />
          </View>

          <Text style={styles.label}>Access code</Text>
          <View style={[styles.inputWrap, focusedField === 'accessCode' && styles.inputWrapFocused]}>
            <Ionicons
              name="key-outline"
              size={20}
              color={focusedField === 'accessCode' ? color.brandAmber : color.textMuted}
              accessibilityElementsHidden
            />
            <TextInput
              ref={accessCodeRef}
              style={styles.input}
              value={accessCode}
              onChangeText={setAccessCode}
              placeholder="Enter access code"
              placeholderTextColor={color.textPlaceholder}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSigningIn}
              accessibilityLabel="Access code"
              textContentType="password"
              cursorColor={color.brandAmber}
              selectionColor={color.brandAmber}
              returnKeyType="done"
              blurOnSubmit={false}
              onFocus={() => setFocusedField('accessCode')}
              onBlur={() => setFocusedField(null)}
              onSubmitEditing={submitFromAccessCode}
            />
          </View>

          <View style={styles.errorSlot} accessibilityLiveRegion="polite">
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={18} color={color.danger} accessibilityElementsHidden />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.button, isSigningIn && styles.buttonDisabled]}
            onPress={() => void onSubmit()}
            disabled={isSigningIn}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            {isSigningIn ? (
              <ActivityIndicator color={color.brandAmber} />
            ) : (
              <>
                <Text style={styles.buttonText}>Sign in</Text>
                <Ionicons name="arrow-forward" size={20} color={color.brandAmber} accessibilityElementsHidden />
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#090d12' },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    paddingVertical: 36,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 30,
    minHeight: 198,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: 0,
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.96,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.accentBorder,
    marginBottom: space.lg,
    overflow: 'hidden',
    shadowColor: color.shadow,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: color.text,
    textAlign: 'center',
    marginBottom: space.sm,
  },
  subtitle: {
    fontSize: font.body,
    color: color.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 13,
    color: color.textSecondary,
    marginBottom: 7,
    fontWeight: '600',
  },
  inputWrap: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    borderRadius: radii.sm,
    paddingHorizontal: 15,
    marginBottom: space.lg,
    backgroundColor: color.surface,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputWrapFocused: {
    borderColor: color.brandAmber,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 16,
    color: color.text,
    minHeight: 54,
  },
  errorSlot: {
    minHeight: 44,
    marginBottom: space.sm,
    justifyContent: 'center',
  },
  errorBox: {
    minHeight: 38,
    borderRadius: radii.xs,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: color.dangerSoft,
    borderWidth: 1,
    borderColor: color.dangerBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  error: { color: color.textSecondary, flex: 1, fontSize: font.bodySm, lineHeight: 18 },
  button: {
    backgroundColor: '#063f2a',
    paddingVertical: 15,
    paddingHorizontal: space.lg,
    borderRadius: radii.sm,
    alignItems: 'center',
    marginTop: space.sm,
    minHeight: 54,
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: color.brandAmber, fontWeight: '700', fontSize: 16 },
});
