import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';

/**
 * Thin estate scope for UI — `activeEstateId` is mirrored to SecureStore by `AuthProvider`
 * (`ACTIVE_ESTATE_STORAGE_KEY`) so `apiClient` request interceptors attach `X-Estate-Id`.
 */
export type EstateContextValue = {
  activeEstateId: string | null;
};

const EstateContext = createContext<EstateContextValue | null>(null);

export function EstateProvider({ children }: { children: React.ReactNode }) {
  const { activeEstateId } = useAuth();
  const value = useMemo(() => ({ activeEstateId }), [activeEstateId]);
  return <EstateContext.Provider value={value}>{children}</EstateContext.Provider>;
}

export function useEstateContext(): EstateContextValue {
  const ctx = useContext(EstateContext);
  if (!ctx) {
    throw new Error('useEstateContext must be used within EstateProvider');
  }
  return ctx;
}
