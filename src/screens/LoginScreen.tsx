import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';

/**
 * Stub login — real staff login in Workstream 2.
 */
export default function LoginScreen() {
  const { login } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Guard Gate Pass</Text>
      <Text style={styles.subtitle}>Sign-in is not wired yet (Workstream 2).</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => void login('stub-guard-token')}
        accessibilityRole="button"
        accessibilityLabel="Continue with stub session"
      >
        <Text style={styles.buttonText}>Continue (stub)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#0d1117',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#f0f6fc', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#8b949e', textAlign: 'center', marginBottom: 24 },
  button: {
    backgroundColor: '#238636',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
