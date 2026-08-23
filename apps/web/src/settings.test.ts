import { afterEach, describe, expect, it, vi } from 'vitest';

import { normalizePlayerSettings, readPlayerSettings } from './settings';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('player settings', () => {
  it('rejects non-finite persisted numeric values', () => {
    expect(
      normalizePlayerSettings(
        {
          cameraSensitivity: Number.POSITIVE_INFINITY,
          uiScale: Number.NaN,
        },
        false,
      ),
    ).toEqual({
      reducedMotion: false,
      cameraSensitivity: 1,
      uiScale: 1,
      soundMuted: false,
    });
  });

  it('clamps finite values and preserves the reduced-motion preference', () => {
    expect(
      normalizePlayerSettings(
        {
          cameraSensitivity: 8,
          uiScale: 0.1,
          reducedMotion: true,
          soundMuted: true,
        },
        false,
      ),
    ).toEqual({
      reducedMotion: true,
      cameraSensitivity: 2,
      uiScale: 0.85,
      soundMuted: true,
    });
  });

  it('reads malformed and non-finite storage values safely', () => {
    const getItem = vi.fn(() => '{"cameraSensitivity":1e999,"uiScale":1e999}');
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({ matches: true })),
      localStorage: { getItem },
    });

    expect(readPlayerSettings()).toEqual({
      reducedMotion: true,
      cameraSensitivity: 1,
      uiScale: 1,
      soundMuted: false,
    });
    expect(getItem).toHaveBeenCalledOnce();
  });

  it('falls back to defaults when storage is invalid', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({ matches: false })),
      localStorage: { getItem: vi.fn(() => '{') },
    });

    expect(readPlayerSettings()).toEqual({
      reducedMotion: false,
      cameraSensitivity: 1,
      uiScale: 1,
      soundMuted: false,
    });
  });

  it('uses defaults when no settings have been saved', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({ matches: false })),
      localStorage: { getItem: vi.fn(() => null) },
    });

    expect(readPlayerSettings()).toEqual({
      reducedMotion: false,
      cameraSensitivity: 1,
      uiScale: 1,
      soundMuted: false,
    });
  });
});
