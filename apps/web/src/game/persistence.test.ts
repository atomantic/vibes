import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArrivalSliceSave } from '@vibes/protocol';
import { ARRIVAL_SLICE_SEED } from '@vibes/world';

import { persistArrivalSave, readArrivalSave } from './persistence.js';

const SAVE_KEY = 'vibes.arrival-slice.save.v1';
const validSave: ArrivalSliceSave = {
  schemaVersion: 1,
  worldSeed: ARRIVAL_SLICE_SEED,
  arrivalChimeActivated: false,
  loomAwakened: false,
  optionalVistaFound: false,
  collectedEchoShards: ['tidepool'],
  checkpoint: 'shore',
};

function stubLocalStorage(storedValue: string | null = null): {
  readonly getItem: ReturnType<typeof vi.fn>;
  readonly setItem: ReturnType<typeof vi.fn>;
} {
  const getItem = vi.fn((): string | null => storedValue);
  const setItem = vi.fn((): void => undefined);
  vi.stubGlobal('window', { localStorage: { getItem, setItem } });
  return { getItem, setItem };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('arrival save persistence', () => {
  it('reads a valid save for the current world seed', () => {
    const { getItem } = stubLocalStorage(JSON.stringify(validSave));

    expect(readArrivalSave()).toEqual(validSave);
    expect(getItem).toHaveBeenCalledWith(SAVE_KEY);
  });

  it('rejects a structurally valid save from a different world seed', () => {
    stubLocalStorage(
      JSON.stringify({
        ...validSave,
        worldSeed: ARRIVAL_SLICE_SEED + 1,
      }),
    );

    expect(readArrivalSave()).toBeUndefined();
  });

  it('returns true after writing a save', () => {
    const { setItem } = stubLocalStorage();

    expect(persistArrivalSave(validSave)).toBe(true);
    expect(setItem).toHaveBeenCalledWith(SAVE_KEY, JSON.stringify(validSave));
  });

  it('returns false instead of throwing when storage rejects a write', () => {
    const { setItem } = stubLocalStorage();
    setItem.mockImplementation(() => {
      throw new Error('Storage is unavailable');
    });

    expect(persistArrivalSave(validSave)).toBe(false);
  });
});
