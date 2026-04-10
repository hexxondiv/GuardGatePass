import { useWindowDimensions } from 'react-native';
import { font } from '../theme/tokens';

/** Reference shortest side (pt) — ~phone width in portrait. */
const REF_SHORTEST = 390;

/**
 * Icon and type scale for Verify screen, clamped so very small/large devices stay usable.
 */
export function useVerifyUiScale() {
  const { width, height } = useWindowDimensions();
  const shortest = Math.min(width, height);
  const scale = Math.min(1.38, Math.max(0.86, shortest / REF_SHORTEST));

  return {
    scale,
    qrIcon: Math.round(36 * scale),
    outcomeSuccessIcon: Math.round(54 * scale),
    outcomeFailureIcon: Math.round(50 * scale),
    modalCloseIcon: Math.round(28 * scale),
    keyFontSize: Math.round(22 * scale),
    digitFontSize: Math.round(font.digitDisplay * scale),
    qrLabelSize: Math.round(14 * scale),
    qrHintSize: Math.round(12 * scale),
    outcomeTitleSize: Math.round(17 * scale),
    outcomeBodySize: Math.round(13 * scale),
  };
}
