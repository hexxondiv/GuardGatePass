/**
 * Trim and strip common formatting so the value matches what users type in admin web.
 * Backend still runs `normalize_phone` (E.164 for NG).
 */
export function sanitizePhoneForApi(phone: string): string {
  return phone
    .trim()
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    .replace(/[()-]/g, '');
}
