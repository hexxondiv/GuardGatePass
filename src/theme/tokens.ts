/**
 * Guard app design tokens — kiosk-friendly dark theme, high contrast for outdoor use.
 * Use across Verify, Instant Guest, Settings, and auth screens.
 */
export const color = {
  bg: '#0d1117',
  surface: '#161b22',
  surfaceElevated: '#21262d',
  border: '#30363d',
  borderSubtle: 'rgba(255,255,255,0.14)',
  borderMuted: 'rgba(255,255,255,0.1)',
  borderStrong: '#484f58',
  text: '#f0f6fc',
  textSecondary: '#c9d1d9',
  textMuted: '#8b949e',
  textFaint: '#6e7681',
  textPlaceholder: '#6e7681',
  accent: '#58a6ff',
  accentMuted: 'rgba(88, 166, 255, 0.65)',
  accentSoft: 'rgba(88, 166, 255, 0.12)',
  accentGlow: 'rgba(88, 166, 255, 0.22)',
  accentBorder: 'rgba(88, 166, 255, 0.45)',
  success: '#3fb950',
  successGlow: 'rgba(63, 185, 80, 0.35)',
  danger: '#f85149',
  dangerSoft: 'rgba(248, 81, 73, 0.06)',
  dangerBorder: 'rgba(248, 81, 73, 0.35)',
  warning: '#d29922',
  warnBg: 'rgba(210, 153, 34, 0.1)',
  warnBgStrong: 'rgba(210, 153, 34, 0.15)',
  warnBorder: 'rgba(210, 153, 34, 0.4)',
  warnTrack: 'rgba(210, 153, 34, 0.45)',
  primaryBtn: '#238636',
  primaryBtnMuted: 'rgba(35, 134, 54, 0.35)',
  primaryBlue: '#1f6feb',
  overlayLight: 'rgba(255,255,255,0.03)',
  overlayLow: 'rgba(255,255,255,0.04)',
  overlayMed: 'rgba(255,255,255,0.06)',
  overlayHigh: 'rgba(255,255,255,0.12)',
  overlayText: 'rgba(255,255,255,0.45)',
  overlayTextHi: 'rgba(255,255,255,0.55)',
  overlayTextMax: 'rgba(255,255,255,0.82)',
  blackOverlay: 'rgba(0,0,0,0.2)',
  blackOverlayDeep: 'rgba(0,0,0,0.25)',
  panelGradientStart: '#0e1016',
  panelGradientMid: '#151821',
  panelGradientEnd: '#0a0b10',
  panelGlow: 'rgba(120, 20, 20, 0.35)',
  heroGradientStart: '#1a2332',
  heroGradientEnd: '#0d1117',
  digitBg: 'rgba(0,0,0,0.25)',
  shadow: '#000',
  purpleAccent: '#a371f7',
  /** Distinct brand accent vs resident app (warm amber ring in app icon); use sparingly in UI. */
  brandAmber: '#f0b429',
} as const;

export const radii = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 20,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

/** Prefer larger values on Verify for sunlight readability. */
export const font = {
  titleHero: 26,
  titleScreen: 22,
  titleOutcome: 18,
  eyebrow: 11,
  body: 15,
  bodySm: 13,
  caption: 12,
  /** Large code display — pairs with `maxFontSizeMultiplier` on the consuming `Text`. */
  digitDisplay: 28,
  keypad: 24,
  connectivity: 14,
} as const;
