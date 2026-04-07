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
  SECURE_ACCESS_TOKEN_KEY,
} from '../config/app_constants';
import { loginStaff } from '../services/authService';
import { fetchAllEstatesSummaries } from '../services/estateService';
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
    setUserToken(null);
    setAuthUser(null);
    setActiveEstateId(null);
    setAvailableEstates([]);
  }, []);

  useEffect(() => {
    setSessionUnauthorizedHandler(() => {
      setUserToken(null);
      setAuthUser(null);
      setActiveEstateId(null);
      setAvailableEstates([]);
    });
    return () => setSessionUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
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
        const { access_token } = await loginStaff(phone, accessCode);

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
  }, [availableEstates]);

  const roles = useMemo(
    () => (authUser ? extractRolesFromClaims(authUser) : []),
    [authUser],
  );

  const isStaffAppUser = useMemo(() => isStaffAppRole(roles), [roles]);

  const value = useMemo(
    () => ({
      userToken,
      authUser,
      roles,
      isStaffAppUser,
      activeEstateId,
      availableEstates,
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
