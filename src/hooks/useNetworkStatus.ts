import { useOperationalOnline } from '../context/ConnectivityModeContext';

/**
 * “Online” for gate UX: false when there is no network **or** when the user enabled manual offline mode.
 */
export function useNetworkStatus(): boolean {
  return useOperationalOnline();
}
