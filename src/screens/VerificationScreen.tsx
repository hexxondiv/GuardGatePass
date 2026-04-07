import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { API_BASE_URL } from '../config/app_constants';

/**
 * Placeholder — keypad + verify flow in Workstream 4.
 */
export default function VerificationScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Welcome</Text>
      <Text style={styles.body}>
        This is the guard home tab. Verification UI will be added in a later workstream.
      </Text>
      <Text style={styles.mono} selectable>
        API base (resolved): {API_BASE_URL}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0d1117',
  },
  heading: { fontSize: 20, fontWeight: '600', color: '#f0f6fc', marginBottom: 12 },
  body: { fontSize: 15, color: '#c9d1d9', lineHeight: 22, marginBottom: 16 },
  mono: { fontSize: 12, color: '#8b949e', fontFamily: 'monospace' },
});
