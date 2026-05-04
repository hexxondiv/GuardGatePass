import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInput as TextInputType,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConnectivityMode } from '../context/ConnectivityModeContext';
import { useEstateContext } from '../context/EstateContext';
import { useDebounce } from '../hooks/useDebounce';
import { adminCreateInstantGuest } from '../services/gatepassService';
import { getEstateMembers } from '../services/estateService';
import type { EstateMember } from '../types/gateApi';
import { getApiErrorMessage } from '../utils/apiErrors';
import { sanitizePhoneForApi } from '../utils/phoneInput';
import SkeletonBlock from '../components/SkeletonBlock';
import VerifyConnectivityHeaderRight from '../components/VerifyConnectivityHeaderRight';
import { color, font, radii, space } from '../theme/tokens';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { GuardTabParamList } from '../navigation/types';

const HOST_SEARCH_DEBOUNCE_MS = 350;
const INSTANT_SUCCESS_MS = 3500;
type InstantGuestField = 'host' | 'guestName' | 'guestNumber' | 'purpose';

export default function InstantGuestScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<GuardTabParamList>>();
  const queryClient = useQueryClient();
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

  const [hostInput, setHostInput] = useState('');
  const debouncedHostQ = useDebounce(hostInput, HOST_SEARCH_DEBOUNCE_MS);
  const [selectedHost, setSelectedHost] = useState<{ userId: number; label: string } | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestNumber, setGuestNumber] = useState('');
  const [purpose, setPurpose] = useState('');
  const [focusedField, setFocusedField] = useState<InstantGuestField | null>(null);
  const [instantFormError, setInstantFormError] = useState<string | null>(null);
  const [instantSuccessLine, setInstantSuccessLine] = useState<string | null>(null);
  const instantSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guestNameRef = useRef<TextInputType>(null);
  const guestNumberRef = useRef<TextInputType>(null);
  const purposeRef = useRef<TextInputType>(null);

  const {
    data: hostSearchData,
    isFetching: hostSearchLoading,
    isError: hostSearchError,
    error: hostSearchErrorDetail,
  } = useQuery({
    queryKey: ['instant-guest', 'host-search', activeEstateId, debouncedHostQ],
    queryFn: () =>
      getEstateMembers(activeEstateId!, {
        q: debouncedHostQ.trim(),
        skip: 0,
        limit: 12,
      }),
    enabled: Boolean(
      activeEstateId && debouncedHostQ.trim().length >= 2 && !selectedHost && isOnline,
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

  useEffect(
    () => () => {
      if (instantSuccessTimerRef.current) {
        clearTimeout(instantSuccessTimerRef.current);
      }
    },
    [],
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
    setTimeout(() => guestNameRef.current?.focus(), 0);
  }, []);

  const submitInstantGuest = useCallback(() => {
    if (!selectedHost || !guestName.trim() || !guestNumber.trim() || instantMutation.isPending) {
      return;
    }
    Keyboard.dismiss();
    instantMutation.mutate();
  }, [guestName, guestNumber, instantMutation, selectedHost]);

  const focusGuestName = useCallback(() => {
    if (!selectedHost) {
      setInstantFormError('Select a resident host.');
      return;
    }
    setInstantFormError(null);
    guestNameRef.current?.focus();
  }, [selectedHost]);

  const focusGuestNumber = useCallback(() => {
    if (!guestName.trim()) {
      setInstantFormError('Enter visitor name.');
      return;
    }
    setInstantFormError(null);
    guestNumberRef.current?.focus();
  }, [guestName]);

  const focusPurpose = useCallback(() => {
    if (!guestNumber.trim()) {
      setInstantFormError('Enter phone or vehicle plate.');
      return;
    }
    setInstantFormError(null);
    purposeRef.current?.focus();
  }, [guestNumber]);

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

  const formDisabled = instantMutation.isPending;

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
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.shell}>
            {activeEstateId && isOnline ? (
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
                        style={[styles.fieldInput, focusedField === 'host' && styles.fieldInputFocused]}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!formDisabled && Boolean(activeEstateId)}
                        accessibilityLabel="Search resident host"
                        cursorColor={color.brandAmber}
                        selectionColor={color.brandAmber}
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onFocus={() => setFocusedField('host')}
                        onBlur={() => setFocusedField(null)}
                        onSubmitEditing={focusGuestName}
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
                      ref={guestNameRef}
                      value={guestName}
                      onChangeText={(t) => {
                        setGuestName(t);
                        setInstantFormError(null);
                      }}
                      placeholder="Full name"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      style={[styles.fieldInput, focusedField === 'guestName' && styles.fieldInputFocused]}
                      editable={!formDisabled}
                      accessibilityLabel="Visitor name"
                      cursorColor={color.brandAmber}
                      selectionColor={color.brandAmber}
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onFocus={() => setFocusedField('guestName')}
                      onBlur={() => setFocusedField(null)}
                      onSubmitEditing={focusGuestNumber}
                    />

                    <Text style={styles.fieldLabel}>Phone or plate</Text>
                    <TextInput
                      ref={guestNumberRef}
                      value={guestNumber}
                      onChangeText={(t) => {
                        setGuestNumber(t);
                        setInstantFormError(null);
                      }}
                      placeholder="Phone or vehicle plate"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      style={[styles.fieldInput, focusedField === 'guestNumber' && styles.fieldInputFocused]}
                      editable={!formDisabled}
                      accessibilityLabel="Guest phone or plate"
                      cursorColor={color.brandAmber}
                      selectionColor={color.brandAmber}
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onFocus={() => setFocusedField('guestNumber')}
                      onBlur={() => setFocusedField(null)}
                      onSubmitEditing={focusPurpose}
                    />

                    <Text style={styles.fieldLabel}>
                      Purpose <Text style={styles.fieldLabelOptional}>(optional)</Text>
                    </Text>
                    <TextInput
                      ref={purposeRef}
                      value={purpose}
                      onChangeText={setPurpose}
                      placeholder="Visit purpose"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      style={[styles.fieldInput, focusedField === 'purpose' && styles.fieldInputFocused]}
                      editable={!formDisabled}
                      accessibilityLabel="Visit purpose optional"
                      cursorColor={color.brandAmber}
                      selectionColor={color.brandAmber}
                      returnKeyType="done"
                      blurOnSubmit={false}
                      onFocus={() => setFocusedField('purpose')}
                      onBlur={() => setFocusedField(null)}
                      onSubmitEditing={submitInstantGuest}
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
                  account. Open Settings to choose an active estate.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  fieldInputFocused: {
    borderColor: color.brandAmber,
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
});
