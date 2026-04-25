import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { jwtDecode } from 'jwt-decode';
import { setSessionUnauthorizedHandler } from '../auth/sessionEvents';
import {
  ACTIVE_ESTATE_STORAGE_KEY,
  BARRIER_WEBHOOK_URL_KEY,
  GUARD_FORCE_OFFLINE_MODE_KEY,
  SECURE_ACCESS_TOKEN_KEY,
} from '../config/app_constants';
import { loginStaff } from '../services/authService';
import { refreshApiClientBaseUrl } from '../utils/apiClient';
import { fetchAllEstatesSummaries, fetchBarrierWebhookUrl } from '../services/estateService';
import { runGuardSyncBootstrap } from '../services/guardSyncCoordinator';
import { clearAllGuardSyncLocalData } from '../storage/guardSyncLocalDb';
import type { StaffJwtPayload } from '../types/auth';
import {
  type AppRole,
  type EstateSummary,
  extractEstatesFromClaims,
  extractRolesFromClaims,
  isStaffAppRole,
} from '../utils/accessControl';

interface AuthContextType {
  userToken: string | null;
  authUser: StaffJwtPayload | null;
  roles: AppRole[];
  isStaffAppUser: boolean;
  activeEstateId: string | null;
  availableEstates: EstateSummary[];
  barrierWebhookUrl: string | null;
  isLoading: boolean;
  isSigningIn: boolean;
  signIn: (phone: string, accessCode: string) => Promise<void>;
  logout: () => Promise<void>;
  selectEstate: (estateId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  userToken: null,
  authUser: null,
  roles: [],
  isStaffAppUser: false,
  activeEstateId: null,
  availableEstates: [],
  barrierWebhookUrl: null,
  isLoading: true,
  isSigningIn: false,
  signIn: async () => {},
  logout: async () => {},
  selectEstate: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<StaffJwtPayload | null>(null);
  const [activeEstateId, setActiveEstateId] = useState<string | null>(null);
  const [availableEstates, setAvailableEstates] = useState<EstateSummary[]>([]);
  const [barrierWebhookUrl, setBarrierWebhookUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const applyEstateContext = useCallback(async (decoded: StaffJwtPayload, roles: AppRole[]) => {
    let estates: EstateSummary[] = [];
    if (roles.includes('super_admin')) {
      try {
        estates = await fetchAllEstatesSummaries();
      } catch {
        estates = extractEstatesFromClaims(decoded);
      }
    } else {
      estates = extractEstatesFromClaims(decoded);
    }

    setAvailableEstates(estates);

    const stored = await SecureStore.getItemAsync(ACTIVE_ESTATE_STORAGE_KEY);
    const fallback = estates[0]?.id ?? null;
    const nextId = stored && estates.some((e) => e.id === stored) ? stored : fallback;

    if (nextId) {
      await SecureStore.setItemAsync(ACTIVE_ESTATE_STORAGE_KEY, nextId);
    } else {
      await SecureStore.deleteItemAsync(ACTIVE_ESTATE_STORAGE_KEY);
    }
    setActiveEstateId(nextId);
  }, []);

  const clearSession = useCallback(async () => {
    await SecureStore.deleteItemAsync(SECURE_ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(ACTIVE_ESTATE_STORAGE_KEY);
    await SecureStore.deleteItemAsync(BARRIER_WEBHOOK_URL_KEY);
    try {
      await clearAllGuardSyncLocalData();
    } catch {
      /* SQLite may be unavailable on some targets */
    }
    setUserToken(null);
    setAuthUser(null);
    setActiveEstateId(null);
    setAvailableEstates([]);
    setBarrierWebhookUrl(null);
  }, []);

  useEffect(() => {
    setSessionUnauthorizedHandler(() => {
      setUserToken(null);
      setAuthUser(null);
      setActiveEstateId(null);
      setAvailableEstates([]);
      setBarrierWebhookUrl(null);
      void SecureStore.deleteItemAsync(BARRIER_WEBHOOK_URL_KEY).catch(() => {});
      void clearAllGuardSyncLocalData().catch(() => {});
    });
    return () => setSessionUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      await refreshApiClientBaseUrl();
      try {
        const token = await SecureStore.getItemAsync(SECURE_ACCESS_TOKEN_KEY);
        if (!token) {
          return;
        }

        let decoded: StaffJwtPayload;
        try {
          decoded = jwtDecode<StaffJwtPayload>(token);
        } catch {
          await SecureStore.deleteItemAsync(SECURE_ACCESS_TOKEN_KEY);
          await SecureStore.deleteItemAsync(ACTIVE_ESTATE_STORAGE_KEY);
          return;
        }

        if (cancelled) {
          return;
        }

        setUserToken(token);
        setAuthUser(decoded);

        const roles = extractRolesFromClaims(decoded);
        if (!isStaffAppRole(roles)) {
          return;
        }

        await applyEstateContext(decoded, roles);
        if (cancelled) {
          return;
        }

        const storedWebhook = await SecureStore.getItemAsync(BARRIER_WEBHOOK_URL_KEY);
        if (!cancelled) {
          setBarrierWebhookUrl(storedWebhook ?? null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [applyEstateContext]);

  const signIn = useCallback(
    async (phone: string, accessCode: string) => {
      setIsSigningIn(true);
      try {
        const loginResponse = await loginStaff(phone, accessCode);
        const { access_token } = loginResponse;

        let decoded: StaffJwtPayload;
        try {
          decoded = jwtDecode<StaffJwtPayload>(access_token);
        } catch {
          throw new Error('Invalid token from server');
        }

        const roles = extractRolesFromClaims(decoded);
        if (!isStaffAppRole(roles)) {
          throw new Error('You do not have access to this app.');
        }

        await SecureStore.setItemAsync(SECURE_ACCESS_TOKEN_KEY, access_token);
        setUserToken(access_token);
        setAuthUser(decoded);
        await applyEstateContext(decoded, roles);

        const webhookUrl = loginResponse.barrier_webhook_url ?? null;
        if (webhookUrl) {
          await SecureStore.setItemAsync(BARRIER_WEBHOOK_URL_KEY, webhookUrl);
        } else {
          await SecureStore.deleteItemAsync(BARRIER_WEBHOOK_URL_KEY);
        }
        setBarrierWebhookUrl(webhookUrl);
      } finally {
        setIsSigningIn(false);
      }
    },
    [applyEstateContext],
  );

  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const selectEstate = useCallback(async (estateId: string) => {
    if (!availableEstates.some((e) => e.id === estateId)) {
      return;
    }
    await SecureStore.setItemAsync(ACTIVE_ESTATE_STORAGE_KEY, estateId);
    setActiveEstateId(estateId);

    const webhookUrl = await fetchBarrierWebhookUrl(estateId);
    if (webhookUrl) {
      await SecureStore.setItemAsync(BARRIER_WEBHOOK_URL_KEY, webhookUrl);
    } else {
      await SecureStore.deleteItemAsync(BARRIER_WEBHOOK_URL_KEY);
    }
    setBarrierWebhookUrl(webhookUrl);
  }, [availableEstates]);

  const roles = useMemo(
    () => (authUser ? extractRolesFromClaims(authUser) : []),
    [authUser],
  );

  const isStaffAppUser = useMemo(() => isStaffAppRole(roles), [roles]);

  useEffect(() => {
    if (!userToken || !activeEstateId || !isStaffAppUser) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const forced = await SecureStore.getItemAsync(GUARD_FORCE_OFFLINE_MODE_KEY);
        if (forced === '1' || forced === 'true') {
          return;
        }
      } catch {
        /* continue with bootstrap */
      }
      const out = await runGuardSyncBootstrap(activeEstateId);
      if (!cancelled && !out.ok && __DEV__) {
        console.warn('[guard sync bootstrap]', out.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userToken, activeEstateId, isStaffAppUser]);

  const value = useMemo(
    () => ({
      userToken,
      authUser,
      roles,
      isStaffAppUser,
      activeEstateId,
      availableEstates,
      barrierWebhookUrl,
      isLoading,
      isSigningIn,
      signIn,
      logout,
      selectEstate,
    }),
    [
      userToken,
      authUser,
      roles,
      isStaffAppUser,
      activeEstateId,
      availableEstates,
      barrierWebhookUrl,
      isLoading,
      isSigningIn,
      signIn,
      logout,
      selectEstate,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
