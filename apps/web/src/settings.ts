export interface PlayerSettings {
  readonly reducedMotion: boolean;
  readonly cameraSensitivity: number;
  readonly uiScale: number;
  readonly soundMuted: boolean;
}

export const SETTINGS_KEY = 'vibes.player-settings.v1';

export function normalizePlayerSettings(
  value: Partial<PlayerSettings> | undefined,
  prefersReducedMotion: boolean,
): PlayerSettings {
  return {
    reducedMotion:
      typeof value?.reducedMotion === 'boolean' ? value.reducedMotion : prefersReducedMotion,
    cameraSensitivity:
      typeof value?.cameraSensitivity === 'number' && Number.isFinite(value.cameraSensitivity)
        ? Math.min(2, Math.max(0.35, value.cameraSensitivity))
        : 1,
    uiScale:
      typeof value?.uiScale === 'number' && Number.isFinite(value.uiScale)
        ? Math.min(1.35, Math.max(0.85, value.uiScale))
        : 1,
    soundMuted: value?.soundMuted === true,
  };
}

export function readPlayerSettings(): PlayerSettings {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return normalizePlayerSettings(undefined, prefersReducedMotion);
    return normalizePlayerSettings(
      JSON.parse(raw) as Partial<PlayerSettings>,
      prefersReducedMotion,
    );
  } catch {
    return normalizePlayerSettings(undefined, prefersReducedMotion);
  }
}
