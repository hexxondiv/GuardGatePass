import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { GUARD_FORCE_OFFLINE_MODE_KEY } from '../config/app_constants';

type ConnectivityModeContextValue = {
  /** Raw reachability from the OS. */
  physicalOnline: boolean;
  /** User chose to behave as offline while online (training, saving data, etc.). */
  forceOfflineMode: boolean;
  /** Use for verify UI and offline queue: false when forced offline or when there is no network. */
  operationalOnline: boolean;
  /** Turn manual offline on anytime. Turning off requires `physicalOnline` (shows an alert if not). */
  setForceOfflineMode: (next: boolean) => Promise<void>;
};

const ConnectivityModeContext = createContext<ConnectivityModeContextValue | null>(null);

function parseForceOfflineStored(raw: string | null): boolean {
  return raw === '1' || raw === 'true';
}

export function ConnectivityModeProvider({ children }: { children: React.ReactNode }) {
  const [physicalOnline, setPhysicalOnline] = useState(true);
  const [forceOfflineMode, setForceOfflineModeState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void SecureStore.getItemAsync(GUARD_FORCE_OFFLINE_MODE_KEY).then((raw) => {
      if (!cancelled) {
        setForceOfflineModeState(parseForceOfflineStored(raw));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function apply(state: NetInfoState) {
      setPhysicalOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    }
    const sub = NetInfo.addEventListener(apply);
    void NetInfo.fetch().then(apply);
    return () => {
      sub();
    };
  }, []);

  const setForceOfflineMode = useCallback(async (next: boolean) => {
    if (next) {
      await SecureStore.setItemAsync(GUARD_FORCE_OFFLINE_MODE_KEY, '1');
      setForceOfflineModeState(true);
      return;
    }
    const state = await NetInfo.fetch();
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (!online) {
      Alert.alert(
        'No connection',
        'Connect to the internet before switching back to Live mode.',
        [{ text: 'OK' }],
        { cancelable: true },
      );
      return;
    }
    await SecureStore.deleteItemAsync(GUARD_FORCE_OFFLINE_MODE_KEY);
    setForceOfflineModeState(false);
  }, []);

  const value = useMemo(() => {
    const operationalOnline = !forceOfflineMode && physicalOnline;
    return {
      physicalOnline,
      forceOfflineMode,
      operationalOnline,
      setForceOfflineMode,
    };
  }, [physicalOnline, forceOfflineMode, setForceOfflineMode]);

  return (
    <ConnectivityModeContext.Provider value={value}>{children}</ConnectivityModeContext.Provider>
  );
}

export function useConnectivityMode(): ConnectivityModeContextValue {
  const ctx = useContext(ConnectivityModeContext);
  if (!ctx) {
    throw new Error('useConnectivityMode must be used within ConnectivityModeProvider');
  }
  return ctx;
}

/** Same as `operationalOnline` — use wherever the app previously treated NetInfo as “online”. */
export function useOperationalOnline(): boolean {
  return useConnectivityMode().operationalOnline;
}
