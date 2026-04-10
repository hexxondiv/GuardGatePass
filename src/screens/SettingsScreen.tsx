import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useConnectivityMode } from '../context/ConnectivityModeContext';
import { fetchEstateById } from '../services/estateService';
import {
  countPendingEvents,
  flushGuardSyncEventQueue,
  readLastGuardSyncMeta,
  runGuardSyncBootstrap,
} from '../services/guardSyncCoordinator';
import type { StaffJwtPayload } from '../types/auth';
import type { EstateSummary } from '../utils/accessControl';
import {
  GUARD_DEV_API_HOST_OVERRIDE_KEY,
  getEffectiveApiBaseUrlAsync,
} from '../config/app_constants';
import { refreshApiClientBaseUrl } from '../utils/apiClient';
import { getApiErrorMessage } from '../utils/apiErrors';
import { color, radii, space } from '../theme/tokens';

function formatSyncTime(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function normalizeEstateId(value: string | null | undefined): string {
  return value == null ? '' : String(value).trim();
}

function formatRoles(roles: string[]): string {
  const r = roles.filter(Boolean);
  if (r.length === 0) return '—';
  return r
    .map((x) => x.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(' · ');
}

/** Matches client-side fallbacks like `Estate 1` from JWT claims without `estate_name`. */
function isLikelyAutoEstateName(label: string, estateIdStr: string): boolean {
  const t = label.trim();
  if (!t) return true;
  if (t === `Estate ${estateIdStr}`) return true;
  return /^Estate\s+\d+$/i.test(t);
}

function nameFromJwtEstatesClaim(authUser: StaffJwtPayload | null, activeIdNorm: string): string {
  const arr = authUser?.estates;
  if (!Array.isArray(arr)) return '';
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const rid = o.id ?? o.estate_id;
    if (rid === undefined || rid === null) continue;
    if (normalizeEstateId(String(rid)) !== activeIdNorm) continue;
    const nm = o.name ?? o.estate_name;
    if (typeof nm === 'string' && nm.trim()) return nm.trim();
  }
  return '';
}

function resolveActiveEstateSync(
  activeEstateId: string | null,
  availableEstates: EstateSummary[],
  authUser: StaffJwtPayload | null,
): string {
  const activeIdNorm = normalizeEstateId(activeEstateId);
  if (!activeIdNorm) return '—';

  const jwtIdNorm =
    authUser?.estate_id !== undefined && authUser?.estate_id !== null
      ? normalizeEstateId(String(authUser.estate_id))
      : '';
  const jwtName =
    typeof authUser?.estate_name === 'string' && authUser.estate_name.trim()
      ? authUser.estate_name.trim()
      : '';

  if (jwtIdNorm === activeIdNorm && jwtName) {
    return jwtName;
  }

  const row = availableEstates.find((e) => normalizeEstateId(e.id) === activeIdNorm);
  const rowName = row?.name?.trim() ?? '';

  if (rowName && !isLikelyAutoEstateName(rowName, activeIdNorm)) {
    return rowName;
  }

  const fromJwtArray = nameFromJwtEstatesClaim(authUser, activeIdNorm);
  if (fromJwtArray) {
    return fromJwtArray;
  }

  if (jwtName && availableEstates.length <= 1) {
    return jwtName;
  }

  return rowName || jwtName || `Estate ${activeIdNorm}`;
}

const VERSION_TAP_UNLOCK = 7;

export default function SettingsScreen() {
  const { logout, activeEstateId, availableEstates, selectEstate, roles, authUser } = useAuth();
  const { forceOfflineMode, setForceOfflineMode } = useConnectivityMode();
  const [lastSyncIso, setLastSyncIso] = useState<string | null>(null);
  const [passCount, setPassCount] = useState<number | null>(null);
  const [pendingEvents, setPendingEvents] = useState(0);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [effectiveApiBase, setEffectiveApiBase] = useState<string>('');
  const [overrideHostDraft, setOverrideHostDraft] = useState('');
  const [versionTapCount, setVersionTapCount] = useState(0);

  const refreshLocalMeta = useCallback(async () => {
    const meta = await readLastGuardSyncMeta();
    setLastSyncIso(meta.lastSyncIso);
    setPassCount(meta.passCount);
    setPendingEvents(await countPendingEvents());
  }, []);

  const refreshApiDebug = useCallback(async () => {
    const resolved = await getEffectiveApiBaseUrlAsync();
    setEffectiveApiBase(resolved);
    try {
      const raw = await SecureStore.getItemAsync(GUARD_DEV_API_HOST_OVERRIDE_KEY);
      setOverrideHostDraft(raw?.trim() ?? '');
    } catch {
      setOverrideHostDraft('');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshLocalMeta();
    }, [refreshLocalMeta]),
  );

  useEffect(() => {
    if (roles.includes('super_admin')) {
      void refreshApiDebug();
    }
  }, [roles, refreshApiDebug]);

  useEffect(() => {
    if (versionTapCount === 0) {
      return;
    }
    const id = setTimeout(() => setVersionTapCount(0), 3200);
    return () => clearTimeout(id);
  }, [versionTapCount]);

  const showHostOverrideUi =
    __DEV__ || (versionTapCount >= VERSION_TAP_UNLOCK && roles.includes('super_admin'));

  const applyHostOverride = useCallback(async () => {
    const t = overrideHostDraft.trim();
    if (!t) {
      Alert.alert('API host', 'Enter a host URL, or use Clear override.', [{ text: 'OK' }]);
      return;
    }
    try {
      await SecureStore.setItemAsync(GUARD_DEV_API_HOST_OVERRIDE_KEY, t);
      await refreshApiClientBaseUrl();
      setEffectiveApiBase(await getEffectiveApiBaseUrlAsync());
      Alert.alert('API host', 'Staging host saved. New requests use this base URL.', [{ text: 'OK' }]);
    } catch (e: unknown) {
      Alert.alert('Could not save', getApiErrorMessage(e), [{ text: 'OK' }]);
    }
  }, [overrideHostDraft]);

  const clearHostOverride = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync(GUARD_DEV_API_HOST_OVERRIDE_KEY);
      setOverrideHostDraft('');
      await refreshApiClientBaseUrl();
      setEffectiveApiBase(await getEffectiveApiBaseUrlAsync());
      Alert.alert('API host', 'Reverted to default host from build configuration.', [{ text: 'OK' }]);
    } catch (e: unknown) {
      Alert.alert('Could not clear', getApiErrorMessage(e), [{ text: 'OK' }]);
    }
  }, []);

  const activeIdNorm = normalizeEstateId(activeEstateId);
  const syncEstateLabel = useMemo(
    () => resolveActiveEstateSync(activeEstateId, availableEstates, authUser),
    [activeEstateId, availableEstates, authUser],
  );

  const [apiEstateName, setApiEstateName] = useState<string | null>(null);

  useEffect(() => {
    if (forceOfflineMode) {
      setApiEstateName(null);
      return;
    }
    if (!activeEstateId || !activeIdNorm) {
      setApiEstateName(null);
      return;
    }
    if (!isLikelyAutoEstateName(syncEstateLabel, activeIdNorm)) {
      setApiEstateName(null);
      return;
    }
    let cancelled = false;
    void fetchEstateById(activeEstateId)
      .then((data) => {
        if (!cancelled && data.name?.trim()) {
          setApiEstateName(data.name.trim());
        }
      })
      .catch(() => {
        if (!cancelled) setApiEstateName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeEstateId, activeIdNorm, syncEstateLabel, forceOfflineMode]);

  const activeEstateDisplay = apiEstateName ?? syncEstateLabel;

  const onRefreshBootstrap = useCallback(async () => {
    if (forceOfflineMode) {
      Alert.alert(
        'Manual offline mode',
        'Turn off the switch below to refresh the pass cache over the network.',
        [{ text: 'OK' }],
        { cancelable: true },
      );
      return;
    }
    if (!activeEstateId) {
      Alert.alert('No estate', 'Select an active estate before syncing.');
      return;
    }
    setBootstrapBusy(true);
    try {
      const out = await runGuardSyncBootstrap(activeEstateId);
      if (!out.ok) {
        Alert.alert('Sync failed', out.message, [{ text: 'OK' }], { cancelable: true });
        return;
      }
      await refreshLocalMeta();
      Alert.alert('Synced', `Loaded ${out.passCount} pass(es) from the server.`, [{ text: 'OK' }]);
    } finally {
      setBootstrapBusy(false);
    }
  }, [activeEstateId, refreshLocalMeta, forceOfflineMode]);

  const onUploadQueue = useCallback(async () => {
    if (forceOfflineMode) {
      Alert.alert(
        'Manual offline mode',
        'Turn off the switch below to upload queued events over the network.',
        [{ text: 'OK' }],
        { cancelable: true },
      );
      return;
    }
    if (!activeEstateId) {
      Alert.alert('No estate', 'Select an active estate before uploading offline events.');
      return;
    }
    setUploadBusy(true);
    try {
      const out = await flushGuardSyncEventQueue(activeEstateId);
      await refreshLocalMeta();
      if (out.uploaded === 0) {
        Alert.alert('Queue', 'No pending offline events.', [{ text: 'OK' }]);
        return;
      }
      const lines = [
        `Processed ${out.uploaded} event(s).`,
        `Accepted: ${out.accepted}`,
        `Duplicates (idempotent): ${out.duplicates}`,
      ];
      if (out.conflicts.length > 0) {
        lines.push('', 'Conflicts:', ...out.conflicts.slice(0, 6));
        if (out.conflicts.length > 6) {
          lines.push(`…and ${out.conflicts.length - 6} more`);
        }
      }
      Alert.alert('Upload finished', lines.join('\n'), [{ text: 'OK' }], { cancelable: true });
    } catch (e: unknown) {
      Alert.alert('Upload failed', getApiErrorMessage(e), [{ text: 'OK' }], { cancelable: true });
    } finally {
      setUploadBusy(false);
    }
  }, [activeEstateId, refreshLocalMeta, forceOfflineMode]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={['#1a2332', '#0d1117']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTitleRow}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="settings-outline" size={26} color="#58a6ff" />
            </View>
            <Text style={styles.heroTitle}>Settings</Text>
          </View>
          <Text style={styles.heroSubtitle}>Account, estate, and offline pass data</Text>
        </LinearGradient>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="person-outline" size={20} color="#8b949e" />
            <Text style={styles.cardTitle}>Account</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Role</Text>
            <Text style={styles.kvValue}>{formatRoles(roles)}</Text>
          </View>
          <View style={styles.hairline} />
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Active estate</Text>
            <Text style={styles.kvValue} numberOfLines={2}>
              {activeEstateDisplay}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="cloud-download-outline" size={20} color="#8b949e" />
            <Text style={styles.cardTitle}>Offline pass cache</Text>
          </View>

          <View style={styles.manualOfflineRow}>
            <View style={styles.manualOfflineTextCol}>
              <Text style={styles.manualOfflineTitle}>Manual offline mode</Text>
              <Text style={styles.manualOfflineSub}>
                Behave as if you have no network: cached passes only, even on Wi‑Fi or mobile data. Turn off to go
                live again — you need an internet connection to switch back.
              </Text>
            </View>
            <Switch
              value={forceOfflineMode}
              onValueChange={(v) => void setForceOfflineMode(v)}
              trackColor={{ false: '#30363d', true: 'rgba(210, 153, 34, 0.45)' }}
              thumbColor={forceOfflineMode ? '#d29922' : '#6e7681'}
              ios_backgroundColor="#30363d"
              accessibilityLabel="Manual offline mode"
            />
          </View>

          <View style={styles.metrics}>
            <View style={styles.metricTile}>
              <Ionicons name="time-outline" size={22} color="#58a6ff" />
              <Text style={styles.metricLabel}>Last sync</Text>
              <Text style={styles.metricValue} numberOfLines={2}>
                {formatSyncTime(lastSyncIso)}
              </Text>
            </View>
            <View style={styles.metricTile}>
              <Ionicons name="layers-outline" size={22} color="#a371f7" />
              <Text style={styles.metricLabel}>Passes saved</Text>
              <Text style={styles.metricValue}>{passCount != null ? String(passCount) : '—'}</Text>
            </View>
            <View style={styles.metricTile}>
              <View style={styles.metricIconRow}>
                <Ionicons name="arrow-up-circle-outline" size={22} color="#d29922" />
                {pendingEvents > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{pendingEvents > 99 ? '99+' : pendingEvents}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.metricLabel}>Queued</Text>
              <Text style={styles.metricValue}>{pendingEvents}</Text>
            </View>
          </View>

          <Text style={styles.explainer}>
            We keep active passes on this device so you can verify at the gate without internet. Refresh pulls the
            latest list; offline verifications upload when you are back online.
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.actionPrimary,
              (bootstrapBusy || forceOfflineMode) && styles.actionDisabled,
              pressed && styles.actionPressed,
            ]}
            disabled={bootstrapBusy || forceOfflineMode}
            onPress={() => void onRefreshBootstrap()}
            accessibilityRole="button"
            accessibilityLabel="Refresh pass cache from server"
          >
            {bootstrapBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="refresh" size={22} color="#fff" />
                <View style={styles.actionTextCol}>
                  <Text style={styles.actionPrimaryTitle}>Refresh pass cache</Text>
                  <Text style={styles.actionPrimarySub}>Download the latest passes from the server</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
              </>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionSecondary,
              (uploadBusy || pendingEvents === 0 || forceOfflineMode) && styles.actionDisabled,
              pressed &&
                !(uploadBusy || pendingEvents === 0 || forceOfflineMode) &&
                styles.actionPressed,
            ]}
            disabled={uploadBusy || pendingEvents === 0 || forceOfflineMode}
            onPress={() => void onUploadQueue()}
            accessibilityRole="button"
            accessibilityLabel="Upload pending offline events"
          >
            {uploadBusy ? (
              <ActivityIndicator color="#58a6ff" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={22} color="#58a6ff" />
                <View style={styles.actionTextCol}>
                  <Text style={styles.actionSecondaryTitle}>Upload offline queue</Text>
                  <Text style={styles.actionSecondarySub}>Send pending verifications to the server</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(88,166,255,0.45)" />
              </>
            )}
          </Pressable>
        </View>

        {roles.includes('super_admin') ? (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="code-working-outline" size={20} color="#8b949e" />
              <Text style={styles.cardTitle}>API (superuser debug)</Text>
            </View>
            <Text style={styles.apiDebugExplainer}>
              Resolved HTTP base used by the app (no JWT or access codes shown). For staging, set a host override
              below — host only, same contract as EXPO_PUBLIC_DEV_API_BASE_URL in .env.example.
            </Text>
            <Text
              style={styles.apiDebugValue}
              selectable
              accessibilityLabel={`Effective API base URL ${effectiveApiBase}`}
            >
              {effectiveApiBase || '—'}
            </Text>
            {showHostOverrideUi ? (
              <>
                <Text style={styles.overrideLabel}>Staging / dev host override</Text>
                <TextInput
                  value={overrideHostDraft}
                  onChangeText={setOverrideHostDraft}
                  placeholder="e.g. https://your-staging.example.com"
                  placeholderTextColor={color.textFaint}
                  style={styles.overrideInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable
                  accessibilityLabel="API host override"
                />
                <View style={styles.overrideActions}>
                  <Pressable
                    style={({ pressed }) => [styles.overrideBtn, pressed && styles.actionPressed]}
                    onPress={() => void applyHostOverride()}
                    accessibilityRole="button"
                    accessibilityLabel="Save API host override"
                  >
                    <Text style={styles.overrideBtnText}>Save host</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.overrideBtnGhost, pressed && styles.actionPressed]}
                    onPress={() => void clearHostOverride()}
                    accessibilityRole="button"
                    accessibilityLabel="Clear API host override"
                  >
                    <Text style={styles.overrideBtnGhostText}>Clear override</Text>
                  </Pressable>
                </View>
              </>
            ) : !__DEV__ ? (
              <Text style={styles.secretTapHint}>
                Tip: tap the version line below {VERSION_TAP_UNLOCK} times to reveal the host override (super admins
                only).
              </Text>
            ) : null}
          </View>
        ) : null}

        {availableEstates.length > 1 ? (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="business-outline" size={20} color="#8b949e" />
              <Text style={styles.cardTitle}>Switch estate</Text>
            </View>
            <Text style={styles.switchHint}>Choose where you are working today.</Text>
            {availableEstates.map((e) => {
              const selected = normalizeEstateId(e.id) === activeIdNorm;
              return (
                <Pressable
                  key={e.id}
                  style={({ pressed }) => [
                    styles.estateOption,
                    selected && styles.estateOptionSelected,
                    pressed && styles.estateOptionPressed,
                  ]}
                  onPress={() => void selectEstate(e.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Select estate ${e.name}`}
                >
                  <View style={[styles.estateRadio, selected && styles.estateRadioOn]}>
                    {selected ? <View style={styles.estateRadioDot} /> : null}
                  </View>
                  <Text style={[styles.estateOptionText, selected && styles.estateOptionTextOn]} numberOfLines={2}>
                    {e.name}
                  </Text>
                  {selected ? <Ionicons name="checkmark-circle" size={22} color="#58a6ff" /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.signOutCard, pressed && styles.actionPressed]}
          onPress={() => void logout()}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Ionicons name="log-out-outline" size={22} color="#f85149" />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        <Pressable
          onPress={() => setVersionTapCount((c) => (c >= VERSION_TAP_UNLOCK ? c : c + 1))}
          accessibilityRole="button"
          accessibilityLabel="App version footer"
        >
          <Text style={styles.versionFoot}>Guard Gate · secure access tools</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(88, 166, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 26,
    fontWeight: '700',
    color: '#f0f6fc',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    marginTop: 0,
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#161b22',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8b949e',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  manualOfflineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  manualOfflineTextCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  manualOfflineTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f0f6fc',
    marginBottom: 4,
  },
  manualOfflineSub: {
    fontSize: 12,
    color: '#8b949e',
    lineHeight: 17,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#30363d',
    marginVertical: 12,
  },
  kvRow: {
    gap: 4,
  },
  kvLabel: {
    fontSize: 12,
    color: '#6e7681',
    fontWeight: '600',
  },
  kvValue: {
    fontSize: 16,
    color: '#f0f6fc',
    fontWeight: '600',
    lineHeight: 22,
  },
  metrics: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  metricTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  metricIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricLabel: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
    color: '#6e7681',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: '#c9d1d9',
    lineHeight: 18,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#d29922',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0d1117',
  },
  explainer: {
    fontSize: 13,
    color: '#6e7681',
    lineHeight: 19,
    marginBottom: 16,
  },
  actionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#1f6feb',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  actionSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(88, 166, 255, 0.1)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(88, 166, 255, 0.25)',
  },
  actionDisabled: {
    opacity: 0.4,
  },
  actionPressed: {
    opacity: 0.88,
  },
  actionTextCol: {
    flex: 1,
    minWidth: 0,
  },
  actionPrimaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  actionPrimarySub: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 16,
  },
  actionSecondaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#58a6ff',
  },
  actionSecondarySub: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(88, 166, 255, 0.65)',
    lineHeight: 16,
  },
  switchHint: {
    fontSize: 13,
    color: '#6e7681',
    marginBottom: 12,
    lineHeight: 18,
  },
  estateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  estateOptionSelected: {
    borderColor: 'rgba(88, 166, 255, 0.45)',
    backgroundColor: 'rgba(88, 166, 255, 0.08)',
  },
  estateOptionPressed: {
    opacity: 0.92,
  },
  estateRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#484f58',
    alignItems: 'center',
    justifyContent: 'center',
  },
  estateRadioOn: {
    borderColor: '#58a6ff',
  },
  estateRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#58a6ff',
  },
  estateOptionText: {
    flex: 1,
    fontSize: 15,
    color: '#c9d1d9',
    fontWeight: '500',
  },
  estateOptionTextOn: {
    color: '#f0f6fc',
    fontWeight: '700',
  },
  signOutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(248, 81, 73, 0.35)',
    backgroundColor: 'rgba(248, 81, 73, 0.06)',
    marginTop: 4,
    marginBottom: 20,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f85149',
  },
  versionFoot: {
    textAlign: 'center',
    fontSize: 12,
    color: '#484f58',
  },
  apiDebugExplainer: {
    fontSize: 13,
    color: '#6e7681',
    lineHeight: 19,
    marginBottom: 10,
  },
  apiDebugValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#c9d1d9',
    lineHeight: 20,
    marginBottom: 14,
  },
  overrideLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b949e',
    marginBottom: 6,
  },
  overrideInput: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radii.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 15,
    color: color.text,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginBottom: 12,
  },
  overrideActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  overrideBtn: {
    backgroundColor: color.primaryBlue,
    paddingVertical: 12,
    paddingHorizontal: space.lg,
    borderRadius: radii.md,
  },
  overrideBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  overrideBtnGhost: {
    borderWidth: 1,
    borderColor: 'rgba(88, 166, 255, 0.35)',
    paddingVertical: 12,
    paddingHorizontal: space.lg,
    borderRadius: radii.md,
  },
  overrideBtnGhostText: {
    color: '#58a6ff',
    fontSize: 15,
    fontWeight: '600',
  },
  secretTapHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#484f58',
    lineHeight: 17,
    fontStyle: 'italic',
  },
});
