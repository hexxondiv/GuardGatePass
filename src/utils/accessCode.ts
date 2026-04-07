/** Parity with web `gatepass-frontend/src/pages/verification/index.tsx`. */

export const DEBOUNCE_MS = 450;
export const CODE_DIGITS = 6;
/** Time to show verify result before returning to entry (web `RESULT_RESET_MS`). */
export const RESULT_RESET_MS = 3000;

export function isCompleteAccessCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

/**
 * If pasted/scan string is JSON with `access_code`, extract digits (web lines 33–47).
 * Otherwise strip non-digits and cap at `CODE_DIGITS`.
 */
export function rawScanToAccessCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && parsed.access_code != null) {
      return String(parsed.access_code).replace(/\D/g, '').slice(0, CODE_DIGITS);
    }
  } catch {
    // not JSON
  }
  return trimmed.replace(/\D/g, '').slice(0, CODE_DIGITS);
}
