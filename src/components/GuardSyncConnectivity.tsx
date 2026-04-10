import NetInfo from '@react-native-community/netinfo';
import React, { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useConnectivityMode } from '../context/ConnectivityModeContext';
import { flushGuardSyncEventQueue } from '../services/guardSyncCoordinator';

/**
 * On reconnect, uploads the persistent offline queue (`POST /guard-sync/events`).
 * Surfaces non-fatal conflict copy when the server returns `effective_status: conflict`.
 */
export default function GuardSyncConnectivity() {
  const { userToken, activeEstateId, isStaffAppUser } = useAuth();
  const { operationalOnline } = useConnectivityMode();
  const flushingRef = useRef(false);

  useEffect(() => {
    if (!userToken || activeEstateId == null || !isStaffAppUser) {
      return;
    }
    const estateId: string = activeEstateId;

    async function flushIfNeeded() {
      if (!operationalOnline) return;
      if (flushingRef.current) return;
      flushingRef.current = true;
      try {
        const out = await flushGuardSyncEventQueue(estateId);
        if (out.conflicts.length > 0) {
          const body =
            out.conflicts.length === 1
              ? out.conflicts[0]
              : `${out.conflicts.length} offline events need review:\n\n${out.conflicts.slice(0, 5).join('\n\n')}${
                  out.conflicts.length > 5 ? '\n…' : ''
                }`;
          Alert.alert('Sync notice', body, [{ text: 'OK' }], { cancelable: true });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (__DEV__) {
          console.warn('[guard sync upload]', msg);
        }
      } finally {
        flushingRef.current = false;
      }
    }

    const unsub = NetInfo.addEventListener((state) => {
      if (
        operationalOnline &&
        state.isConnected &&
        state.isInternetReachable !== false
      ) {
        void flushIfNeeded();
      }
    });

    void NetInfo.fetch().then((state) => {
      if (
        operationalOnline &&
        state.isConnected &&
        state.isInternetReachable !== false
      ) {
        void flushIfNeeded();
      }
    });

    if (operationalOnline) {
      void flushIfNeeded();
    }

    return () => {
      unsub();
    };
  }, [userToken, activeEstateId, isStaffAppUser, operationalOnline]);

  return null;
}
