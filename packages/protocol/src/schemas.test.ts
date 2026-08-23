import { describe, expect, it } from 'vitest';

import { ArrivalSliceSaveSchema, ObjectiveSnapshotSchema } from './schemas.js';

const validSave = {
  schemaVersion: 1 as const,
  worldSeed: 0x5649_4245,
  arrivalChimeActivated: true,
  loomAwakened: true,
  optionalVistaFound: false,
  collectedEchoShards: ['pond', 'tidepool'] as ('ledge' | 'pond' | 'tidepool')[],
  checkpoint: 'loom' as const,
  bestArrivalTimeMs: 42_000,
};

describe('Arrival slice save schema', () => {
  it('accepts a progression-consistent completed save', () => {
    expect(ArrivalSliceSaveSchema.parse(validSave)).toEqual(validSave);
  });

  it('defaults collected Echo Shards so version-1 saves stay readable', () => {
    const legacy: Record<string, unknown> = { ...validSave };
    delete legacy['collectedEchoShards'];
    const parsed = ArrivalSliceSaveSchema.parse(legacy);
    expect(parsed.collectedEchoShards).toEqual([]);
    expect(parsed).toEqual({ ...validSave, collectedEchoShards: [] });
  });

  it.each([
    ['duplicate shard keys', { ...validSave, collectedEchoShards: ['pond', 'pond'] }],
    ['unknown shard keys', { ...validSave, collectedEchoShards: ['crater'] }],
    ['more than three shards', { ...validSave, collectedEchoShards: ['a', 'b', 'c', 'd'] }],
  ] satisfies readonly (readonly [string, object])[])('rejects %s', (_label, candidate) => {
    expect(ArrivalSliceSaveSchema.safeParse(candidate).success).toBe(false);
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

describe('Objective snapshot schema', () => {
  const validObjective = {
    arrivalChimeActivated: true,
    crossingRaised: true,
    loomAwakened: false,
    optionalVistaFound: false,
    checkpoint: 'ridge' as const,
  };

  it('defaults collected Echo Shards on runtime snapshots that predate them', () => {
    const parsed = ObjectiveSnapshotSchema.parse(validObjective);
    expect(parsed.collectedEchoShards).toEqual([]);
  });

  it('rejects duplicate shard entries', () => {
    expect(
      ObjectiveSnapshotSchema.safeParse({
        ...validObjective,
        collectedEchoShards: ['ledge', 'ledge'],
      }).success,
    ).toBe(false);
  });
});
