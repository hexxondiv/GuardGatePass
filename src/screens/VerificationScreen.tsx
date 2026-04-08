import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useEstateContext } from '../context/EstateContext';
import { useDebounce } from '../hooks/useDebounce';
import { verifyGatePass } from '../services/gatepassService';
import type { GatePassVerificationResult } from '../types/gateApi';
import {
  CODE_DIGITS,
  DEBOUNCE_MS,
  isCompleteAccessCode,
  rawScanToAccessCode,
  RESULT_RESET_MS,
} from '../utils/accessCode';
import { getOrCreateDeviceId } from '../utils/deviceId';
import { getApiErrorMessage } from '../utils/apiErrors';
import { extractQueryParam } from '../utils/linkingUrl';
import type { GuardTabParamList } from '../navigation/types';

type ScanQrModalProps = {
  visible: boolean;
  onClose: () => void;
  onValidCode: (normalizedSixDigit: string) => void;
  pauseScanning?: boolean;
};

const KEYPAD_ROWS: (string | number)[][] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  ['clear', 0, 'del'],
];

/** Web `VerificationConsole.module.css` flip transition. */
const FLIP_MS = 550;

export default function VerificationScreen() {
  const route = useRoute<RouteProp<GuardTabParamList, 'Verification'>>();
  const queryClient = useQueryClient();
  const { authUser } = useAuth();
  const { activeEstateId } = useEstateContext();

  const [accessCode, setAccessCode] = useState('');
  const debouncedCode = useDebounce(accessCode, DEBOUNCE_MS);
  const isStable = debouncedCode.trim() === accessCode.trim();

  const [outcome, setOutcome] = useState<'success' | 'failure' | null>(null);
  const [resultDetail, setResultDetail] = useState<{
    message: string;
    api?: GatePassVerificationResult | null;
  } | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [scanQrVisible, setScanQrVisible] = useState(false);
  const [scanQrModalImpl, setScanQrModalImpl] = useState<ComponentType<ScanQrModalProps> | null>(null);
  const [scanQrLoadError, setScanQrLoadError] = useState<string | null>(null);
  /** Manual paste when camera module fails to load (parity with ScanQrModal paste path). */
  const [scanQrPasteText, setScanQrPasteText] = useState('');

  useEffect(() => {
    if (!scanQrVisible) {
      setScanQrPasteText('');
    }
  }, [scanQrVisible]);

  useEffect(() => {
    if (!scanQrVisible) {
      setScanQrModalImpl(null);
      setScanQrLoadError(null);
      return;
    }
    let cancelled = false;
    setScanQrLoadError(null);
    setScanQrModalImpl(null);
    void import('./ScanQrModal')
      .then((m) => {
        if (!cancelled) {
          setScanQrModalImpl(() => m.default);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const raw = e instanceof Error ? e.message : String(e);
          setScanQrLoadError(
            raw.includes('ExpoCamera') || raw.toLowerCase().includes('native module')
              ? 'Camera native code is not in this build. From the Guard Gate project folder run: npx expo run:android (or npx expo run:ios), then open the installed development build — not the Expo Go app.'
              : raw,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [scanQrVisible]);

  const closeScanQr = useCallback(() => {
    setScanQrVisible(false);
  }, []);

  const applyScanQrPaste = useCallback(() => {
    const normalized = rawScanToAccessCode(scanQrPasteText);
    if (isCompleteAccessCode(normalized)) {
      setAccessCode(normalized);
      setScanQrPasteText('');
      setScanQrVisible(false);
      return;
    }
    Alert.alert(
      'Invalid code',
      'Could not read a 6-digit access code from this text. Enter 6 digits or JSON with access_code.',
      [{ text: 'OK' }],
      { cancelable: true },
    );
  }, [scanQrPasteText]);

  const lastAttemptedCodeRef = useRef<string | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyResetRef = useRef<() => void>(() => {});
  const flipAnim = useRef(new Animated.Value(0)).current;
  const accessCodeInputRef = useRef<TextInput>(null);
  const wasShowingOutcomeRef = useRef(false);

  useEffect(() => {
    void getOrCreateDeviceId().then(setDeviceId);
  }, []);

  /** After result → idle, focus the code field (parity with web `autoFocus` after reset). */
  useEffect(() => {
    if (outcome !== null) {
      wasShowingOutcomeRef.current = true;
      return;
    }
    if (!wasShowingOutcomeRef.current) {
      return;
    }
    wasShowingOutcomeRef.current = false;
    const id = setTimeout(() => {
      accessCodeInputRef.current?.focus();
    }, FLIP_MS + 50);
    return () => clearTimeout(id);
  }, [outcome]);

  useEffect(() => {
    Animated.timing(flipAnim, {
      toValue: outcome !== null ? 1 : 0,
      duration: FLIP_MS,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [outcome, flipAnim]);

  /** Opacity crossfade — RN often fails to show the back face with `rotateY` + `backfaceVisibility` (Android). */
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const clearTimers = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const resetToDefault = useCallback(() => {
    clearTimers();
    setOutcome(null);
    setResultDetail(null);
    setAccessCode('');
    setCountdown(0);
    lastAttemptedCodeRef.current = null;
  }, [clearTimers]);

  const startCountdown = useCallback(
    (totalMs: number) => {
      clearTimers();
      const seconds = Math.ceil(totalMs / 1000);
      setCountdown(seconds);
      let left = seconds;
      countdownIntervalRef.current = setInterval(() => {
        left -= 1;
        setCountdown(Math.max(0, left));
        if (left <= 0 && countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      }, 1000);
    },
    [clearTimers],
  );

  const scheduleResultReset = useCallback(
    (ms: number) => {
      clearTimers();
      startCountdown(ms);
      resetTimerRef.current = setTimeout(() => {
        resetToDefault();
        verifyResetRef.current();
      }, ms);
    },
    [clearTimers, resetToDefault, startCountdown],
  );

  const verifyMutation = useMutation({
    mutationFn: (code: string) =>
      verifyGatePass({
        access_code: /^\d+$/.test(code) ? Number(code) : code,
        guard_id: authUser?.user_id ?? null,
        verification_mode: 'access_code',
        ...(deviceId ? { device_id: deviceId } : {}),
      }),
    onSuccess: async (data) => {
      setOutcome(data.valid ? 'success' : 'failure');
      setResultDetail({
        message: data.message,
        api: data,
      });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['gatepass'] });
      scheduleResultReset(RESULT_RESET_MS);
    },
    onError: (error: unknown) => {
      setOutcome('failure');
      setResultDetail({
        message: getApiErrorMessage(error),
        api: null,
      });
      scheduleResultReset(RESULT_RESET_MS);
    },
  });

  useEffect(() => {
    verifyResetRef.current = () => verifyMutation.reset();
  });

  useEffect(() => () => clearTimers(), [clearTimers]);

  /** Deep link / navigation `?code=` (web `router.query.code`). */
  useEffect(() => {
    const fromRoute = route.params?.code;
    if (typeof fromRoute === 'string' && fromRoute.trim()) {
      setAccessCode(fromRoute.trim().replace(/\D/g, '').slice(0, CODE_DIGITS));
    }
  }, [route.params?.code]);

  useEffect(() => {
    function applyCodeFromUrl(url: string | null) {
      if (!url) return;
      const raw = extractQueryParam(url, 'code');
      if (raw?.trim()) {
        setAccessCode(raw.trim().replace(/\D/g, '').slice(0, CODE_DIGITS));
      }
    }
    void Linking.getInitialURL().then(applyCodeFromUrl);
    const sub = Linking.addEventListener('url', (e) => applyCodeFromUrl(e.url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (outcome !== null) {
      return;
    }
    if (!isStable) {
      return;
    }
    const code = debouncedCode.trim();
    if (!isCompleteAccessCode(code)) {
      return;
    }
    if (lastAttemptedCodeRef.current === code) {
      return;
    }
    if (verifyMutation.isPending) {
      return;
    }

    lastAttemptedCodeRef.current = code;
    verifyMutation.mutate(code);
  }, [debouncedCode, isStable, outcome, verifyMutation.mutate, verifyMutation.isPending]);

  const setCodeFiltered = useCallback((next: string) => {
    setAccessCode(rawScanToAccessCode(next));
  }, []);

  const handleKeypad = useCallback(
    (key: string | number) => {
      if (outcome !== null || verifyMutation.isPending) {
        return;
      }
      const k = String(key);
      if (k === 'clear') {
        setAccessCode('');
        return;
      }
      if (k === 'del') {
        setAccessCode((prev) => prev.slice(0, -1));
        return;
      }
      if (/^\d$/.test(k) && accessCode.length < CODE_DIGITS) {
        setAccessCode((prev) => prev + k);
      }
    },
    [accessCode.length, outcome, verifyMutation.isPending],
  );

  const pending = verifyMutation.isPending;

  const statusText = (() => {
    if (outcome !== null) {
      return `Next entry in ${countdown}s…`;
    }
    if (pending) {
      return 'Verifying…';
    }
    if (!isStable) {
      if (accessCode.length >= CODE_DIGITS) {
        return 'Paused — verifying shortly…';
      }
      return `Enter ${CODE_DIGITS} digits to verify`;
    }
    if (accessCode.length > 0 && accessCode.length < CODE_DIGITS) {
      return `${CODE_DIGITS - accessCode.length} more digit${CODE_DIGITS - accessCode.length === 1 ? '' : 's'}`;
    }
    if (accessCode.length === 0) {
      return 'Type, tap keypad, or paste code';
    }
    return '6 digits — verifying after pause…';
  })();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!activeEstateId ? (
          <View style={styles.warnBanner}>
            <Text style={styles.warnText}>
              No estate scope — requests may fail until X-Estate-Id is set from your account.
            </Text>
          </View>
        ) : null}

        <View style={styles.shell}>
          <View style={styles.panel}>
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(120, 20, 20, 0.35)', 'transparent']}
              style={styles.panelGlow}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            />
            <LinearGradient
              colors={['#0e1016', '#151821', '#0a0b10']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.panelGradient}
            >
              <View style={styles.panelInner}>
                <Text style={styles.eyebrow}>Access control</Text>
                <Text style={styles.title}>Enter access code</Text>

                {/* Web: only QR (front) ↔ result (back) flip; digits + keypad stay below. */}
                <View style={styles.flipCard}>
                  <View style={styles.flipInner}>
                    {/* Back draws first; front fades out on top (same timing as web flip). */}
                    <Animated.View
                      style={[
                        styles.flipFaceBack,
                        { opacity: backOpacity },
                        outcome === 'success' && styles.flipFaceBackSuccess,
                        outcome === 'failure' && styles.flipFaceBackFailure,
                      ]}
                      pointerEvents={outcome !== null ? 'auto' : 'none'}
                      accessibilityRole="summary"
                      accessibilityLiveRegion="polite"
                    >
                      <ScrollView
                        style={styles.flipBackScroll}
                        contentContainerStyle={styles.flipBackScrollContent}
                        showsVerticalScrollIndicator={false}
                        bounces={false}
                      >
                        {outcome === 'success' ? (
                          <Ionicons name="checkmark-circle" size={52} color="#3fb950" />
                        ) : outcome === 'failure' ? (
                          <Ionicons name="close-circle" size={48} color="#f85149" />
                        ) : null}
                        {outcome !== null ? (
                          <>
                            <Text style={styles.flipOutcomeTitle}>
                              {outcome === 'success' ? 'Pass verified' : 'Not verified'}
                            </Text>
                            <Text style={styles.flipOutcomeBody}>{resultDetail?.message}</Text>
                            {outcome === 'failure' && resultDetail?.api ? (
                              <View style={styles.metaList}>
                                <Text style={styles.metaLine}>Pass #{resultDetail.api.gate_pass_id}</Text>
                                <Text style={styles.metaLine}>Status: {resultDetail.api.status}</Text>
                                <Text style={styles.metaLine}>Remaining uses: {resultDetail.api.remaining_uses}</Text>
                                {resultDetail.api.denial_reason ? (
                                  <Text style={[styles.metaLine, styles.metaDenial]}>
                                    Reason: {resultDetail.api.denial_reason}
                                  </Text>
                                ) : null}
                              </View>
                            ) : null}
                          </>
                        ) : null}
                      </ScrollView>
                    </Animated.View>
                    <Animated.View
                      style={[styles.flipFaceFront, { opacity: frontOpacity }]}
                      pointerEvents={outcome !== null ? 'none' : 'auto'}
                    >
                      <Pressable
                        style={[
                          styles.qrZone,
                          (pending || outcome !== null) && styles.qrZoneDisabled,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Open QR scanner"
                        disabled={pending || outcome !== null}
                        onPress={() => setScanQrVisible(true)}
                      >
                        <Ionicons name="qr-code-outline" size={36} color="rgba(255,255,255,0.45)" />
                        <Text style={styles.qrLabel}>Scan QR</Text>
                        <Text style={styles.qrHint}>Tap to scan with camera or paste JSON in the scanner</Text>
                      </Pressable>
                    </Animated.View>
                  </View>
                </View>

                <View style={styles.digitsWrap}>
                  <TextInput
                    ref={accessCodeInputRef}
                    value={accessCode}
                    onChangeText={setCodeFiltered}
                    keyboardType="number-pad"
                    maxLength={CODE_DIGITS}
                    editable={!pending && outcome === null}
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    accessibilityLabel="Six-digit access code"
                    style={styles.hiddenInput}
                  />
                  <View style={styles.digitsRow} pointerEvents="none">
                    {Array.from({ length: CODE_DIGITS }).map((_, i) => {
                      const ch = accessCode[i];
                      const active = i === Math.min(accessCode.length, CODE_DIGITS - 1);
                      return (
                        <View
                          key={i}
                          style={[
                            styles.digitCell,
                            ch ? styles.digitCellFilled : null,
                            active ? styles.digitCellActive : null,
                          ]}
                        >
                          <Text style={styles.digitText}>{ch ?? ''}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.keypad}>
                  {KEYPAD_ROWS.map((row, ri) => (
                    <View key={ri} style={styles.keypadRow}>
                      {row.map((key) => {
                        if (key === 'clear') {
                          return (
                            <Pressable
                              key="clear"
                              style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                              disabled={pending || outcome !== null || accessCode.length === 0}
                              onPress={() => handleKeypad('clear')}
                              accessibilityRole="button"
                              accessibilityLabel="Clear"
                            >
                              <Text style={styles.keyText}>Clear</Text>
                            </Pressable>
                          );
                        }
                        if (key === 'del') {
                          return (
                            <Pressable
                              key="del"
                              style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                              disabled={pending || outcome !== null || accessCode.length === 0}
                              onPress={() => handleKeypad('del')}
                              accessibilityRole="button"
                              accessibilityLabel="Backspace"
                            >
                              <Text style={styles.keyText}>⌫</Text>
                            </Pressable>
                          );
                        }
                        return (
                          <Pressable
                            key={String(key)}
                            style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                            disabled={pending || outcome !== null || accessCode.length >= CODE_DIGITS}
                            onPress={() => handleKeypad(key)}
                            accessibilityRole="button"
                            accessibilityLabel={`Digit ${key}`}
                          >
                            <Text style={styles.keyText}>{key}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>

                <View style={styles.statusRow}>
                  {pending ? <ActivityIndicator color="#58a6ff" style={styles.spinner} /> : null}
                  <Text style={[styles.statusLine, pending && styles.statusLinePulse]}>{statusText}</Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        </View>
      </ScrollView>

      {scanQrVisible && scanQrLoadError ? (
        <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={closeScanQr}>
          <SafeAreaView style={styles.scanQrFallback} edges={['top', 'bottom']}>
            <View style={styles.scanQrFallbackHeader}>
              <Text style={styles.scanQrFallbackTitle}>Scan QR (no camera)</Text>
              <Pressable
                onPress={closeScanQr}
                style={({ pressed }) => [styles.scanQrFallbackClose, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={28} color="#f0f6fc" />
              </Pressable>
            </View>
            <ScrollView
              style={styles.scanQrFallbackScroll}
              contentContainerStyle={styles.scanQrFallbackScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.scanQrFallbackBody}>{scanQrLoadError}</Text>
              <View style={styles.scanQrPasteSection}>
                <Text style={styles.scanQrPasteLabel}>Or paste code / JSON</Text>
                <TextInput
                  value={scanQrPasteText}
                  onChangeText={setScanQrPasteText}
                  placeholder='e.g. 123456 or {"access_code":"123456"}'
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={styles.scanQrPasteInput}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Paste QR text or JSON"
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.scanQrPasteApply,
                    pressed && styles.scanQrPasteApplyPressed,
                  ]}
                  onPress={applyScanQrPaste}
                  accessibilityRole="button"
                  accessibilityLabel="Apply pasted code"
                >
                  <Text style={styles.scanQrPasteApplyText}>Apply pasted text</Text>
                </Pressable>
              </View>
              <Pressable style={styles.scanQrFallbackBtn} onPress={closeScanQr} accessibilityRole="button">
                <Text style={styles.scanQrFallbackBtnText}>Close</Text>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      ) : null}
      {scanQrVisible && !scanQrLoadError && scanQrModalImpl
        ? React.createElement(scanQrModalImpl, {
            visible: true,
            onClose: closeScanQr,
            pauseScanning: pending || outcome !== null,
            onValidCode: (normalized: string) => {
              setAccessCode(normalized);
              setScanQrVisible(false);
            },
          })
        : null}
      {scanQrVisible && !scanQrLoadError && !scanQrModalImpl ? (
        <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={closeScanQr}>
          <SafeAreaView style={styles.scanQrFallback} edges={['top', 'bottom']}>
            <View style={styles.scanQrFallbackHeader}>
              <Text style={styles.scanQrFallbackTitle}>Scan QR</Text>
              <Pressable
                onPress={closeScanQr}
                style={({ pressed }) => [styles.scanQrFallbackClose, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={28} color="#f0f6fc" />
              </Pressable>
            </View>
            <ActivityIndicator color="#58a6ff" size="large" style={{ marginTop: 24 }} />
            <Text style={[styles.scanQrFallbackBody, { marginTop: 16 }]}>Loading camera…</Text>
          </SafeAreaView>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  warnBanner: {
    backgroundColor: 'rgba(210, 153, 34, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(210, 153, 34, 0.45)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  warnText: {
    color: '#d29922',
    fontSize: 13,
    lineHeight: 18,
  },
  shell: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  panel: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 12,
  },
  panelGlow: {
    position: 'absolute',
    left: '-20%',
    right: '-20%',
    top: '-40%',
    height: '70%',
    zIndex: 0,
  },
  panelGradient: {
    borderRadius: 20,
  },
  panelInner: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    zIndex: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f0f6fc',
    marginBottom: 16,
  },
  flipCard: {
    marginBottom: 16,
    width: '100%',
  },
  flipInner: {
    position: 'relative',
    width: '100%',
    minHeight: 200,
  },
  flipFaceFront: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    minHeight: 200,
    width: '100%',
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipFaceBack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    minHeight: 200,
    width: '100%',
    zIndex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  flipFaceBackSuccess: {
    borderWidth: 1,
    borderColor: 'rgba(25, 135, 84, 0.35)',
    backgroundColor: 'rgba(14, 16, 22, 0.96)',
  },
  flipFaceBackFailure: {
    borderWidth: 1,
    borderColor: 'rgba(220, 53, 69, 0.3)',
    backgroundColor: 'rgba(14, 16, 22, 0.96)',
  },
  flipBackScroll: {
    maxHeight: 220,
    width: '100%',
  },
  flipBackScrollContent: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  qrZone: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 200,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  qrZoneDisabled: {
    opacity: 0.55,
  },
  qrLabel: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
  },
  qrHint: {
    marginTop: 4,
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  digitsWrap: {
    position: 'relative',
    marginBottom: 16,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0.02,
    height: 48,
    width: '100%',
    zIndex: 2,
  },
  digitsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  digitCell: {
    flex: 1,
    aspectRatio: 0.85,
    maxHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitCellFilled: {
    borderColor: 'rgba(88, 166, 255, 0.45)',
    backgroundColor: 'rgba(88, 166, 255, 0.08)',
  },
  digitCellActive: {
    borderColor: 'rgba(88, 166, 255, 0.85)',
    shadowColor: '#58a6ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  digitText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#f0f6fc',
  },
  keypad: {
    gap: 10,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: 10,
  },
  key: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  keyText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#f0f6fc',
  },
  flipOutcomeTitle: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: '700',
    color: '#f0f6fc',
    textAlign: 'center',
  },
  flipOutcomeBody: {
    marginTop: 8,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 20,
  },
  metaList: {
    marginTop: 16,
    alignSelf: 'stretch',
    gap: 6,
  },
  metaLine: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },
  metaDenial: {
    color: '#f85149',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  spinner: {
    marginRight: 4,
  },
  statusLine: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    flexShrink: 1,
  },
  statusLinePulse: {
    color: 'rgba(88, 166, 255, 0.95)',
  },
  scanQrFallback: {
    flex: 1,
    backgroundColor: '#0d1117',
    paddingHorizontal: 20,
  },
  scanQrFallbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 8,
  },
  scanQrFallbackTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f0f6fc',
  },
  scanQrFallbackClose: {
    padding: 8,
    marginRight: -4,
  },
  scanQrFallbackBody: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 22,
  },
  scanQrFallbackBtn: {
    marginTop: 24,
    alignSelf: 'flex-start',
    backgroundColor: '#238636',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  scanQrFallbackBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scanQrFallbackScroll: {
    flex: 1,
  },
  scanQrFallbackScrollContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  scanQrPasteSection: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    gap: 10,
  },
  scanQrPasteLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
  },
  scanQrPasteInput: {
    minHeight: 56,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    padding: 12,
    color: '#f0f6fc',
    fontSize: 15,
  },
  scanQrPasteApply: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  scanQrPasteApplyPressed: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  scanQrPasteApplyText: {
    color: '#58a6ff',
    fontSize: 15,
    fontWeight: '600',
  },
});
