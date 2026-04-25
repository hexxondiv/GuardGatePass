import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { color } from '../theme/tokens';

export default function DeviceLockedScreen() {
  const { checkDeviceAccessNow, isCheckingDeviceAccess, logout } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Device Locked</Text>
      <Text style={styles.message}>
        This device has been deactivated by admin. You can only use this screen until admin reactivates the device.
      </Text>
      <TouchableOpacity
        style={[styles.button, isCheckingDeviceAccess && styles.buttonDisabled]}
        onPress={() => {
          void checkDeviceAccessNow();
        }}
        disabled={isCheckingDeviceAccess}
      >
        {isCheckingDeviceAccess ? (
          <ActivityIndicator color={color.text} />
        ) : (
          <Text style={styles.buttonText}>Check status again</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.secondaryButton]}
        onPress={() => {
          void logout();
        }}
      >
        <Text style={styles.buttonText}>Sign out</Text>
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
    backgroundColor: color.bg,
  },
  title: {
    color: color.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  message: {
    color: color.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 420,
  },
  button: {
    minWidth: 220,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: color.accent,
    marginTop: 10,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#334155',
  },
  buttonText: {
    color: color.text,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
