import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import InstantGuestScreen from '../screens/InstantGuestScreen';
import VerificationScreen from '../screens/VerificationScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { color } from '../theme/tokens';
import type { GuardTabParamList } from './types';

const Tab = createBottomTabNavigator<GuardTabParamList>();

function HeaderLogo() {
  return (
    <Image
      source={require('../assets/guard_icon.png')}
      style={styles.headerLogo}
      resizeMode="cover"
      accessibilityElementsHidden
    />
  );
}

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
          headerLeft: HeaderLogo,
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
          headerLeft: HeaderLogo,
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

const styles = StyleSheet.create({
  headerLogo: {
    width: 32,
    height: 32,
    borderRadius: 9,
    marginLeft: 16,
  },
});
