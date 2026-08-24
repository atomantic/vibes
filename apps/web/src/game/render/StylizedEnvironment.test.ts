import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { createDistanceTierEnvironment } from './StylizedEnvironment';

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
