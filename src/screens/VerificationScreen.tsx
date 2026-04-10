import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
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
import { useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useConnectivityMode } from '../context/ConnectivityModeContext';
import { useEstateContext } from '../context/EstateContext';
import { useDebounce } from '../hooks/useDebounce';
import {
  alignOfflineToggleFromOnlineVerify,
  queueOfflineVerifyForAccessCode,
} from '../services/guardSyncCoordinator';
import { adminCreateInstantGuest, verifyGatePass } from '../services/gatepassService';
import { getEstateMembers } from '../services/estateService';
import type { EstateMember, GatePassVerificationResult } from '../types/gateApi';
import {
  CODE_DIGITS,
  DEBOUNCE_MS,
  isCompleteAccessCode,
  rawScanToAccessCode,
  RESULT_RESET_MS,
} from '../utils/accessCode';
import { getOrCreateDeviceId } from '../utils/deviceId';
import { getApiErrorMessage } from '../utils/apiErrors';
import { sanitizePhoneForApi } from '../utils/phoneInput';
import { extractQueryParam } from '../utils/linkingUrl';
import { preloadVerifyOutcomeSounds, verifyOutcomeFeedback } from '../utils/verifyOutcomeFeedback';
import SkeletonBlock from '../components/SkeletonBlock';
import { color, font, radii, space } from '../theme/tokens';
import type { GuardTabParamList } from '../navigation/types';
import type { ScanQrModalProps } from './ScanQrModal';

const KEYPAD_ROWS: (string | number)[][] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  ['clear', 0, 'del'],
];

/** Web verification instant host search (`useDebounce(hostInput, 350)`). */
const HOST_SEARCH_DEBOUNCE_MS = 350;

/** Web `VerificationConsole.module.css` flip transition. */
const FLIP_MS = 550;

/** Brief inline success after instant guest (parity with web toast visibility). */
const INSTANT_SUCCESS_MS = 3500;

