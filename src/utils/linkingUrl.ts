/**
 * Query extraction without expo-linking (avoids native `ExpoLinking` when the binary
 * was not rebuilt after adding that module). Works with custom schemes e.g. `app://path?code=…`.
 */
export function extractQueryParam(url: string, key: string): string | null {
  try {
    const u = new URL(url);
    const v = u.searchParams.get(key);
    if (v != null && v.trim()) {
      return v.trim();
    }
  } catch {
    // non-standard URLs
  }
  const re = new RegExp(`[?&]${key}=([^&]*)`);
  const m = url.match(re);
  if (!m?.[1]) {
    return null;
  }
  try {
    const decoded = decodeURIComponent(m[1]).trim();
    return decoded || null;
  } catch {
    return m[1].trim() || null;
  }
}
