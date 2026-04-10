import 'react-native-gesture-handler';
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import GuardSyncConnectivity from './src/components/GuardSyncConnectivity';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { EstateProvider } from './src/context/EstateContext';
import GuardTabs from './src/navigation/GuardTabs';
import AccessDeniedScreen from './src/screens/AccessDeniedScreen';
import LoginScreen from './src/screens/LoginScreen';
import { navigationRef } from './src/navigation/RootNavigation';
import type { RootStackParamList } from './src/navigation/types';

const queryClient = new QueryClient();
const Stack = createStackNavigator<RootStackParamList>();

const linking = {
  prefixes: ['com.hexxondiv.guardgatepass://', 'guardgatepass://'],
  config: {
    screens: {
      Login: 'login',
      GuardTabs: {
        path: '',
        screens: {
          Verification: {
            path: 'verification',
            parse: {
              code: (value: string) => value,
            },
          },
          Settings: 'settings',
        },
      },
    },
  },
};

function RootNavigator() {
  const { userToken, isLoading, isStaffAppUser } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0d1117' }}>
        <ActivityIndicator size="large" color="#58a6ff" />
      </View>
    );
  }

  if (userToken === null) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  if (!isStaffAppUser) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AccessDenied" component={AccessDeniedScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GuardTabs" component={GuardTabs} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <EstateProvider>
          <GuardSyncConnectivity />
          <SafeAreaProvider>
            <NavigationContainer ref={navigationRef} linking={linking}>
              <RootNavigator />
            </NavigationContainer>
          </SafeAreaProvider>
        </EstateProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
