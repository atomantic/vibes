import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  createDistanceTierEnvironment,
  createStylizedGrassField,
  partitionInstancedScatter,
} from './StylizedEnvironment';

function createDeterministicRandom(): () => number {
  let value = 0x1234_5678;
  return () => {
    value += 0x6d2b_79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('createStylizedGrassField', () => {
  it('preserves backdrop placement when the legacy radius and scale band are explicit', () => {
    const build = (descriptorDriven: boolean) =>
      createStylizedGrassField({
        count: 24,
        time: { value: 0 },
        heightAt: () => 4,
        random: createDeterministicRandom(),
        ...(descriptorDriven
          ? { radiusMeters: 75, minBladeHeight: 0.62, maxBladeHeight: 1.5 }
          : {}),
      });

    const legacy = build(false);
    const descriptorDriven = build(true);

    expect(descriptorDriven.count).toBe(legacy.count);
    expect(Array.from(descriptorDriven.instanceMatrix.array)).toEqual(
      Array.from(legacy.instanceMatrix.array),
    );
  });
});

function makeRepresentation(): {
  readonly group: Group;
  readonly geometry: BoxGeometry;
  readonly material: MeshBasicMaterial;
} {
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial();
  const group = new Group();
  group.add(new Mesh(geometry, material));
  return { group, geometry, material };
}

describe('createDistanceTierEnvironment', () => {
  it('switches representations with hysteresis around the camera distance', () => {
    const near = makeRepresentation();
    const far = makeRepresentation();
    const environment = createDistanceTierEnvironment({
      center: { x: 0, y: 0, z: 0 },
      near: near.group,
      far: far.group,
      nearDistance: 4,
      farDistance: 8,
    });

    expect(environment.activeTier).toBe('near');
    expect(near.group.visible).toBe(true);
    expect(far.group.visible).toBe(false);
    expect(environment.update(new Vector3(9, 0, 0))).toBe('far');
    expect(near.group.visible).toBe(false);
    expect(far.group.visible).toBe(true);
    expect(environment.update(new Vector3(6, 0, 0))).toBe('far');
    expect(environment.update(new Vector3(3, 0, 0))).toBe('near');
    expect(near.group.visible).toBe(true);
    expect(far.group.visible).toBe(false);

    environment.dispose();
  });

  it('disposes old representations during rebuild and remains idempotent', () => {
    const near = makeRepresentation();
    const far = makeRepresentation();
    const environment = createDistanceTierEnvironment({
      center: { x: 4, y: 2, z: -3 },
      near: near.group,
      far: far.group,
      nearDistance: 2,
      farDistance: 5,
    });
    const nextNear = makeRepresentation();
    const nextFar = makeRepresentation();
    const oldNearGeometryDispose = vi.spyOn(near.geometry, 'dispose');
    const oldNearMaterialDispose = vi.spyOn(near.material, 'dispose');
    const oldFarGeometryDispose = vi.spyOn(far.geometry, 'dispose');
    const nextNearGeometryDispose = vi.spyOn(nextNear.geometry, 'dispose');
    const nextFarGeometryDispose = vi.spyOn(nextFar.geometry, 'dispose');

    environment.rebuild(nextNear.group, nextFar.group);

    expect(oldNearGeometryDispose).toHaveBeenCalledOnce();
    expect(oldNearMaterialDispose).toHaveBeenCalledOnce();
    expect(oldFarGeometryDispose).toHaveBeenCalledOnce();
    expect(environment.activeTier).toBe('near');
    expect(environment.group.children).toEqual([nextNear.group, nextFar.group]);
    expect(nextNear.group.visible).toBe(true);
    expect(nextFar.group.visible).toBe(false);

    environment.dispose();
    environment.dispose();

    expect(nextNearGeometryDispose).toHaveBeenCalledOnce();
    expect(nextFarGeometryDispose).toHaveBeenCalledOnce();
    expect(environment.group.children).toHaveLength(0);
  });

  it('re-evaluates the tier against the last camera position on rebuild', () => {
    // Rebuild used to reset to the near tier unconditionally. A rebuild while
    // the camera sits out past the far band would then attach the dense near
    // scatter at distance and hold it there until the camera crossed the band
    // again — the exact cost this LOD exists to avoid.
    const near = makeRepresentation();
    const far = makeRepresentation();
    const environment = createDistanceTierEnvironment({
      center: { x: 0, y: 0, z: 0 },
      near: near.group,
      far: far.group,
      nearDistance: 4,
      farDistance: 8,
    });

    expect(environment.update(new Vector3(20, 0, 0))).toBe('far');

    const nextNear = makeRepresentation();
    const nextFar = makeRepresentation();
    environment.rebuild(nextNear.group, nextFar.group);

    expect(environment.activeTier).toBe('far');
    expect(nextNear.group.visible).toBe(false);
    expect(nextFar.group.visible).toBe(true);

    environment.dispose();
  });

  it('rejects invalid distance bands', () => {
    const near = new Group();
    const far = new Group();

    expect(() =>
      createDistanceTierEnvironment({
        center: { x: 0, y: 0, z: 0 },
        near,
        far,
        nearDistance: 6,
        farDistance: 6,
      }),
    ).toThrow('finite and ordered');
    expect(() =>
      createDistanceTierEnvironment({
        center: { x: 0, y: 0, z: 0 },
        near,
        far,
        nearDistance: -1,
        farDistance: 6,
      }),
    ).toThrow('finite and ordered');
  });
});

function makeInstancedScatter(zPositions: readonly number[]): InstancedMesh {
  const mesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshBasicMaterial(),
    zPositions.length,
  );
  zPositions.forEach((z, index) => {
    mesh.setMatrixAt(index, new Matrix4().makeTranslation(index, 0, z));
  });
  mesh.name = 'scatter';
  mesh.castShadow = true;
  return mesh;
}

function instanceZ(mesh: InstancedMesh): number[] {
  const transform = new Matrix4();
  const position = new Vector3();
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, transform);
    return position.setFromMatrixPosition(transform).z;
  });
}

