import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import InstantGuestScreen from '../screens/InstantGuestScreen';
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
        tabBarActiveTintColor: color.brandAmber,
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
        name="InstantGuest"
        component={InstantGuestScreen}
        options={{
          title: 'Walk-in',
          tabBarLabel: 'Walk-in',
          tabBarIcon: ({ color: tint }) => (
            <Ionicons name="person-add-outline" size={24} color={tint} accessibilityElementsHidden />
          ),
          tabBarAccessibilityLabel: 'Instant guest walk-in',
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
