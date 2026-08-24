import { describe, expect, it } from 'vitest';

import { ARRIVAL_SLICE_DEFINITION, validateArrivalSliceDefinition } from './index.js';
import type { ArrivalSliceDefinition } from './types.js';

// The visual-generator/archetype registries exist so content can name a renderer
// by a stable id instead of the renderer branching on content. That only holds
// if the registries are checked: an unknown key, a mislabelled kind, a missing
// entry, or a reused id all mean content resolves to the wrong generator — or to
// none — with nothing at runtime to say so. These cover the guards that catch
// each of those, which the happy-path definition never exercises.

/** Rebuild the definition with one visual-generator group swapped out. */
function withGeneratorGroup(
  kind: 'content' | 'scatter' | 'silhouette',
  group: Record<string, unknown>,
): ArrivalSliceDefinition {
  return {
    ...ARRIVAL_SLICE_DEFINITION,
    visualGenerators: {
      ...ARRIVAL_SLICE_DEFINITION.visualGenerators,
      [kind]: group,
    },
  };
}

describe('validateArrivalSliceDefinition — visual generator registry', () => {
  it('accepts the shipped definition', () => {
    expect(validateArrivalSliceDefinition()).toEqual([]);
  });

  it('rejects a generator key that is not a known generator', () => {
    const invalid = withGeneratorGroup('scatter', {
      ...ARRIVAL_SLICE_DEFINITION.visualGenerators.scatter,
      'scatter-nonesuch': { id: 'visual.generator.scatter-nonesuch', kind: 'scatter' },
    });

    expect(validateArrivalSliceDefinition(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-generator',
          path: 'visualGenerators.scatter.scatter-nonesuch',
        }),
      ]),
    );
  });

  it('rejects a generator registered under the wrong kind', () => {
    // A scatter generator filed as content would be handed content descriptors
    // it cannot render.
    const scatter = ARRIVAL_SLICE_DEFINITION.visualGenerators.scatter;
    const invalid = withGeneratorGroup('scatter', {
      ...scatter,
      'scatter-rock': { ...scatter['scatter-rock'], kind: 'content' },
    });

    expect(validateArrivalSliceDefinition(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-generator',
          path: 'visualGenerators.scatter.scatter-rock.kind',
        }),
      ]),
    );
  });

  it('rejects a registry missing one of its known generators', () => {
    const withoutRock = Object.fromEntries(
      Object.entries(ARRIVAL_SLICE_DEFINITION.visualGenerators.scatter).filter(
        ([generatorId]) => generatorId !== 'scatter-rock',
      ),
    );
    const invalid = withGeneratorGroup('scatter', withoutRock);

    expect(validateArrivalSliceDefinition(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-generator',
          path: 'visualGenerators.scatter',
        }),
      ]),
    );
  });

  it('rejects a generator id that is not in canonical form', () => {
    const scatter = ARRIVAL_SLICE_DEFINITION.visualGenerators.scatter;
    const invalid = withGeneratorGroup('scatter', {
      ...scatter,
      'scatter-rock': { ...scatter['scatter-rock'], id: 'Not A Canonical Id' },
    });

    expect(validateArrivalSliceDefinition(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-id',
          path: 'visualGenerators.scatter.scatter-rock.id',
        }),
      ]),
    );
  });

  it('rejects two registry entries that claim the same stable id', () => {
    const scatter = ARRIVAL_SLICE_DEFINITION.visualGenerators.scatter;
    const invalid = withGeneratorGroup('scatter', {
      ...scatter,
      'scatter-coral': { ...scatter['scatter-coral'], id: scatter['scatter-rock'].id },
    });

    expect(validateArrivalSliceDefinition(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'duplicate-id',
          path: 'visualGenerators.scatter.scatter-coral.id',
        }),
      ]),
    );
  });
});

describe('validateArrivalSliceDefinition — scatter descriptors', () => {
  it('rejects two scatter descriptors that claim the same stable id', () => {
    const scatter = ARRIVAL_SLICE_DEFINITION.content.arrivalShore.scatter;
    const invalid: ArrivalSliceDefinition = {
      ...ARRIVAL_SLICE_DEFINITION,
      content: {
        ...ARRIVAL_SLICE_DEFINITION.content,
        arrivalShore: {
          ...ARRIVAL_SLICE_DEFINITION.content.arrivalShore,
          scatter: scatter.map((descriptor, index) =>
            index === 1 ? { ...descriptor, id: scatter[0].id } : descriptor,
          ),
        },
      },
    };

    expect(validateArrivalSliceDefinition(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'duplicate-id',
          path: 'content.arrivalShore.scatter[1].id',
        }),
      ]),
    );
  });
});
