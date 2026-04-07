import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import VerificationScreen from '../screens/VerificationScreen';
import SettingsScreen from '../screens/SettingsScreen';
import type { GuardTabParamList } from './types';

const Tab = createBottomTabNavigator<GuardTabParamList>();

export default function GuardTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Verification"
      screenOptions={{
        headerTitleAlign: 'center',
        tabBarActiveTintColor: '#58a6ff',
        tabBarInactiveTintColor: '#8b949e',
        tabBarStyle: { backgroundColor: '#161b22' },
        headerStyle: { backgroundColor: '#0d1117' },
        headerTintColor: '#f0f6fc',
      }}
    >
      <Tab.Screen
        name="Verification"
        component={VerificationScreen}
        options={{
          title: 'Verify',
          tabBarLabel: 'Verify',
          tabBarIcon: ({ color }) => <TabIcon label="✓" color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color }) => <TabIcon label="⚙" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

function TabIcon({ label, color }: { label: string; color: string }) {
  return <Text style={{ color, fontSize: 18 }}>{label}</Text>;
}
