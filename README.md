# Guard Gate Pass (Expo)

Native guard app for gate pass verification and related flows. This project mirrors the **ResidentGatePass** Expo layout, env contract, and API base URL resolution (`src/config/app_constants.tsx`).

## Prerequisites

- Node.js **20.19.4+** (see `package.json` `engines`; aligned with ResidentGatePass / Expo SDK 54)
- Android Studio + emulator for Android builds (`npm run android` / `expo run:android`)

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

## EAS Build (Android)

`eas.json` mirrors **ResidentGatePass**: `development` (dev client, internal), `preview` (internal APK/AAB), `production` (store, `autoIncrement`).

1. `npx eas-cli login` and `eas init` once to attach an EAS project id (`app.json` / Expo dashboard).
2. **Preview / QA artifact (installable on device):**
   ```bash
   eas build -p android --profile preview
   ```
3. Download the build from the Expo dashboard (or CLI output). **Dev client** vs **production JS** matches the profile you pick (`development` uses the dev client; `preview` / `production` use the release bundle class for that profile).

`expo-dev-client` is included for native modules (camera, SQLite, SecureStore, haptics).

### USB install (estate IT)

With USB debugging enabled on the handset:

```bash
adb install -r path/to/your-artifact.apk
```

Use the APK from an **internal** EAS build, or `adb install` after a local `expo run:android --variant release` when applicable.

### Google Play internal track handoff

1. Build an **AAB** with EAS (`preview` can produce internal artifacts; use `production` profile when ready for Play signing policy).
2. Upload to Play Console → **Testing** → **Internal testing** (or **Closed testing**), add tester emails, share the opt-in link.
3. Document the **versionName/versionCode** (EAS `appVersionSource: remote`) in your estate rollout notes.

**Security:** there are **no API keys** in this repository — only documented env vars in `.env.example`. JWTs and access codes never belong in env files.

## UI, accessibility, and branding (Workstream 8)

- **Design tokens:** `src/theme/tokens.ts` — shared colors, radii, spacing for Verify, Instant Guest, Settings, and login.
- **Motion:** verify flip and live-dot pulse respect **Reduce motion** (`AccessibilityInfo`).
- **Haptics + audio:** `verifyOutcomeFeedback` fires haptics immediately; sound is scheduled with `InteractionManager.runAfterInteractions` (`expo-audio` seek + play) so it does not block verify UI, flip animation, or reset timers. Sounds are preloaded when the Verify screen mounts (`preloadVerifyOutcomeSounds`). Cues: `src/assets/sounds/Granted_New.wav` (success) and `Denied.mp3` (failure).
- **Screen reader:** keypad, scan zone, and outcome views expose labels/hints; scan modal labels the viewfinder.
- **Icons / splash:** distinct from the resident app — sourced from the canonical Guard app icon set. Sync after changing art:
  ```bash
  python3 scripts/sync_guard_icons.py /home/james/Desktop/GPS/assets/GuardGatePass/AppIcons
  ```
- **Superuser API debug:** Settings shows the **resolved API base** only for `super_admin` (no secrets). **Staging host override** is in SecureStore: visible in **`__DEV__`**, or in release after **seven taps** on the version footer (super admins only).

### Manual QA checklist (Lighthouse-style)

- **Display size / font scale ~200%** (system settings): open **Verify**, confirm six digit cells and outcome text remain readable (scroll if needed); keypad still operable.
- **TalkBack / VoiceOver:** move through keypad, **Scan gate pass QR code**, and outcome alert after a test verify.
- **Reduce motion:** enable system setting; confirm verify transition does not animate the flip; modals use `animationType="none"`.
- **Cold start:** measure once with a stopwatch from tap icon to interactive **Verify** (document result in your rollout notes; target is project-specific).

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
