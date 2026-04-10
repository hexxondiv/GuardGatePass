import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * Tracks reachability for offline verify / instant-guest gating (Workstream 7).
 */
export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;

    function apply(state: NetInfoState) {
      if (cancelled) return;
      setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    }

    const sub = NetInfo.addEventListener(apply);
    void NetInfo.fetch().then(apply);

    return () => {
      cancelled = true;
      sub();
    };
  }, []);

  return online;
}