describe('partitionInstancedScatter', () => {
  it('assigns every instance to a band and thins the far tier from the same placements', () => {
    const source = makeInstancedScatter([-30, 0, 10, 24.5, 25, 40, 60, 74, 80, 200]);
    const disposeSource = vi.spyOn(source, 'dispose');

    const bands = partitionInstancedScatter(
      source,
      [{ maxZ: 25 }, { maxZ: 75 }, { maxZ: Number.POSITIVE_INFINITY }],
      2,
    );

    expect(bands.map((band) => (band === null ? [] : instanceZ(band.near)))).toEqual([
      [-30, 0, 10, 24.5],
      [25, 40, 60, 74],
      [80, 200],
    ]);
    expect(bands.map((band) => (band === null ? [] : instanceZ(band.far)))).toEqual([
      [-30, 10],
      [25, 60],
      [80],
    ]);
    const first = bands[0];
    expect(first?.near.geometry).toBe(source.geometry);
    expect(first?.near.material).toBe(source.material);
    expect(first?.near.castShadow).toBe(true);
    expect(first?.near.name).toBe('scatter#0:near');
    expect(first?.far.name).toBe('scatter#0:far');
    expect(first?.near.boundingSphere).not.toBeNull();
    expect(disposeSource).toHaveBeenCalledOnce();
  });

  it('keeps instances past the last band and reports empty bands as null', () => {
    const source = makeInstancedScatter([90, 120]);
    const bands = partitionInstancedScatter(source, [{ maxZ: 25 }, { maxZ: 75 }], 4);

    expect(bands[0]).toBeNull();
    expect(bands[1] === null || bands[1] === undefined ? [] : instanceZ(bands[1].near)).toEqual([
      90, 120,
    ]);
    expect(bands[1] === null || bands[1] === undefined ? [] : instanceZ(bands[1].far)).toEqual([
      90,
    ]);
  });

  it('carries per-instance colors into both tiers', () => {
    const source = makeInstancedScatter([0, 1]);
    source.setColorAt(0, new Color('#ff0000'));
    source.setColorAt(1, new Color('#00ff00'));

    const [band] = partitionInstancedScatter(source, [{ maxZ: 10 }], 2);
    const color = new Color();

    band?.near.getColorAt(1, color);
    expect(color.getHexString()).toBe('00ff00');
    band?.far.getColorAt(0, color);
    expect(color.getHexString()).toBe('ff0000');
  });

  it('rejects unordered bands and invalid strides', () => {
    expect(() => partitionInstancedScatter(makeInstancedScatter([0]), [], 2)).toThrow(
      'at least one band',
    );
    expect(() =>
      partitionInstancedScatter(makeInstancedScatter([0]), [{ maxZ: 10 }, { maxZ: 5 }], 2),
    ).toThrow('ascending maxZ');
    expect(() => partitionInstancedScatter(makeInstancedScatter([0]), [{ maxZ: 10 }], 0)).toThrow(
      'positive integer',
    );
  });
});
