import React, { createContext, useEffect, useState, useContext } from 'react';
import * as SecureStore from 'expo-secure-store';

interface AuthContextType {
  userToken: string | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  userToken: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkLoginStatus = async () => {
      const token = await SecureStore.getItemAsync('userToken');
      setUserToken(token);
      setIsLoading(false);
    };
    void checkLoginStatus();
  }, []);

  const login = async (token: string) => {
    await SecureStore.setItemAsync('userToken', token);
    setUserToken(token);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('userToken');
    setUserToken(null);
  };

  return (
    <AuthContext.Provider value={{ userToken, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
