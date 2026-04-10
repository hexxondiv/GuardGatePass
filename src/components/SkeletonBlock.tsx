import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { color, radii } from '../theme/tokens';

type Props = {
  height?: number;
  width?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
  /** When true, show a static block (no pulse). */
  reduceMotion?: boolean;
};

/**
 * Inline skeleton placeholder to reserve space during mutations and avoid layout jump.
 */
export default function SkeletonBlock({
  height = 14,
  width = '100%',
  style,
  reduceMotion,
}: Props) {
  const opacity = useRef(new Animated.Value(0.42)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.55);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.88,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.42,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      style={[
        {
          height,
          width,
          borderRadius: radii.sm,
          backgroundColor: color.borderStrong,
          opacity,
        },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
