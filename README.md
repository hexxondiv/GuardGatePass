# Guard Gate Pass (Expo)

Native guard app for gate pass verification and related flows. This project mirrors the **ResidentGatePass** Expo layout, env contract, and API base URL resolution (`src/config/app_constants.tsx`).

## Prerequisites

- Node.js 18+ (same toolchain as ResidentGatePass / Expo SDK 52)
- Android Studio + emulator for Android builds (`expo run:android`)

## Environment

Copy `.env.example` to `.env` or `.env.local` and adjust hosts.

- **`EXPO_PUBLIC_DEV_API_BASE_URL`** — Metro-inlined API **host only** (no `/api/v1`). Use the **same** base URL as **ResidentGatePass** when both apps should hit the same local API or **shared ngrok tunnel** (e.g. `https://abc123.ngrok-free.app`). It must match **`DEV_API_BASE_URL`** for consistency.
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

## Stub behavior (Workstream 1)

Login is a **stub**: tap **Continue (stub)** to enter the main guard tabs. Real authentication is Workstream 2.
