import * as RAPIER from '@dimforge/rapier3d/rapier.js';
import {
  ARRIVAL_SLICE,
  ARRIVAL_TERRAIN_RESOLUTION,
  ARRIVAL_TERRAIN_SIZE,
  arrivalTerrainHeight,
} from '@vibes/world';
import type { Vec3 } from '@vibes/world';

import {
  FIXED_STEP_SECONDS,
  GRAVITY_METERS_PER_SECOND_SQUARED,
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
} from './simulationConstants.js';

export interface PhysicsWorldState {
  readonly world: RAPIER.World;
  readonly playerBody: RAPIER.RigidBody;
  readonly playerCollider: RAPIER.Collider;
  readonly crossingColliders: readonly RAPIER.Collider[];
}

function buildTerrainMesh(): {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
} {
  const { columns, rows } = ARRIVAL_TERRAIN_RESOLUTION;
  const vertexValues = new Float32Array(columns * rows * 3);
  const triangleIndices = new Uint32Array((columns - 1) * (rows - 1) * 6);
  const centerX = (ARRIVAL_SLICE.playableBounds.min.x + ARRIVAL_SLICE.playableBounds.max.x) / 2;
  const centerZ = (ARRIVAL_SLICE.playableBounds.min.z + ARRIVAL_SLICE.playableBounds.max.z) / 2;
  const minimumX = centerX - ARRIVAL_TERRAIN_SIZE.widthMeters / 2;
  const minimumZ = centerZ - ARRIVAL_TERRAIN_SIZE.depthMeters / 2;
  const stepX = ARRIVAL_TERRAIN_SIZE.widthMeters / (columns - 1);
  const stepZ = ARRIVAL_TERRAIN_SIZE.depthMeters / (rows - 1);

  for (let column = 0; column < columns; column += 1) {
    const x = minimumX + column * stepX;

    for (let row = 0; row < rows; row += 1) {
      const z = minimumZ + row * stepZ;
      const vertexIndex = (column * rows + row) * 3;
      vertexValues[vertexIndex] = x;
      vertexValues[vertexIndex + 1] = arrivalTerrainHeight(x, z);
      vertexValues[vertexIndex + 2] = z;
    }
  }

  let indexOffset = 0;
  for (let column = 0; column < columns - 1; column += 1) {
    for (let row = 0; row < rows - 1; row += 1) {
      const northwest = column * rows + row;
      const southwest = northwest + 1;
      const northeast = (column + 1) * rows + row;
      const southeast = northeast + 1;

      triangleIndices[indexOffset] = northwest;
      triangleIndices[indexOffset + 1] = southwest;
      triangleIndices[indexOffset + 2] = northeast;
      triangleIndices[indexOffset + 3] = southwest;
      triangleIndices[indexOffset + 4] = southeast;
      triangleIndices[indexOffset + 5] = northeast;
      indexOffset += 6;
    }
  }

  return { vertices: vertexValues, indices: triangleIndices };
}

export function createPhysicsWorld(initialPosition: Vec3): PhysicsWorldState {
  const world = new RAPIER.World({
    x: 0,
    y: GRAVITY_METERS_PER_SECOND_SQUARED,
    z: 0,
  });
  world.timestep = FIXED_STEP_SECONDS;

  const terrain = buildTerrainMesh();
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(terrain.vertices, terrain.indices).setFriction(0.9),
  );

  const loom = ARRIVAL_SLICE.content.loom;
  const loomAnchor = ARRIVAL_SLICE.anchors.find(({ id }) => id === loom.anchorId);
  if (loomAnchor === undefined)
    throw new Error('Loom anchor is missing from the world definition.');
  world.createCollider(
    RAPIER.ColliderDesc.cylinder(loom.platformHeightMeters / 2, loom.platformRadiusMeters)
      .setTranslation(
        loomAnchor.position.x,
        arrivalTerrainHeight(loomAnchor.position.x, loomAnchor.position.z) +
          loom.platformCenterOffsetYMeters,
        loomAnchor.position.z,
      )
      .setFriction(0.9),
  );

  const crossingColliders = ARRIVAL_SLICE.crossingSegments.map((segment) => {
    const { activePosition, sizeMeters } = segment;
    return world.createCollider(
      RAPIER.ColliderDesc.cuboid(sizeMeters.x / 2, sizeMeters.y / 2, sizeMeters.z / 2)
        .setTranslation(activePosition.x, activePosition.y, activePosition.z)
        .setFriction(0.9)
        .setEnabled(false),
    );
  });

  const playerBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(initialPosition.x, initialPosition.y, initialPosition.z)
      .setCanSleep(false)
      .setCcdEnabled(true)
      .enabledRotations(false, false, false),
  );
  const playerCollider = world.createCollider(
    RAPIER.ColliderDesc.capsule(PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS)
      .setDensity(1)
      .setFriction(0),
    playerBody,
  );

  return { world, playerBody, playerCollider, crossingColliders };
}
