import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useConnectivityMode } from '../context/ConnectivityModeContext';
import { useEstateContext } from '../context/EstateContext';
import { useDebounce } from '../hooks/useDebounce';
import {
  alignOfflineToggleFromOnlineVerify,
  queueOfflineVerifyForAccessCode,
} from '../services/guardSyncCoordinator';
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
import { useVerifyUiScale } from '../utils/verifyUiScale';
import { preloadVerifyOutcomeSounds, verifyOutcomeFeedback } from '../utils/verifyOutcomeFeedback';
import SkeletonBlock from '../components/SkeletonBlock';
import VerifyConnectivityHeaderRight from '../components/VerifyConnectivityHeaderRight';
import { color, font, radii, space } from '../theme/tokens';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { GuardTabParamList } from '../navigation/types';
import type { ScanQrModalProps } from './ScanQrModal';

const KEYPAD_ROWS: (string | number)[][] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  ['clear', 0, 'del'],
];

/** Web `VerificationConsole.module.css` flip transition. */
const FLIP_MS = 550;

export default function VerificationScreen() {
  useKeepAwake();
  const ui = useVerifyUiScale();
  const route = useRoute<RouteProp<GuardTabParamList, 'Verification'>>();
  const navigation = useNavigation<BottomTabNavigationProp<GuardTabParamList>>();
  const queryClient = useQueryClient();
  const { authUser, barrierWebhookUrl } = useAuth();
  const { activeEstateId } = useEstateContext();
  const { operationalOnline: isOnline } = useConnectivityMode();
  const [reduceMotion, setReduceMotion] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <VerifyConnectivityHeaderRight />,
    });
  }, [navigation]);

  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    return () => sub.remove();
  }, []);

  const [accessCode, setAccessCode] = useState('');
  const debouncedCode = useDebounce(accessCode, DEBOUNCE_MS);
  const isStable = debouncedCode.trim() === accessCode.trim();

  const [outcome, setOutcome] = useState<'success' | 'failure' | null>(null);
  const [resultDetail, setResultDetail] = useState<{
    message: string;
    api?: GatePassVerificationResult | null;
    offline?: {
      remainingUses: number;
      maxUsage: number;
      guestName?: string | null;
    };
  } | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [scanQrVisible, setScanQrVisible] = useState(false);
  const [scanQrModalImpl, setScanQrModalImpl] = useState<ComponentType<ScanQrModalProps> | null>(null);
  const [scanQrLoadError, setScanQrLoadError] = useState<string | null>(null);
  /** Manual paste when camera module fails to load (parity with ScanQrModal paste path). */
  const [scanQrPasteText, setScanQrPasteText] = useState('');

  const [offlineVerifyBusy, setOfflineVerifyBusy] = useState(false);
  const offlineVerifyBusyRef = useRef(false);

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

  useEffect(() => {
    preloadVerifyOutcomeSounds();
  }, []);

  const flipDurationMs = reduceMotion ? 0 : FLIP_MS;

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
    }, flipDurationMs + 50);
    return () => clearTimeout(id);
  }, [outcome, flipDurationMs]);

  useEffect(() => {
    if (reduceMotion) {
      flipAnim.setValue(outcome !== null ? 1 : 0);
      return;
    }
    Animated.timing(flipAnim, {
      toValue: outcome !== null ? 1 : 0,
      duration: flipDurationMs,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [outcome, flipAnim, reduceMotion, flipDurationMs]);

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
    offlineVerifyBusyRef.current = false;
    setOfflineVerifyBusy(false);
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
      verifyOutcomeFeedback(Boolean(data.valid));
      setResultDetail({
        message: data.message,
        api: data,
      });
      if (activeEstateId && data.gate_pass_id != null) {
        void alignOfflineToggleFromOnlineVerify(activeEstateId, data.gate_pass_id, data.event_type ?? null);
      }
      if (data.valid && barrierWebhookUrl) {
        void fetch(barrierWebhookUrl, { method: 'POST' }).catch(() => {});
      }
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['gatepass'] });
      scheduleResultReset(RESULT_RESET_MS);
    },
    onError: (error: unknown) => {
      setOutcome('failure');
      verifyOutcomeFeedback(false);
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
    if (verifyMutation.isPending || offlineVerifyBusy || offlineVerifyBusyRef.current) {
      return;
    }

    if (!isOnline) {
      if (!activeEstateId) {
        return;
      }
      lastAttemptedCodeRef.current = code;
      offlineVerifyBusyRef.current = true;
      setOfflineVerifyBusy(true);
      void queueOfflineVerifyForAccessCode(activeEstateId, code).then((r) => {
        offlineVerifyBusyRef.current = false;
        setOfflineVerifyBusy(false);
        if (r.ok) {
          verifyOutcomeFeedback(true);
          setOutcome('success');
          setResultDetail({
            message: r.message,
            api: null,
            offline: {
              remainingUses: r.remainingUsesAfterOptimistic,
              maxUsage: r.maxUsage,
              guestName: r.guestName,
            },
          });
        } else {
          verifyOutcomeFeedback(false);
          setOutcome('failure');
          setResultDetail({
            message: r.message,
            api: null,
          });
        }
        scheduleResultReset(RESULT_RESET_MS);
      });
      return undefined;
    }

    lastAttemptedCodeRef.current = code;
    verifyMutation.mutate(code);
    return undefined;
  }, [
    debouncedCode,
    isStable,
    outcome,
    verifyMutation.mutate,
    verifyMutation.isPending,
    offlineVerifyBusy,
    isOnline,
    activeEstateId,
    scheduleResultReset,
  ]);

  const setCodeFiltered = useCallback((next: string) => {
    setAccessCode(rawScanToAccessCode(next));
  }, []);

  const handleKeypad = useCallback(
    (key: string | number) => {
      if (outcome !== null || verifyMutation.isPending) {
        return;
      }
      Keyboard.dismiss();
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

  const pending = verifyMutation.isPending || offlineVerifyBusy;

  const statusText = (() => {
    if (outcome !== null) {
      return `Next entry in ${countdown}s…`;
    }
    if (pending) {
      return !isOnline ? 'Offline verify…' : 'Verifying…';
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
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <View style={styles.rootFill}>
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
                colors={[color.panelGlow, 'transparent']}
                style={styles.panelGlow}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
              <LinearGradient
                colors={[color.panelGradientStart, color.panelGradientMid, color.panelGradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.panelGradient}
              >
                <View style={styles.panelInner}>
                  <View style={styles.titleBlock}>
                    <Text style={styles.eyebrow} maxFontSizeMultiplier={1.6}>
                      Access control
                    </Text>
                    <Text style={styles.title} maxFontSizeMultiplier={1.75}>
                      Enter access code
                    </Text>
                  </View>

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
                      accessible={outcome !== null}
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      accessibilityLabel={
                        outcome === null
                          ? undefined
                          : outcome === 'success'
                            ? `Verification succeeded. ${resultDetail?.message ?? ''}`
                            : `Verification failed. ${resultDetail?.message ?? ''}`
                      }
                    >
                      <ScrollView
                        style={styles.flipBackScroll}
                        contentContainerStyle={styles.flipBackScrollContent}
                        keyboardShouldPersistTaps="never"
                        keyboardDismissMode="on-drag"
                        showsVerticalScrollIndicator={false}
                        bounces={false}
                      >
                        {outcome === 'success' ? (
                          <Ionicons name="checkmark-circle" size={ui.outcomeSuccessIcon} color="#3fb950" />
                        ) : outcome === 'failure' ? (
                          <Ionicons name="close-circle" size={ui.outcomeFailureIcon} color="#f85149" />
                        ) : null}
                        {outcome !== null ? (
                          <>
                            <Text style={[styles.flipOutcomeTitle, { fontSize: ui.outcomeTitleSize }]}>
                              {outcome === 'success' ? 'Pass verified' : 'Not verified'}
                            </Text>
                            <Text
                              style={[
                                styles.flipOutcomeBody,
                                {
                                  fontSize: ui.outcomeBodySize,
                                  lineHeight: Math.round(ui.outcomeBodySize * 1.45),
                                },
                              ]}
                            >
                              {resultDetail?.message}
                            </Text>
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
                            {outcome === 'success' && resultDetail?.offline ? (
                              <View style={styles.metaList}>
                                <Text style={styles.metaLine}>
                                  {resultDetail.offline.maxUsage > 0
                                    ? `Remaining uses (local): ${resultDetail.offline.remainingUses}`
                                    : 'Uses: unlimited (no max_usage cap)'}
                                </Text>
                                {resultDetail.offline.guestName ? (
                                  <Text style={styles.metaLine}>Guest: {resultDetail.offline.guestName}</Text>
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
                        accessibilityLabel="Scan gate pass QR code"
                        accessibilityHint="Opens the camera to scan a visitor gate pass QR code"
                        disabled={pending || outcome !== null}
                        onPress={() => {
                          Keyboard.dismiss();
                          setScanQrVisible(true);
                        }}
                      >
                        <Ionicons name="qr-code-outline" size={ui.qrIcon} color="rgba(255,255,255,0.45)" />
                        <Text style={[styles.qrLabel, { fontSize: ui.qrLabelSize }]}>Scan QR</Text>
                        <Text style={[styles.qrHint, { fontSize: ui.qrHintSize }]}>
                          Tap to scan with camera or paste JSON in the scanner
                        </Text>
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
                    showSoftInputOnFocus={false}
                    accessibilityLabel="Six-digit access code"
                    style={styles.hiddenInput}
                  />
                  <View
                    style={styles.digitsRow}
                    pointerEvents="none"
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  >
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
                          <Text
                            style={[styles.digitText, { fontSize: ui.digitFontSize }]}
                            maxFontSizeMultiplier={2.2}
                            adjustsFontSizeToFit
                            minimumFontScale={0.65}
                            numberOfLines={1}
                          >
                            {ch ?? ''}
                          </Text>
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
                            accessibilityLabel="Clear access code"
                            accessibilityHint="Removes all entered digits"
                          >
                              <Text style={[styles.keyText, { fontSize: ui.keyFontSize }]}>Clear</Text>
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
                            accessibilityHint="Deletes the last digit of the access code"
                          >
                              <Text style={[styles.keyText, { fontSize: ui.keyFontSize }]}>⌫</Text>
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
                            accessibilityHint="Adds this digit to the access code"
                          >
                            <Text style={[styles.keyText, { fontSize: ui.keyFontSize }]}>{key}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>

                    <View style={styles.statusRow}>
                      {pending ? (
                        <>
                          <ActivityIndicator color={color.accent} style={styles.spinner} />
                          <SkeletonBlock
                            height={14}
                            width={200}
                            reduceMotion={reduceMotion}
                            style={styles.statusSkeleton}
                          />
                        </>
                      ) : (
                        <Text style={[styles.statusLine, pending && styles.statusLinePulse]}>{statusText}</Text>
                      )}
                    </View>
                  </View>
                </LinearGradient>
              </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {scanQrVisible && scanQrLoadError ? (
        <Modal
          visible
          animationType={reduceMotion ? 'none' : 'slide'}
          presentationStyle="fullScreen"
          onRequestClose={closeScanQr}
        >
          <SafeAreaView style={styles.scanQrFallback} edges={['top', 'bottom']}>
            <View style={styles.scanQrFallbackHeader}>
              <Text style={styles.scanQrFallbackTitle}>Scan QR (no camera)</Text>
              <Pressable
                onPress={closeScanQr}
                style={({ pressed }) => [styles.scanQrFallbackClose, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={ui.modalCloseIcon} color="#f0f6fc" />
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
            reduceMotion,
            onValidCode: (normalized: string) => {
              setAccessCode(normalized);
              setScanQrVisible(false);
            },
          })
        : null}
      {scanQrVisible && !scanQrLoadError && !scanQrModalImpl ? (
        <Modal
          visible
          animationType={reduceMotion ? 'none' : 'slide'}
          presentationStyle="fullScreen"
          onRequestClose={closeScanQr}
        >
          <SafeAreaView style={styles.scanQrFallback} edges={['top', 'bottom']}>
            <View style={styles.scanQrFallbackHeader}>
              <Text style={styles.scanQrFallbackTitle}>Scan QR</Text>
              <Pressable
                onPress={closeScanQr}
                style={({ pressed }) => [styles.scanQrFallbackClose, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={ui.modalCloseIcon} color="#f0f6fc" />
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
    backgroundColor: color.bg,
  },
  keyboardAvoid: {
    flex: 1,
  },
  rootFill: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  warnBanner: {
    backgroundColor: color.warnBgStrong,
    borderWidth: 1,
    borderColor: color.warnBorder,
    borderRadius: radii.sm,
    padding: 12,
    marginBottom: 16,
  },
  warnText: {
    color: color.warning,
    fontSize: 13,
    lineHeight: 18,
  },
  shell: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    flex: 1,
    minHeight: 0,
  },
  panel: {
    flex: 1,
    minHeight: 0,
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
    flex: 1,
    minHeight: 0,
    borderRadius: 20,
  },
  panelInner: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    zIndex: 1,
    justifyContent: 'space-between',
  },
  titleBlock: {
    flexShrink: 0,
  },
  eyebrow: {
    fontSize: font.eyebrow,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: color.overlayTextHi,
    marginBottom: 6,
  },
  title: {
    fontSize: font.titleScreen,
    fontWeight: '700',
    color: color.text,
    marginBottom: space.sm,
  },
  flipCard: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    marginBottom: 8,
  },
  flipInner: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  flipFaceFront: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
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
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  flipBackScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  qrZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 100,
    paddingVertical: 10,
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
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
  },
  qrHint: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.45)',
  },
  digitsWrap: {
    position: 'relative',
    flexShrink: 0,
    marginBottom: 8,
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
    maxHeight: 58,
    minWidth: 44,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    backgroundColor: color.digitBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitCellFilled: {
    borderColor: color.accentBorder,
    backgroundColor: color.accentSoft,
  },
  digitCellActive: {
    borderColor: color.accent,
    shadowColor: color.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  digitText: {
    fontWeight: '700',
    color: color.text,
  },
  keypad: {
    flexShrink: 0,
    gap: 8,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: 10,
  },
  key: {
    flex: 1,
    minHeight: 48,
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
    fontWeight: '600',
    color: '#f0f6fc',
  },
  flipOutcomeTitle: {
    marginTop: 12,
    fontWeight: '700',
    color: '#f0f6fc',
    textAlign: 'center',
  },
  flipOutcomeBody: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
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
    flexShrink: 0,
    marginTop: 6,
    gap: space.sm,
    minHeight: 24,
  },
  spinner: {
    marginRight: 4,
  },
  statusSkeleton: {
    flexShrink: 1,
    maxWidth: 220,
  },
  statusLine: {
    fontSize: font.bodySm,
    color: color.overlayTextHi,
    textAlign: 'center',
    flexShrink: 1,
  },
  statusLinePulse: {
    color: color.accent,
  },
  scanQrFallback: {
    flex: 1,
    backgroundColor: color.bg,
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
