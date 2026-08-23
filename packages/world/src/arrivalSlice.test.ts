import { describe, expect, it } from 'vitest';

import {
  ARRIVAL_ECHO_SHARDS,
  ARRIVAL_SLICE_DEFINITION,
  ARRIVAL_SLICE_IDS,
  ARRIVAL_SLICE_POSITIONS,
  ARRIVAL_SLICE_SEED,
  ARRIVAL_SLICE_CONTENT,
  ARRIVAL_POND,
  ARRIVAL_VISUAL_ARCHETYPES,
  ARRIVAL_VISUAL_GENERATORS,
  ARRIVAL_TERRAIN_CELL_SIZE_METERS,
  ARRIVAL_TERRAIN_ORIGIN,
  ARRIVAL_TERRAIN_RESOLUTION,
  ARRIVAL_TERRAIN_SIZE,
  ArrivalSliceDefinitionValidationError,
  arrivalTerrainHeight,
  assertValidArrivalSliceDefinition,
  createSeededRandomStream,
  getArrivalSliceAnchor,
  validateArrivalSliceDefinition,
} from './index.js';
import type { ArrivalSliceDefinition } from './types.js';

describe('Arrival slice definition', () => {
  it('uses stable world coordinates and IDs', () => {
    expect(ARRIVAL_SLICE_SEED).toBe(0x56494245);
    expect(ARRIVAL_SLICE_IDS.arrivalShore).toBe('landmark.arrival-shore');
    expect(ARRIVAL_SLICE_IDS.arrivalChime).toBe('interaction.arrival-chime');
    expect(ARRIVAL_SLICE_IDS.crossing).toBe('mechanism.arrival-crossing');
    expect(ARRIVAL_SLICE_IDS.loom).toBe('landmark.loom');
    expect(ARRIVAL_SLICE_IDS.contentArrivalShoreGrassLaunch).toBe(
      'content.arrival-shore.scatter.grass.launch',
    );
    expect(ARRIVAL_SLICE_POSITIONS.arrivalSpawn).toEqual({ x: 0, y: 2, z: 112 });
    expect(ARRIVAL_SLICE_POSITIONS.arrivalChime).toEqual({ x: 4, y: 11, z: 37 });
    expect(ARRIVAL_SLICE_POSITIONS.loom).toEqual({ x: 0, y: 12, z: 0 });
  });

  it('is valid and has a deterministic serialized representation', () => {
    expect(validateArrivalSliceDefinition()).toEqual([]);
    expect(() => {
      assertValidArrivalSliceDefinition();
    }).not.toThrow();

    const first = JSON.stringify(ARRIVAL_SLICE_DEFINITION);
    const second = JSON.stringify(ARRIVAL_SLICE_DEFINITION);
    expect(second).toBe(first);
  });

  it('gives each scatter descriptor a stable deterministic stream', () => {
    const scatter = ARRIVAL_SLICE_CONTENT.arrivalShore.scatter;
    const rock = scatter.find(({ archetype }) => archetype === 'rock');
    const coral = scatter.find(({ archetype }) => archetype === 'coral');
    const grass = scatter.find(({ archetype }) => archetype === 'grass');
    const launchGrass = scatter.find(
      ({ id }) => id === ARRIVAL_SLICE_IDS.contentArrivalShoreGrassLaunch,
    );
    expect(rock).toBeDefined();
    expect(coral).toBeDefined();
    expect(grass).toBeDefined();
    expect(launchGrass).toBeDefined();
    if (
      rock === undefined ||
      coral === undefined ||
      grass === undefined ||
      launchGrass === undefined
    )
      return;

    const sample = (contentId: string, seedOffset: number, count: number): number[] => {
      const random = createSeededRandomStream(ARRIVAL_SLICE_SEED, contentId, seedOffset);
      return Array.from({ length: count }, () => random());
    };
    const generate = (order: readonly (typeof scatter)[number][], rockCount: number) => {
      const values = new Map<string, number[]>();
      for (const descriptor of order) {
        values.set(
          descriptor.id,
          sample(
            descriptor.id,
            descriptor.seedOffset,
            descriptor.archetype === 'rock' ? rockCount : 6,
          ),
        );
      }
      return Object.fromEntries(
        [...values.entries()].sort(([left], [right]) => left.localeCompare(right)),
      );
    };

    const firstPass = generate([rock, coral], 6);
    const reorderedPass = generate([coral, rock], 6);
    const changedRockCountPass = generate([rock, coral], 48);
    expect(reorderedPass).toEqual(firstPass);
    expect(changedRockCountPass[coral.id]).toEqual(firstPass[coral.id]);
    expect(sample(rock.id, rock.seedOffset, 8)).toEqual(sample(rock.id, rock.seedOffset, 8));
    expect(firstPass[rock.id]).not.toEqual(firstPass[coral.id]);
    expect(sample(grass.id, grass.seedOffset, 8)).not.toEqual(
      sample(launchGrass.id, launchGrass.seedOffset, 8),
    );
    expect(sample(rock.id, rock.seedOffset, 4)).toEqual([
      0.9442654587328434, 0.13359356671571732, 0.08415482798591256, 0.06057725730352104,
    ]);
  });

  it('registers stable visual archetypes and their renderer generators', () => {
    expect(ARRIVAL_VISUAL_GENERATORS.content['arrival-shore-heightfield']).toEqual({
      id: 'visual.generator.arrival-shore-heightfield',
      kind: 'content',
    });
    expect(ARRIVAL_VISUAL_ARCHETYPES.scatter.rock).toEqual({
      id: 'visual.archetype.scatter.rock',
      kind: 'scatter',
      generator: 'scatter-rock',
    });
    expect(ARRIVAL_VISUAL_ARCHETYPES.silhouette['forest-basin'].generator).toBe(
      'silhouette-forest-basin',
    );

    const registeredIds = [
      ...Object.values(ARRIVAL_SLICE_DEFINITION.visualGenerators.content),
      ...Object.values(ARRIVAL_SLICE_DEFINITION.visualGenerators.scatter),
      ...Object.values(ARRIVAL_SLICE_DEFINITION.visualGenerators.silhouette),
      ...Object.values(ARRIVAL_SLICE_DEFINITION.visualArchetypes.scatter),
      ...Object.values(ARRIVAL_SLICE_DEFINITION.visualArchetypes.silhouette),
    ].map(({ id }) => id);
    expect(new Set(registeredIds).size).toBe(registeredIds.length);
  });

  it('rejects content that references an unknown visual generator', () => {
    const invalid: ArrivalSliceDefinition = {
      ...ARRIVAL_SLICE_DEFINITION,
      content: {
        ...ARRIVAL_SLICE_DEFINITION.content,
        arrivalShore: {
          ...ARRIVAL_SLICE_DEFINITION.content.arrivalShore,
          generator: 'missing-generator' as never,
        },
      },
    };

    expect(validateArrivalSliceDefinition(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-generator',
          path: 'content[0].generator',
        }),
      ]),
    );
  });

  it('rejects scatter content that references an unknown archetype', () => {
    const invalid: ArrivalSliceDefinition = {
      ...ARRIVAL_SLICE_DEFINITION,
      content: {
        ...ARRIVAL_SLICE_DEFINITION.content,
        arrivalShore: {
          ...ARRIVAL_SLICE_DEFINITION.content.arrivalShore,
          scatter: ARRIVAL_SLICE_DEFINITION.content.arrivalShore.scatter.map((descriptor, index) =>
            index === 0 ? { ...descriptor, archetype: 'missing-archetype' as never } : descriptor,
          ),
        },
      },
    };

    expect(validateArrivalSliceDefinition(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-generator',
          path: 'content.arrivalShore.scatter[0].archetype',
        }),
      ]),
    );
  });

  it('defines one deterministic terrain grid for rendering and collision', () => {
    expect(ARRIVAL_TERRAIN_SIZE).toEqual({ widthMeters: 160, depthMeters: 165 });
    expect(ARRIVAL_TERRAIN_ORIGIN).toEqual({ x: -80, z: -24.5 });
    expect(ARRIVAL_TERRAIN_CELL_SIZE_METERS).toBe(2.5);
    expect(ARRIVAL_TERRAIN_RESOLUTION).toEqual({ columns: 65, rows: 67 });
    expect(
      ARRIVAL_TERRAIN_ORIGIN.x +
        (ARRIVAL_TERRAIN_RESOLUTION.columns - 1) * ARRIVAL_TERRAIN_CELL_SIZE_METERS,
    ).toBe(80);
    expect(
      ARRIVAL_TERRAIN_ORIGIN.z +
        (ARRIVAL_TERRAIN_RESOLUTION.rows - 1) * ARRIVAL_TERRAIN_CELL_SIZE_METERS,
    ).toBe(140.5);

    const samples = [
      [0, 112],
      [9, 70],
      [4, 37],
      [1, 25.5],
      [0, 0],
      [-47.5, 91.25],
    ] as const;
    const firstPass = samples.map(([x, z]) => arrivalTerrainHeight(x, z));
    const secondPass = samples.map(([x, z]) => arrivalTerrainHeight(x, z));
    expect(secondPass).toEqual(firstPass);
    expect(firstPass.every(Number.isFinite)).toBe(true);
  });

  it('places a shallow pond beside the launch route', () => {
    expect(ARRIVAL_POND).toEqual({
      centerX: 11,
      centerZ: 104,
      radiusX: 7,
      radiusZ: 4.5,
      surfaceY: 0.58,
      bedY: 0.18,
    });
    expect(arrivalTerrainHeight(ARRIVAL_POND.centerX, ARRIVAL_POND.centerZ)).toBe(
      ARRIVAL_POND.bedY,
    );
    expect(arrivalTerrainHeight(0, ARRIVAL_POND.centerZ)).toBeGreaterThan(ARRIVAL_POND.surfaceY);
  });

  it('keeps the raised crossing within the authored jump envelope', () => {
    const activeSurfaceHeights = ARRIVAL_SLICE_DEFINITION.crossingSegments.map(
      ({ activePosition, sizeMeters }) => activePosition.y + sizeMeters.y / 2,
    );
    expect(activeSurfaceHeights).toEqual([10.2, 10.2, 10.2]);
    expect(
      (activeSurfaceHeights[0] ?? Number.POSITIVE_INFINITY) - arrivalTerrainHeight(5, 33),
    ).toBeLessThan(0.6);
    expect(Math.abs((activeSurfaceHeights[2] ?? 0) - arrivalTerrainHeight(1, 16))).toBeLessThan(
      0.1,
    );
  });

  it('keeps every main-route anchor above its terrain sample', () => {
    for (const step of ARRIVAL_SLICE_DEFINITION.route) {
      const anchor = getArrivalSliceAnchor(step.anchorId);
      expect(anchor, step.anchorId).toBeDefined();
      if (anchor) {
        expect(
          anchor.position.y,
          `${anchor.id} must remain above canonical terrain`,
        ).toBeGreaterThan(arrivalTerrainHeight(anchor.position.x, anchor.position.z));
      }
    }
  });

  it('rejects non-finite terrain coordinates', () => {
    expect(() => arrivalTerrainHeight(Number.NaN, 0)).toThrow(RangeError);
    expect(() => arrivalTerrainHeight(0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('exposes the four distant region silhouettes', () => {
    const silhouettes = ARRIVAL_SLICE_DEFINITION.content.distantSilhouettes;
    expect(silhouettes.map(({ archetype }) => archetype)).toEqual([
      'forest-basin',
      'wind-canyon',
      'sky-ruin',
      'beacon-spire',
    ]);
    expect(silhouettes.map(({ anchorId }) => getArrivalSliceAnchor(anchorId)?.spatialRole)).toEqual(
      ['backdrop', 'backdrop', 'backdrop', 'backdrop'],
    );
  });

  it('places every Echo Shard inside the playable bounds and within reach of its terrain', () => {
    expect(ARRIVAL_ECHO_SHARDS.map(({ key }) => key)).toEqual(['tidepool', 'ledge', 'pond']);
    const { min, max } = ARRIVAL_SLICE_DEFINITION.playableBounds;
    for (const shard of ARRIVAL_ECHO_SHARDS) {
      expect(shard.position.x, shard.id).toBeGreaterThanOrEqual(min.x);
      expect(shard.position.x, shard.id).toBeLessThanOrEqual(max.x);
      expect(shard.position.z, shard.id).toBeGreaterThanOrEqual(min.z);
      expect(shard.position.z, shard.id).toBeLessThanOrEqual(max.z);
      const ground = arrivalTerrainHeight(shard.position.x, shard.position.z);
      // Hovering low keeps each shard collectable from the ground or a wade.
      expect(shard.position.y - ground, shard.id).toBeGreaterThan(0.8);
      expect(shard.position.y - ground, shard.id).toBeLessThan(3);
    }
  });

  it('rejects duplicate stable IDs', () => {
    const duplicateAnchor = {
      ...ARRIVAL_SLICE_DEFINITION.anchors[0],
      position: { x: 1, y: 2, z: 100 },
    };
    const invalid: ArrivalSliceDefinition = {
      ...ARRIVAL_SLICE_DEFINITION,
      anchors: [...ARRIVAL_SLICE_DEFINITION.anchors, duplicateAnchor],
    };

    expect(validateArrivalSliceDefinition(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'duplicate-id',
          path: `anchors[${ARRIVAL_SLICE_DEFINITION.anchors.length.toString()}].id`,
        }),
      ]),
    );
  });

  it('rejects duplicate scatter stable IDs', () => {
    const firstScatter = ARRIVAL_SLICE_DEFINITION.content.arrivalShore.scatter[0];
    const scatter = ARRIVAL_SLICE_DEFINITION.content.arrivalShore.scatter;
    const invalid: ArrivalSliceDefinition = {
      ...ARRIVAL_SLICE_DEFINITION,
      content: {
        ...ARRIVAL_SLICE_DEFINITION.content,
        arrivalShore: {
          ...ARRIVAL_SLICE_DEFINITION.content.arrivalShore,
          scatter: [...scatter, { ...firstScatter }],
        },
      },
    };

    expect(validateArrivalSliceDefinition(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'duplicate-id',
          path: `content.arrivalShore.scatter[${scatter.length.toString()}].id`,
        }),
      ]),
    );
  });

  it('rejects non-finite playable positions and missing references', () => {
    const invalid: ArrivalSliceDefinition = {
      ...ARRIVAL_SLICE_DEFINITION,
      anchors: ARRIVAL_SLICE_DEFINITION.anchors.map((anchor) =>
        anchor.id === ARRIVAL_SLICE_IDS.arrivalChime
          ? { ...anchor, position: { ...anchor.position, x: Number.NaN } }
          : anchor,
      ),
      route: ARRIVAL_SLICE_DEFINITION.route.map((step, index) =>
        index === 1 ? { ...step, anchorId: 'missing.anchor' } : step,
      ),
    };

    expect(validateArrivalSliceDefinition(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-position' }),
        expect.objectContaining({ code: 'missing-reference' }),
      ]),
    );
  });

  it('throws a structured validation error', () => {
    const invalid: ArrivalSliceDefinition = {
      ...ARRIVAL_SLICE_DEFINITION,
      interactions: ARRIVAL_SLICE_DEFINITION.interactions.map((interaction, index) =>
        index === 0 ? { ...interaction, radiusMeters: 0 } : interaction,
      ),
    };

    expect(() => {
      assertValidArrivalSliceDefinition(invalid);
    }).toThrow(ArrivalSliceDefinitionValidationError);
  });
});
