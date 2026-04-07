# Guard Gate Pass (Expo)

Native guard app for gate pass verification and related flows. This project mirrors the **ResidentGatePass** Expo layout, env contract, and API base URL resolution (`src/config/app_constants.tsx`).

## Prerequisites

- Node.js 18+ (same toolchain as ResidentGatePass / Expo SDK 52)
- Android Studio + emulator for Android builds (`expo run:android`)

## Environment

Copy `.env.example` to `.env` or `.env.local` and adjust hosts.

- **`EXPO_PUBLIC_DEV_API_BASE_URL`** — Metro-inlined API **host only** (no `/api/v1`). Use the **identical** value as **ResidentGatePass** when both apps should hit the same local `uvicorn` (e.g. port `8001`) or **shared ngrok tunnel** so behavior matches admin web + resident app. It must match **`DEV_API_BASE_URL`** for consistency.
- **`DEV_API_BASE_URL`** — same host string; used by `app.config.js` when `DEV_MODE=true`.
- **API base is host-only** — app code resolves `API_BASE_URL` with `/api/v1` appended for non-legacy hosts; production `gatepass.hexxondiv.com` keeps legacy root paths (see `app_constants.tsx`).

## Scripts

| Command | Description |
|--------|-------------|
| `npm start` | Expo dev server |
| `npm run android` | Native Android build/run (dev client) |
| `npm run ios` | Native iOS build/run (macOS) |
| `npm run typecheck` | `tsc --noEmit` |

## EAS

`eas.json` follows the ResidentGatePass profile pattern (`development` / `preview` / `production`). Run `eas init` and link a project when you are ready for cloud builds. `expo-dev-client` is included for native modules (e.g. camera) in later workstreams.

## API client, headers, and tenancy (Workstream 3)

- Central HTTP client: `src/utils/apiClient.ts` (Bearer token, optional `ngrok-skip-browser-warning`, `X-Estate-Id`).
- Service modules: `src/services/userService.ts`, `estateService.ts`, `gatepassService.ts`, `guardSyncService.ts`.
- Error text helper: `src/utils/apiErrors.ts` (`getApiErrorMessage`).

### Dev checklist — `X-Estate-Id`

Many estate-scoped routes resolve the active estate from the **`X-Estate-Id`** header and/or JWT + DB (`app/tenancy.py` on the API). **Staff users** (`access_level_id >= 3`): if the header is omitted, the server may fall back to the user’s primary / JWT estate when assignments exist; if there is **no** resolvable estate, expect **400** with a message like *Active estate is required…*.

If mutating or scoped GET calls fail with that error while debugging:

1. Confirm `AuthProvider` has run and `active_estate_id` is set in SecureStore (estate picker / post-login hydration).
2. For a **per-call** estate override, pass `headers: { 'X-Estate-Id': '<estateId>' }` on that request (wins over SecureStore in the interceptor).
3. Confirm you are not calling the API **before** `selectEstate` / initial estate hydration completes.