export default function VerificationScreen() {
  const route = useRoute<RouteProp<GuardTabParamList, 'Verification'>>();
  const queryClient = useQueryClient();
  const { authUser } = useAuth();
  const { activeEstateId } = useEstateContext();
  const { operationalOnline: isOnline, physicalOnline, forceOfflineMode } = useConnectivityMode();
  const liveDotOpacity = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion || !isOnline) {
      liveDotOpacity.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(liveDotOpacity, {
          toValue: 0.28,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(liveDotOpacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [isOnline, liveDotOpacity, reduceMotion]);

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

  const [consoleMode, setConsoleMode] = useState<'verify' | 'instant'>('verify');
  const [hostInput, setHostInput] = useState('');
  const debouncedHostQ = useDebounce(hostInput, HOST_SEARCH_DEBOUNCE_MS);
  const [selectedHost, setSelectedHost] = useState<{ userId: number; label: string } | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestNumber, setGuestNumber] = useState('');
  const [purpose, setPurpose] = useState('');
  const [instantFormError, setInstantFormError] = useState<string | null>(null);
  const [instantSuccessLine, setInstantSuccessLine] = useState<string | null>(null);
  const instantSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const {
    data: hostSearchData,
    isFetching: hostSearchLoading,
    isError: hostSearchError,
    error: hostSearchErrorDetail,
  } = useQuery({
    queryKey: ['verification', 'host-search', activeEstateId, debouncedHostQ],
    queryFn: () =>
      getEstateMembers(activeEstateId!, {
        q: debouncedHostQ.trim(),
        skip: 0,
        limit: 12,
      }),
    enabled: Boolean(
      consoleMode === 'instant' &&
        activeEstateId &&
        debouncedHostQ.trim().length >= 2 &&
        !selectedHost,
    ),
  });

  const instantMutation = useMutation({
    mutationFn: () => {
      const hid = selectedHost!.userId;
      return adminCreateInstantGuest({
        host_id: hid,
        guest_name: guestName.trim(),
        guest_number: sanitizePhoneForApi(guestNumber),
        purpose: purpose.trim() || undefined,
      });
    },
    onSuccess: async (data) => {
      const code = data.access_code;
      const nameSnapshot = guestName.trim();
      setInstantFormError(null);
      setGuestName('');
      setGuestNumber('');
      setPurpose('');
      setSelectedHost(null);
      setHostInput('');
      setInstantSuccessLine(
        code
          ? `Instant guest added — access code ${code}`
          : `Instant guest registered for ${nameSnapshot}.`,
      );
      if (instantSuccessTimerRef.current) {
        clearTimeout(instantSuccessTimerRef.current);
      }
      instantSuccessTimerRef.current = setTimeout(() => {
        setInstantSuccessLine(null);
        instantSuccessTimerRef.current = null;
      }, INSTANT_SUCCESS_MS);
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['gatepass'] });
    },
    onError: (error: unknown) => {
      setInstantFormError(getApiErrorMessage(error, 'Failed to add instant guest.'));
    },
  });

  useEffect(() => {
    verifyResetRef.current = () => verifyMutation.reset();
  });

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(
    () => () => {
      if (instantSuccessTimerRef.current) {
        clearTimeout(instantSuccessTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (consoleMode === 'verify') {
      setInstantFormError(null);
    }
  }, [consoleMode]);

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
    if (consoleMode !== 'verify') {
      return;
    }
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
    consoleMode,
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

  const handleHostFieldChange = useCallback((value: string) => {
    setSelectedHost(null);
    setHostInput(value);
    setInstantFormError(null);
  }, []);

  const selectHostMember = useCallback((m: EstateMember) => {
    const label = `${m.user.name} · ${m.user.phone || '—'}`;
    setSelectedHost({ userId: m.user_id, label });
    setHostInput('');
    setInstantFormError(null);
    Keyboard.dismiss();
  }, []);

  const submitInstantGuest = useCallback(() => {
    if (!selectedHost || !guestName.trim() || !guestNumber.trim() || instantMutation.isPending) {
      return;
    }
    instantMutation.mutate();
  }, [guestName, guestNumber, instantMutation, selectedHost]);

  const modeToggleDisabled =
    verifyMutation.isPending ||
    instantMutation.isPending ||
    outcome !== null ||
    offlineVerifyBusy;

  const hostSuggestions = hostSearchData?.items ?? [];
  const showHostList =
    Boolean(activeEstateId) &&
    hostInput.trim().length >= 2 &&
    !selectedHost &&
    hostSuggestions.length > 0;

  const showHostEmpty =
    Boolean(activeEstateId) &&
    !selectedHost &&
    !hostSearchLoading &&
    !hostSearchError &&
    debouncedHostQ.trim().length >= 2 &&
    hostInput.trim().length >= 2 &&
    hostSearchData !== undefined &&
    hostSuggestions.length === 0;

  const canSubmitInstant =
    Boolean(selectedHost && guestName.trim() && guestNumber.trim()) && !instantMutation.isPending;

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
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!activeEstateId && consoleMode === 'verify' ? (
            <View style={styles.warnBanner}>
              <Text style={styles.warnText}>
                No estate scope — requests may fail until X-Estate-Id is set from your account.
              </Text>
            </View>
          ) : null}

          <View
            style={styles.connectivityBar}
            accessibilityRole="text"
            accessibilityLabel={
              isOnline
                ? 'Live Mode, online'
                : !physicalOnline
                  ? 'Offline Mode, no network'
                  : 'Offline Mode, manual offline enabled'
            }
            accessibilityLiveRegion="polite"
          >
            {isOnline ? (
              <Animated.View style={[styles.liveDot, { opacity: liveDotOpacity }]} />
            ) : (
              <View style={styles.offlineDot} />
            )}
            <Text style={[styles.connectivityLabel, isOnline ? styles.connectivityLabelLive : styles.connectivityLabelOffline]}>
              {isOnline ? 'Live Mode' : 'Offline Mode'}
            </Text>
          </View>

          <View style={styles.shell}>
            <View
              style={[styles.modeSegment, modeToggleDisabled && styles.modeSegmentDisabled]}
              accessibilityRole="tablist"
            >
              <Pressable
                style={[styles.modeSeg, consoleMode === 'verify' && styles.modeSegOn]}
                disabled={modeToggleDisabled}
                onPress={() => setConsoleMode('verify')}
                accessibilityRole="tab"
                accessibilityState={{ selected: consoleMode === 'verify' }}
                accessibilityLabel="Verify access code"
              >
                <Text
                  style={[styles.modeSegText, consoleMode === 'verify' && styles.modeSegTextOn]}
                >
                  Verify
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modeSeg, consoleMode === 'instant' && styles.modeSegOn]}
                disabled={modeToggleDisabled || !isOnline}
                onPress={() => setConsoleMode('instant')}
                accessibilityRole="tab"
                accessibilityState={{ selected: consoleMode === 'instant' }}
                accessibilityLabel="Instant guest walk-in"
              >
                <Text
                  style={[styles.modeSegText, consoleMode === 'instant' && styles.modeSegTextOn]}
                >
                  Instant guest
                </Text>
              </Pressable>
            </View>

            {consoleMode === 'verify' ? (
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
                    <Text style={styles.eyebrow} maxFontSizeMultiplier={1.6}>
                      Access control
                    </Text>
                    <Text style={styles.title} maxFontSizeMultiplier={1.75}>
                      Enter access code
                    </Text>

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
                            style={styles.digitText}
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
                            accessibilityHint="Deletes the last digit of the access code"
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
                            accessibilityHint="Adds this digit to the access code"
                          >
                            <Text style={styles.keyText}>{key}</Text>
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
            ) : activeEstateId && isOnline ? (
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
                    <Text style={styles.eyebrow} maxFontSizeMultiplier={1.6}>
                      Walk-in visitor
                    </Text>
                    <Text style={styles.title} maxFontSizeMultiplier={1.75}>
                      Add instant guest
                    </Text>
                    <Text style={styles.instantSubtitle}>
                      Search the resident host, then enter visitor details.
                    </Text>

                    <Text style={styles.fieldLabel}>Resident host</Text>
                    <View style={styles.hostSuggestWrap}>
                      <TextInput
                        value={selectedHost ? selectedHost.label : hostInput}
                        onChangeText={handleHostFieldChange}
                        placeholder={
                          selectedHost ? '' : 'Type name or phone (min. 2 characters)'
                        }
                        placeholderTextColor="rgba(255,255,255,0.35)"
                        style={styles.fieldInput}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!instantMutation.isPending && Boolean(activeEstateId)}
                        accessibilityLabel="Search resident host"
                      />
                      {hostSearchLoading ? (
                        <ActivityIndicator color={color.accent} style={styles.hostSearchSpinner} />
                      ) : null}
                      {showHostList ? (
                        <View
                          style={styles.hostSuggestList}
                          accessibilityRole="radiogroup"
                          accessibilityLabel="Matching residents"
                        >
                          <ScrollView
                            nestedScrollEnabled
                            keyboardShouldPersistTaps="handled"
                            style={styles.hostSuggestScroll}
                          >
                            {hostSuggestions.map((m) => (
                              <Pressable
                                key={m.id}
                                style={({ pressed }) => [
                                  styles.hostSuggestItem,
                                  pressed && styles.hostSuggestItemPressed,
                                ]}
                                onPress={() => selectHostMember(m)}
                                accessibilityRole="radio"
                                accessibilityLabel={`${m.user.name}, ${m.user.phone || 'no phone'}`}
                              >
                                <Text style={styles.hostSuggestName}>{m.user.name}</Text>
                                <Text style={styles.hostSuggestMeta}>
                                  {m.user.phone || '—'}
                                  {m.role?.name ? ` · ${m.role.name}` : ''}
                                </Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </View>
                      ) : null}
                    </View>
                    {hostSearchLoading ? (
                      <View style={styles.hostSearchSkeletonBelow} accessibilityElementsHidden importantForAccessibility="no">
                        <SkeletonBlock height={10} width="100%" reduceMotion={reduceMotion} />
                        <SkeletonBlock height={10} width="94%" reduceMotion={reduceMotion} />
                        <SkeletonBlock height={10} width="82%" reduceMotion={reduceMotion} />
                      </View>
                    ) : null}
                    {hostSearchError ? (
                      <Text style={styles.instantErrorText}>
                        {getApiErrorMessage(
                          hostSearchErrorDetail,
                          'Could not load residents for search.',
                        )}
                      </Text>
                    ) : null}
                    {showHostEmpty ? (
                      <Text style={styles.hostSearchEmptyText}>No matching residents in this estate.</Text>
                    ) : null}

                    <Text style={styles.fieldLabel}>Visitor name</Text>
                    <TextInput
                      value={guestName}
                      onChangeText={(t) => {
                        setGuestName(t);
                        setInstantFormError(null);
                      }}
                      placeholder="Full name"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      style={styles.fieldInput}
                      editable={!instantMutation.isPending}
                      accessibilityLabel="Visitor name"
                    />

                    <Text style={styles.fieldLabel}>Phone or plate</Text>
                    <TextInput
                      value={guestNumber}
                      onChangeText={(t) => {
                        setGuestNumber(t);
                        setInstantFormError(null);
                      }}
                      placeholder="Phone or vehicle plate"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      style={styles.fieldInput}
                      editable={!instantMutation.isPending}
                      accessibilityLabel="Guest phone or plate"
                    />

                    <Text style={styles.fieldLabel}>
                      Purpose <Text style={styles.fieldLabelOptional}>(optional)</Text>
                    </Text>
                    <TextInput
                      value={purpose}
                      onChangeText={setPurpose}
                      placeholder="Visit purpose"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      style={styles.fieldInput}
                      editable={!instantMutation.isPending}
                      accessibilityLabel="Visit purpose optional"
                    />

                    {instantFormError ? (
                      <Text style={styles.instantErrorText}>{instantFormError}</Text>
                    ) : null}
                    {instantSuccessLine ? (
                      <Text style={styles.instantSuccessText}>{instantSuccessLine}</Text>
                    ) : null}

                    <Pressable
                      style={({ pressed }) => [
                        styles.submitInstant,
                        !canSubmitInstant && styles.submitInstantDisabled,
                        pressed && canSubmitInstant && styles.submitInstantPressed,
                      ]}
                      disabled={!canSubmitInstant}
                      onPress={submitInstantGuest}
                      accessibilityRole="button"
                      accessibilityLabel="Create instant guest pass"
                    >
                      {instantMutation.isPending ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.submitInstantText}>Create instant guest pass</Text>
                      )}
                    </Pressable>
                  </View>
                </LinearGradient>
              </View>
            ) : activeEstateId && !isOnline ? (
              <View style={styles.instantBlockedCard}>
                <Text style={styles.instantBlockedTitle}>Instant guest unavailable offline</Text>
                <Text style={styles.instantBlockedBody}>
                  Walk-in guests are created on the server. Connect to the network or use Verify with a cached pass.
                </Text>
              </View>
            ) : (
              <View style={styles.instantBlockedCard}>
                <Text style={styles.instantBlockedTitle}>No estate scope</Text>
                <Text style={styles.instantBlockedBody}>
                  No estate scope on this session — requests may fail until X-Estate-Id is set from your
                  account. Select an estate scope to search residents and add walk-in guests. Use Settings to
                  choose an active estate, or switch to Verify.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
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
    backgroundColor: color.bg,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
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
  connectivityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
    gap: space.sm,
    marginBottom: space.lg,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: color.borderMuted,
    backgroundColor: color.overlayLow,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.success,
    shadowColor: color.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 4,
    elevation: 4,
  },
  offlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.danger,
  },
  connectivityLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  connectivityLabelLive: {
    color: color.success,
  },
  connectivityLabelOffline: {
    color: color.danger,
  },
  modeSegment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modeSegmentDisabled: {
    opacity: 0.55,
  },
  modeSeg: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  modeSegOn: {
    backgroundColor: color.accentGlow,
  },
  modeSegText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
  },
  modeSegTextOn: {
    color: color.text,
  },
  instantSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 16,
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 6,
    marginTop: 4,
  },
  fieldLabelOptional: {
    fontWeight: '400',
    color: 'rgba(255,255,255,0.45)',
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#f0f6fc',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  hostSuggestWrap: {
    position: 'relative',
    marginBottom: 8,
    zIndex: 2,
  },
  hostSearchSpinner: {
    position: 'absolute',
    right: 12,
    top: 14,
  },
  hostSearchSkeletonBelow: {
    marginTop: 6,
    marginBottom: 6,
    gap: 6,
  },
  hostSuggestList: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 10,
    backgroundColor: 'rgba(14, 16, 22, 0.98)',
    maxHeight: 220,
    overflow: 'hidden',
  },
  hostSuggestScroll: {
    maxHeight: 220,
  },
  hostSuggestItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  hostSuggestItemPressed: {
    backgroundColor: 'rgba(88, 166, 255, 0.12)',
  },
  hostSuggestName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f0f6fc',
  },
  hostSuggestMeta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  hostSearchEmptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  instantErrorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#f85149',
    lineHeight: 20,
  },
  instantSuccessText: {
    marginTop: 12,
    fontSize: 14,
    color: '#3fb950',
    fontWeight: '600',
    lineHeight: 20,
  },
  submitInstant: {
    marginTop: 20,
    backgroundColor: '#238636',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitInstantPressed: {
    opacity: 0.9,
  },
  submitInstantDisabled: {
    backgroundColor: 'rgba(35, 134, 54, 0.35)',
  },
  submitInstantText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  instantBlockedCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(210, 153, 34, 0.4)',
    backgroundColor: 'rgba(210, 153, 34, 0.1)',
    padding: 20,
    marginTop: 4,
  },
  instantBlockedTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#d29922',
    marginBottom: 8,
  },
  instantBlockedBody: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 20,
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
    marginBottom: space.lg,
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
    fontSize: font.digitDisplay,
    fontWeight: '700',
    color: color.text,
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
    marginTop: space.lg,
    gap: space.sm,
    minHeight: 28,
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
