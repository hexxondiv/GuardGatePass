/**
 * Lets `apiClient` notify `AuthProvider` when the token is cleared after 401,
 * so React state matches SecureStore without an app restart.
 */

let onUnauthorized: (() => void) | null = null;

export function setSessionUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export function notifySessionUnauthorized(): void {
  onUnauthorized?.();
}
