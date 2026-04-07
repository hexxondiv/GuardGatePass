import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function SettingsScreen() {
  const { logout } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.body}>Estate selection and preferences will appear in later workstreams.</Text>
      <TouchableOpacity style={styles.outline} onPress={() => void logout()} accessibilityRole="button">
        <Text style={styles.outlineText}>Sign out (clear stub token)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#0d1117' },
  title: { fontSize: 20, fontWeight: '600', color: '#f0f6fc', marginBottom: 12 },
  body: { fontSize: 15, color: '#c9d1d9', lineHeight: 22, marginBottom: 24 },
  outline: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  outlineText: { color: '#f0f6fc', fontSize: 15 },
});
