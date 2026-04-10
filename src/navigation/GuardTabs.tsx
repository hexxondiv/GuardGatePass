import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import VerificationScreen from '../screens/VerificationScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { color } from '../theme/tokens';
import type { GuardTabParamList } from './types';

const Tab = createBottomTabNavigator<GuardTabParamList>();

export default function GuardTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Verification"
      screenOptions={{
        headerTitleAlign: 'center',
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textMuted,
        tabBarStyle: { backgroundColor: color.surface },
        headerStyle: { backgroundColor: color.bg },
        headerTintColor: color.text,
      }}
    >
      <Tab.Screen
        name="Verification"
        component={VerificationScreen}
        options={{
          title: 'Verify',
          tabBarLabel: 'Verify',
          tabBarIcon: ({ color: tint }) => (
            <Ionicons name="shield-checkmark-outline" size={24} color={tint} accessibilityElementsHidden />
          ),
          tabBarAccessibilityLabel: 'Verify access code',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color: tint }) => (
            <Ionicons name="settings-outline" size={24} color={tint} accessibilityElementsHidden />
          ),
          tabBarAccessibilityLabel: 'Settings',
        }}
      />
    </Tab.Navigator>
  );
}
