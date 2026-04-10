import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useConnectivityMode } from '../context/ConnectivityModeContext';
import { color, radii, space } from '../theme/tokens';

/**
 * Live / offline pill for the Verify tab header (right side). Subscribes to
 * connectivity context so it updates without the screen body driving header options.
 */
export default function VerifyConnectivityHeaderRight() {
  const { operationalOnline: isOnline, physicalOnline } = useConnectivityMode();
  const liveDotOpacity = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion || !isOnline) {
      liveDotOpacity.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(liveDotOpacity, {
          toValue: 0.28,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(liveDotOpacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [isOnline, liveDotOpacity, reduceMotion]);

  return (
    <View
      style={styles.wrap}
      accessibilityRole="text"
      accessibilityLabel={
        isOnline
          ? 'Live Mode, online'
          : !physicalOnline
            ? 'Offline Mode, no network'
            : 'Offline Mode, manual offline enabled'
      }
      accessibilityLiveRegion="polite"
    >
      {isOnline ? (
        <Animated.View style={[styles.liveDot, { opacity: liveDotOpacity }]} />
      ) : (
        <View style={styles.offlineDot} />
      )}
      <Text
        style={[styles.label, isOnline ? styles.labelLive : styles.labelOffline]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.35}
      >
        {isOnline ? 'Live' : 'Offline'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginRight: 4,
    paddingVertical: 6,
    paddingHorizontal: space.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: color.borderMuted,
    backgroundColor: color.overlayLow,
    maxWidth: 140,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.success,
    shadowColor: color.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 3,
    elevation: 3,
  },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.danger,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  labelLive: {
    color: color.success,
  },
  labelOffline: {
    color: color.danger,
  },
});
