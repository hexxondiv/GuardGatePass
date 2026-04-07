import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../context/AuthContext';

/**
 * Shown when a valid JWT exists but the user is not guard / estate_admin / super_admin.
 */
export default function AccessDeniedScreen() {
  const { logout } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Access denied</Text>
      <Text style={styles.body}>
        This app is only for security and estate staff (guard, estate admin, or super admin). Sign out and use the
        resident app if you have a resident account.
      </Text>
      <TouchableOpacity style={styles.button} onPress={() => void logout()} accessibilityRole="button">
        <Text style={styles.buttonText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0d1117',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#f0f6fc', marginBottom: 12 },
  body: { fontSize: 15, color: '#c9d1d9', lineHeight: 22, marginBottom: 24 },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#238636',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
