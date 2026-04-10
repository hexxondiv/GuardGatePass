import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { InteractionManager, Platform } from 'react-native';

let audioModePromise: Promise<void> | null = null;
type GuardAudioPlayer = ReturnType<typeof createAudioPlayer>;

const SUCCESS_SOURCE = require('../assets/sounds/Access_Granted.wav');
const DENIED_SOURCE = require('../assets/sounds/Denied.mp3');

let successPlayer: GuardAudioPlayer | null = null;
let deniedPlayer: GuardAudioPlayer | null = null;
let loadPlayersPromise: Promise<void> | null = null;

/** Serialize native seek/play so rapid verifies do not overlap on the same player. */
let playChain: Promise<void> = Promise.resolve();

const PLAYER_OPTIONS = {
  updateInterval: 500,
  keepAudioSessionActive: true,
  downloadFirst: true,
} as const;

const LOAD_TIMEOUT_MS = 12_000;

function disposePlayer(p: GuardAudioPlayer | null): void {
  if (!p) {
    return;
  }
  try {
    p.pause();
  } catch {
    /* ignore */
  }
  try {
    p.remove();
  } catch {
    /* ignore */
  }
}

/** Tear down players. Only pass `logReason` for real failures worth seeing in Metro. */
function resetPlayers(logReason?: string): void {
  if (__DEV__ && logReason) {
    console.warn('[verifyOutcomeFeedback] resetting audio players:', logReason);
  }
  disposePlayer(successPlayer);
  disposePlayer(deniedPlayer);
  successPlayer = null;
  deniedPlayer = null;
  loadPlayersPromise = null;
}

async function ensureAudioMode(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  if (!audioModePromise) {
    audioModePromise = setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'duckOthers',
    }).catch(() => {
      audioModePromise = null;
      throw new Error('setAudioModeAsync failed');
    });
  }
  await audioModePromise;
}

function waitForLoad(player: GuardAudioPlayer, timeoutMs: number): Promise<boolean> {
  if (player.isLoaded) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let finished = false;
    const done = (ok: boolean) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      try {
        sub.remove();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };

    const timer = setTimeout(() => done(player.isLoaded), timeoutMs);

    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.isLoaded) {
        done(true);
      }
    });
  });
}

async function createAndPrepare(
  source: number,
  volume: number,
  label: string,
): Promise<GuardAudioPlayer> {
  const player = createAudioPlayer(source, PLAYER_OPTIONS);
  player.volume = volume;
  const ok = await waitForLoad(player, LOAD_TIMEOUT_MS);
  if (!ok) {
    disposePlayer(player);
    throw new Error(`${label} failed to load`);
  }
  return player;
}

async function ensurePlayers(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  if (successPlayer && deniedPlayer) {
    return;
  }

  if (!loadPlayersPromise) {
    loadPlayersPromise = (async () => {
      await ensureAudioMode();
      if (!successPlayer) {
        successPlayer = await createAndPrepare(SUCCESS_SOURCE, 0.88, 'success');
      }
      if (!deniedPlayer) {
        deniedPlayer = await createAndPrepare(DENIED_SOURCE, 0.9, 'denied');
      }
    })().catch((e) => {
      resetPlayers(e instanceof Error ? e.message : 'load failed');
      throw e;
    });
  }

  try {
    await loadPlayersPromise;
  } catch {
    loadPlayersPromise = null;
  }
}

async function playFromStart(player: GuardAudioPlayer): Promise<void> {
  try {
    try {
      player.pause();
    } catch {
      /* ignore */
    }
    await player.seekTo(0);
    player.play();
  } catch {
    try {
      player.play();
    } catch {
      throw new Error('playFromStart failed');
    }
  }
}

async function playOutcomeSound(success: boolean): Promise<void> {
  await ensureAudioMode();
  await ensurePlayers();

  let player = success ? successPlayer : deniedPlayer;
  const source = success ? SUCCESS_SOURCE : DENIED_SOURCE;
  const vol = success ? 0.88 : 0.9;

  if (!player) {
    return;
  }

  try {
    await playFromStart(player);
  } catch {
    try {
      resetPlayers();
      await ensurePlayers();
      const p2 = success ? successPlayer : deniedPlayer;
      if (p2) {
        try {
          await playFromStart(p2);
        } catch {
          if (p2) {
            p2.replace(source);
            p2.volume = vol;
            const ok = await waitForLoad(p2, LOAD_TIMEOUT_MS);
            if (ok) {
              await playFromStart(p2);
            } else {
              resetPlayers();
            }
          }
        }
      }
    } catch {
      resetPlayers();
    }
  }
}

/**
 * Warm assets in the background so the first verify outcome does not pay load cost on the interaction path.
 */
export function preloadVerifyOutcomeSounds(): void {
  if (Platform.OS === 'web') {
    return;
  }
  InteractionManager.runAfterInteractions(() => {
    void ensurePlayers().catch(() => {});
  });
}

function scheduleSoundPlayback(success: boolean): void {
  InteractionManager.runAfterInteractions(() => {
    playChain = playChain.then(() => playOutcomeSound(success)).catch(() => {});
  });
}

/**
 * Immediate haptics; sound is deferred until after current interactions/animations so verify UI and timers stay smooth.
 */
export function verifyOutcomeFeedback(success: boolean): void {
  if (Platform.OS !== 'web') {
    void Haptics.notificationAsync(
      success ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
  }

  if (Platform.OS === 'web') {
    return;
  }

  scheduleSoundPlayback(success);
}
