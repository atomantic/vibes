import { describe, expect, it } from 'vitest';

import { ArrivalSliceSaveSchema } from './schemas.js';

const validSave = {
  schemaVersion: 1 as const,
  worldSeed: 0x5649_4245,
  arrivalChimeActivated: true,
  loomAwakened: true,
  optionalVistaFound: false,
  checkpoint: 'loom' as const,
  bestArrivalTimeMs: 42_000,
};

describe('Arrival slice save schema', () => {
  it('accepts a progression-consistent completed save', () => {
    expect(ArrivalSliceSaveSchema.parse(validSave)).toEqual(validSave);
  });

  it.each([
    {
      ...validSave,
      arrivalChimeActivated: false,
    },
    {
      ...validSave,
      loomAwakened: false,
    },
    {
      ...validSave,
      checkpoint: 'ridge',
    },
    {
      ...validSave,
      loomAwakened: false,
      checkpoint: 'ridge',
      bestArrivalTimeMs: 42_000,
    },
  ])('rejects a contradictory progression envelope', (candidate) => {
    expect(ArrivalSliceSaveSchema.safeParse(candidate).success).toBe(false);
  });
});
