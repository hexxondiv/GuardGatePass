import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  countPendingEvents,
  flushGuardSyncEventQueue,
  readLastGuardSyncMeta,
  runGuardSyncBootstrap,
} from '../services/guardSyncCoordinator';
import { getApiErrorMessage } from '../utils/apiErrors';

function formatSyncTime(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function SettingsScreen() {
  const { logout, activeEstateId, availableEstates, selectEstate, roles } = useAuth();
  const [lastSyncIso, setLastSyncIso] = useState<string | null>(null);
  const [passCount, setPassCount] = useState<number | null>(null);
  const [pendingEvents, setPendingEvents] = useState(0);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);

  const refreshLocalMeta = useCallback(async () => {
    const meta = await readLastGuardSyncMeta();
    setLastSyncIso(meta.lastSyncIso);
    setPassCount(meta.passCount);
    setPendingEvents(await countPendingEvents());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshLocalMeta();
    }, [refreshLocalMeta]),
  );

  const activeName =
    availableEstates.find((e) => e.id === activeEstateId)?.name ?? activeEstateId ?? '—';

  const onRefreshBootstrap = useCallback(async () => {
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
  }, [activeEstateId, refreshLocalMeta]);

  const onUploadQueue = useCallback(async () => {
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
  }, [activeEstateId, refreshLocalMeta]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.sectionLabel}>Signed in as</Text>
      <Text style={styles.body}>{roles.filter(Boolean).join(', ') || '—'}</Text>

      <Text style={styles.sectionLabel}>Active estate</Text>
      <Text style={styles.body}>{activeName}</Text>
      <Text style={styles.hint}>
        Requests use header X-Estate-Id for the active estate (same as admin web). Single-estate accounts default to
        the estate from your session.
      </Text>

      <Text style={styles.sectionLabel}>Offline pass cache</Text>
      <Text style={styles.body}>Last synced at: {formatSyncTime(lastSyncIso)}</Text>
      {passCount != null ? <Text style={styles.bodyMuted}>Passes in cache: {passCount}</Text> : null}
      <Text style={styles.bodyMuted}>Pending offline events: {pendingEvents}</Text>
      <Text style={styles.hint}>
        After login, the app registers this device and downloads active passes (`GET /guard-sync/bootstrap`). SQLite
        stores the snapshot; very large estates (tens of thousands of rows) may warrant raising bootstrap limits on
        the server.
      </Text>

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.secondary, bootstrapBusy && styles.btnDisabled]}
          disabled={bootstrapBusy}
          onPress={() => void onRefreshBootstrap()}
          accessibilityRole="button"
          accessibilityLabel="Refresh pass cache from server"
        >
          {bootstrapBusy ? (
            <ActivityIndicator color="#58a6ff" />
          ) : (
            <Text style={styles.secondaryText}>Refresh pass cache</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondary, (uploadBusy || pendingEvents === 0) && styles.btnDisabled]}
          disabled={uploadBusy || pendingEvents === 0}
          onPress={() => void onUploadQueue()}
          accessibilityRole="button"
          accessibilityLabel="Upload pending offline events"
        >
          {uploadBusy ? (
            <ActivityIndicator color="#58a6ff" />
          ) : (
            <Text style={styles.secondaryText}>Upload offline queue</Text>
          )}
        </TouchableOpacity>
      </View>

      {availableEstates.length > 1 ? (
        <View style={styles.estateList}>
          <Text style={styles.sectionLabel}>Switch estate</Text>
          {availableEstates.map((e) => {
            const selected = e.id === activeEstateId;
            return (
              <TouchableOpacity
                key={e.id}
                style={[styles.estateChip, selected && styles.estateChipSelected]}
                onPress={() => void selectEstate(e.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Select estate ${e.name}`}
              >
                <Text style={[styles.estateChipText, selected && styles.estateChipTextSelected]}>{e.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <TouchableOpacity style={styles.outline} onPress={() => void logout()} accessibilityRole="button">
        <Text style={styles.outlineText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40, backgroundColor: '#0d1117' },
  title: { fontSize: 20, fontWeight: '600', color: '#f0f6fc', marginBottom: 16 },
  sectionLabel: { fontSize: 13, color: '#8b949e', marginTop: 12, marginBottom: 6 },
  body: { fontSize: 15, color: '#c9d1d9', lineHeight: 22 },
  bodyMuted: { fontSize: 14, color: '#6e7681', marginTop: 4, lineHeight: 20 },
  hint: { fontSize: 13, color: '#6e7681', marginTop: 8, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  secondary: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryText: { color: '#58a6ff', fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.45 },
  estateList: { marginTop: 8, marginBottom: 24 },
  estateChip: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  estateChipSelected: { borderColor: '#58a6ff', backgroundColor: '#1c2128' },
  estateChipText: { color: '#c9d1d9', fontSize: 15 },
  estateChipTextSelected: { color: '#f0f6fc', fontWeight: '600' },
  outline: {
    alignSelf: 'flex-start',
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  outlineText: { color: '#f0f6fc', fontSize: 15 },
});
