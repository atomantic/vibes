import * as RAPIER from '@dimforge/rapier3d/rapier.js';
import { ArrivalSliceSaveSchema, InputButton } from '@vibes/protocol';
import type {
  ArrivalSliceSave,
  DurableEvent,
  InputFrame,
  InteractionRequest,
  ObjectiveSnapshot,
  SimulationSnapshot,
  WorldPosition,
} from '@vibes/protocol';
import {
  ARRIVAL_ECHO_SHARDS,
  ARRIVAL_SLICE,
  ARRIVAL_SLICE_IDS,
  ARRIVAL_SLICE_POSITIONS,
  arrivalTerrainHeight,
} from '@vibes/world';
import type { InteractionDescriptor, StableWorldId, Vec3 } from '@vibes/world';

import { createPhysicsWorld } from './physicsWorld.js';
import { SimulationCheckpointSchema } from './checkpointSchema.js';
import {
  COYOTE_TICKS,
  ECHO_SHARD_RADIUS_METERS,
  FIXED_STEP_SECONDS,
  FIXED_TICK_RATE,
  GLIDE_ENGAGE_FALL_SPEED_METERS_PER_SECOND,
  GLIDE_FORWARD_BOOST,
  GLIDE_TERMINAL_FALL_SPEED_METERS_PER_SECOND,
  JUMP_BUFFER_TICKS,
  JUMP_SPEED_METERS_PER_SECOND,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_ENTITY_ID,
  PLAYER_STANDING_HALF_HEIGHT,
  RUN_SPEED_METERS_PER_SECOND,
  SPRINT_SPEED_METERS_PER_SECOND,
  WORLD_CELL_SIZE_METERS,
} from './simulationConstants.js';
import type {
  ArrivalCheckpoint,
  GameSimulationOptions,
  SimulationCheckpoint,
  SimulationStepResult,
} from './types.js';

const UINT32_MAX = 0xffff_ffff;
const GROUND_PROBE_PADDING = 0.16;
const GROUND_MAX_UPWARD_SPEED = 0.5;
const CHECKPOINT_RADIUS_METERS = 4;
const VISTA_RADIUS_METERS = 3.5;
const RESPAWN_BOUNDS_PADDING_METERS = 8;
const MOVEMENT_FACING_EPSILON = 0.0001;
const KNOWN_INPUT_BUTTONS =
  InputButton.Jump | InputButton.Sprint | InputButton.Interact | InputButton.RecenterCamera;
const PHYSICS_SNAPSHOT_MAGIC = 0x5649_4250;
const PHYSICS_SNAPSHOT_BYTE_LENGTH = 64;
const CROSSING_RECOVERY_PADDING_METERS =
  Math.max(
    ...ARRIVAL_SLICE.content.crossing.segments.map(({ sizeMeters }) =>
      Math.max(sizeMeters.x, sizeMeters.z),
    ),
  ) /
    2 +
  PLAYER_CAPSULE_RADIUS;
const CROSSING_RECOVERY_BOUNDS = {
  minX:
    Math.min(
      ...ARRIVAL_SLICE.content.crossing.segments.map(
        ({ activePosition, sizeMeters }) => activePosition.x - sizeMeters.x / 2,
      ),
    ) - CROSSING_RECOVERY_PADDING_METERS,
  maxX:
    Math.max(
      ...ARRIVAL_SLICE.content.crossing.segments.map(
        ({ activePosition, sizeMeters }) => activePosition.x + sizeMeters.x / 2,
      ),
    ) + CROSSING_RECOVERY_PADDING_METERS,
  maxY:
    Math.min(
      ...ARRIVAL_SLICE.content.crossing.segments.map(
        ({ activePosition, sizeMeters }) => activePosition.y - sizeMeters.y / 2,
      ),
    ) - PLAYER_CAPSULE_RADIUS,
  minZ:
    Math.min(
      ...ARRIVAL_SLICE.content.crossing.segments.map(
        ({ activePosition, sizeMeters }) => activePosition.z - sizeMeters.z / 2,
      ),
    ) - CROSSING_RECOVERY_PADDING_METERS,
  maxZ:
    Math.max(
      ...ARRIVAL_SLICE.content.crossing.segments.map(
        ({ activePosition, sizeMeters }) => activePosition.z + sizeMeters.z / 2,
      ),
    ) + CROSSING_RECOVERY_PADDING_METERS,
} as const;

const ZERO_INPUT: InputFrame = {
  sequence: 0,
  intendedTick: 0,
  moveX: 0,
  moveZ: 0,
  lookYaw: 0,
  lookPitch: 0,
  buttons: 0,
};

function copyInput(input: InputFrame): InputFrame {
  return { ...input };
}

function copyObjective(objective: ObjectiveSnapshot): ObjectiveSnapshot {
  return { ...objective, collectedEchoShards: [...objective.collectedEchoShards] };
}

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= UINT32_MAX;
}

function validateInput(input: InputFrame): void {
  if (!isUint32(input.sequence) || !isUint32(input.intendedTick)) {
    throw new RangeError('Input sequence and intended tick must be uint32 values.');
  }

  if (
    !Number.isFinite(input.moveX) ||
    !Number.isFinite(input.moveZ) ||
    input.moveX < -1 ||
    input.moveX > 1 ||
    input.moveZ < -1 ||
    input.moveZ > 1
  ) {
    throw new RangeError('Movement axes must be finite values between -1 and 1.');
  }

  if (
    !Number.isFinite(input.lookYaw) ||
    !Number.isFinite(input.lookPitch) ||
    input.lookYaw < -Math.PI ||
    input.lookYaw > Math.PI ||
    input.lookPitch < -Math.PI / 2 ||
    input.lookPitch > Math.PI / 2
  ) {
    throw new RangeError('Look angles are outside the supported range.');
  }

  if (
    !Number.isInteger(input.buttons) ||
    input.buttons < 0 ||
    (input.buttons & ~KNOWN_INPUT_BUTTONS) !== 0
  ) {
    throw new RangeError('Input button mask contains unsupported bits.');
  }
}

function checkpointPosition(checkpoint: ArrivalCheckpoint): Vec3 {
  switch (checkpoint) {
    case 'shore':
      return ARRIVAL_SLICE_POSITIONS.arrivalSpawn;
    case 'ridge':
      return ARRIVAL_SLICE_POSITIONS.revealRidge;
    case 'loom':
      return ARRIVAL_SLICE_POSITIONS.loom;
  }
}

function playerCenterAt(position: Vec3): Vec3 {
  const safeGroundCenter =
    arrivalTerrainHeight(position.x, position.z) + PLAYER_STANDING_HALF_HEIGHT + 0.05;
  return {
    x: position.x,
    y: Math.max(position.y, safeGroundCenter),
    z: position.z,
  };
}

function worldPosition(coordinateX: number, y: number, coordinateZ: number): WorldPosition {
  const cellX = Math.floor((coordinateX + WORLD_CELL_SIZE_METERS / 2) / WORLD_CELL_SIZE_METERS);
  const cellZ = Math.floor((coordinateZ + WORLD_CELL_SIZE_METERS / 2) / WORLD_CELL_SIZE_METERS);
  return {
    cellX,
    cellZ,
    localX: coordinateX - cellX * WORLD_CELL_SIZE_METERS,
    y,
    localZ: coordinateZ - cellZ * WORLD_CELL_SIZE_METERS,
  };
}

function distanceSquared(left: Vec3, right: Vec3): number {
  const x = left.x - right.x;
  const y = left.y - right.y;
  const z = left.z - right.z;
  return x * x + y * y + z * z;
}

function eventId(eventType: DurableEvent['eventType'], entityId: string): string {
  return `${ARRIVAL_SLICE.id}:${eventType}:${entityId}`;
}

function encodePhysicsSnapshot(
  tick: number,
  position: Vec3,
  velocity: Vec3,
  grounded: boolean,
  crossingRaised: boolean,
): Uint8Array {
  const buffer = new ArrayBuffer(PHYSICS_SNAPSHOT_BYTE_LENGTH);
  const view = new DataView(buffer);
  view.setUint32(0, PHYSICS_SNAPSHOT_MAGIC, true);
  view.setUint16(4, 1, true);
  view.setUint32(8, tick, true);
  view.setFloat64(12, position.x, true);
  view.setFloat64(20, position.y, true);
  view.setFloat64(28, position.z, true);
  view.setFloat64(36, velocity.x, true);
  view.setFloat64(44, velocity.y, true);
  view.setFloat64(52, velocity.z, true);
  view.setUint8(60, grounded ? 1 : 0);
  view.setUint8(61, crossingRaised ? 1 : 0);
  return new Uint8Array(buffer);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export class GameSimulation {
  private world: RAPIER.World;
  private playerBody: RAPIER.RigidBody;
  private playerCollider: RAPIER.Collider;
  private crossingColliders: readonly RAPIER.Collider[];

  private tickValue = 0;
  private acknowledgedInputSequenceValue = 0;
  private currentInput: InputFrame = ZERO_INPUT;
  private previousButtons = 0;
  private yaw = 0;
  private groundedValue = true;
  private lastGroundedTick = 0;
  private jumpBufferedUntilTick = -1;
  private jumpConsumed = false;
  private bestArrivalTimeMs: number | undefined;
  private disposed = false;
  private objective: ObjectiveSnapshot = {
    arrivalChimeActivated: false,
    crossingRaised: false,
    loomAwakened: false,
    optionalVistaFound: false,
    collectedEchoShards: [],
    checkpoint: 'shore',
  };

  private constructor(options: GameSimulationOptions) {
    const initialPosition = playerCenterAt(
      options.initialPosition ?? ARRIVAL_SLICE_POSITIONS.arrivalSpawn,
    );
    const physics = createPhysicsWorld(initialPosition);
    this.world = physics.world;
    this.playerBody = physics.playerBody;
    this.playerCollider = physics.playerCollider;
    this.crossingColliders = physics.crossingColliders;
    this.groundedValue = false;
    this.lastGroundedTick = -COYOTE_TICKS - 1;
    this.updateGroundedState();
  }

  static create(options: GameSimulationOptions = {}): GameSimulation {
    return new GameSimulation(options);
  }

  get tick(): number {
    return this.tickValue;
  }

  get acknowledgedInputSequence(): number {
    return this.acknowledgedInputSequenceValue;
  }

  get grounded(): boolean {
    return this.groundedValue;
  }

  step(input?: InputFrame): SimulationStepResult {
    this.assertActive();
    if (input !== undefined) {
      validateInput(input);
      if (input.sequence >= this.acknowledgedInputSequenceValue) {
        this.currentInput = copyInput(input);
        this.acknowledgedInputSequenceValue = input.sequence;
      }
    }

    this.tickValue += 1;
    const events: DurableEvent[] = [];
    const buttons = this.currentInput.buttons;
    const jumpPressed =
      (buttons & InputButton.Jump) !== 0 && (this.previousButtons & InputButton.Jump) === 0;
    const interactPressed =
      (buttons & InputButton.Interact) !== 0 && (this.previousButtons & InputButton.Interact) === 0;

    if (jumpPressed) {
      this.jumpBufferedUntilTick = this.tickValue + JUMP_BUFFER_TICKS;
    }

    const desiredVelocity = this.desiredHorizontalVelocity();
    const currentVelocity = this.playerBody.linvel();
    let verticalVelocity = currentVelocity.y;
    const insideCoyoteWindow =
      this.groundedValue || this.tickValue - this.lastGroundedTick <= COYOTE_TICKS;

    if (!this.jumpConsumed && insideCoyoteWindow && this.tickValue <= this.jumpBufferedUntilTick) {
      verticalVelocity = JUMP_SPEED_METERS_PER_SECOND;
      this.jumpConsumed = true;
      this.groundedValue = false;
      this.jumpBufferedUntilTick = -1;
    }

    // Holding Jump after the apex opens the glide: the fall slows to a gentle
    // terminal speed and steering gains a forward push, so high routes become
    // rewarding launch pads instead of long drops.
    const jumpHeld = (buttons & InputButton.Jump) !== 0;
    const gliding =
      !this.groundedValue &&
      jumpHeld &&
      verticalVelocity < GLIDE_ENGAGE_FALL_SPEED_METERS_PER_SECOND;
    const steerBoost = gliding ? GLIDE_FORWARD_BOOST : 1;

    this.playerBody.setLinvel(
      {
        x: desiredVelocity.x * steerBoost,
        y: verticalVelocity,
        z: desiredVelocity.z * steerBoost,
      },
      true,
    );
    this.world.step();
    this.updateGroundedState();

    // The glide terminal speed is enforced on the post-step velocity so the
    // published snapshot never reports a faster fall than the glide allows.
    if (gliding && !this.groundedValue) {
      const settledVelocity = this.playerBody.linvel();
      if (settledVelocity.y < -GLIDE_TERMINAL_FALL_SPEED_METERS_PER_SECOND) {
        this.playerBody.setLinvel(
          {
            x: settledVelocity.x,
            y: -GLIDE_TERMINAL_FALL_SPEED_METERS_PER_SECOND,
            z: settledVelocity.z,
          },
          true,
        );
      }
    }

    if (this.isInsideCrossingFailureVolume()) {
      this.teleportTo(checkpointPosition(ARRIVAL_SLICE.content.crossing.failureRecoveryCheckpoint));
    } else if (this.isOutsideRecoverableBounds()) {
      this.respawn();
    }

    this.collectLocationEvents(events);
    if (interactPressed) {
      const interaction = this.nearestEligibleInteraction();
      if (interaction !== undefined) {
        events.push(...this.activateInteraction(interaction));
      }
    }

    this.previousButtons = buttons;
    return { snapshot: this.snapshot(), events };
  }

  interact(request: InteractionRequest): readonly DurableEvent[] {
    this.assertActive();
    if (
      !isUint32(request.sequence) ||
      !isUint32(request.intendedTick) ||
      request.targetEntityId.length === 0
    ) {
      throw new RangeError('Interaction request is malformed.');
    }

    const interaction = ARRIVAL_SLICE.interactions.find(
      ({ anchorId }) => anchorId === request.targetEntityId,
    );
    if (interaction === undefined || !this.isInteractionEligible(interaction)) {
      return [];
    }
    return this.activateInteraction(interaction);
  }

  snapshot(): SimulationSnapshot {
    this.assertActive();
    const translation = this.playerBody.translation();
    const velocity = this.playerBody.linvel();
    return {
      type: 'simulation-snapshot',
      tick: this.tickValue,
      acknowledgedInputSequence: this.acknowledgedInputSequenceValue,
      entities: [
        {
          entityId: PLAYER_ENTITY_ID,
          kind: 'player',
          position: worldPosition(translation.x, translation.y, translation.z),
          velocity: [velocity.x, velocity.y, velocity.z],
          yaw: this.yaw,
          grounded: this.groundedValue,
        },
      ],
      objective: copyObjective(this.objective),
    };
  }

  save(): ArrivalSliceSave {
    this.assertActive();
    const base = {
      schemaVersion: 1 as const,
      worldSeed: ARRIVAL_SLICE.seed,
      arrivalChimeActivated: this.objective.arrivalChimeActivated,
      loomAwakened: this.objective.loomAwakened,
      optionalVistaFound: this.objective.optionalVistaFound,
      collectedEchoShards: [...this.objective.collectedEchoShards],
      checkpoint: this.objective.checkpoint,
    };
    return this.bestArrivalTimeMs === undefined
      ? base
      : { ...base, bestArrivalTimeMs: this.bestArrivalTimeMs };
  }

  loadSave(candidate: unknown): SimulationSnapshot {
    this.assertActive();
    const result = ArrivalSliceSaveSchema.safeParse(candidate);
    if (!result.success) {
      throw new TypeError('Arrival slice save does not match schema version 1.');
    }
    if (result.data.worldSeed !== ARRIVAL_SLICE.seed) {
      throw new RangeError('Arrival slice save belongs to a different world seed.');
    }

    this.reset();
    this.objective = {
      arrivalChimeActivated: result.data.arrivalChimeActivated,
      crossingRaised: result.data.arrivalChimeActivated,
      loomAwakened: result.data.loomAwakened,
      optionalVistaFound: result.data.optionalVistaFound,
      collectedEchoShards: [...result.data.collectedEchoShards],
      checkpoint: result.data.checkpoint,
    };
    this.bestArrivalTimeMs = result.data.bestArrivalTimeMs;
    this.setCrossingRaised(this.objective.crossingRaised);
    this.teleportTo(checkpointPosition(this.objective.checkpoint));
    return this.snapshot();
  }

  reset(): SimulationSnapshot {
    this.assertActive();
    this.tickValue = 0;
    this.acknowledgedInputSequenceValue = 0;
    this.currentInput = ZERO_INPUT;
    this.previousButtons = 0;
    this.yaw = 0;
    this.groundedValue = true;
    this.lastGroundedTick = 0;
    this.jumpBufferedUntilTick = -1;
    this.jumpConsumed = false;
    this.bestArrivalTimeMs = undefined;
    this.objective = {
      arrivalChimeActivated: false,
      crossingRaised: false,
      loomAwakened: false,
      optionalVistaFound: false,
      collectedEchoShards: [],
      checkpoint: 'shore',
    };
    this.setCrossingRaised(false);
    this.teleportTo(checkpointPosition('shore'));
    return this.snapshot();
  }

  respawn(): SimulationSnapshot {
    this.assertActive();
    this.teleportTo(checkpointPosition(this.objective.checkpoint));
    return this.snapshot();
  }

  takeCheckpoint(): SimulationCheckpoint {
    this.assertActive();
    const playerPosition = { ...this.playerBody.translation() };
    const playerVelocity = { ...this.playerBody.linvel() };
    const checkpoint = {
      schemaVersion: 1 as const,
      worldId: ARRIVAL_SLICE.id,
      tick: this.tickValue,
      acknowledgedInputSequence: this.acknowledgedInputSequenceValue,
      physicsSnapshot: encodePhysicsSnapshot(
        this.tickValue,
        playerPosition,
        playerVelocity,
        this.groundedValue,
        this.objective.crossingRaised,
      ),
      playerPosition,
      playerVelocity,
      objective: copyObjective(this.objective),
      currentInput: copyInput(this.currentInput),
      previousButtons: this.previousButtons,
      yaw: this.yaw,
      grounded: this.groundedValue,
      lastGroundedTick: this.lastGroundedTick,
      jumpBufferedUntilTick: this.jumpBufferedUntilTick,
      jumpConsumed: this.jumpConsumed,
    };
    return this.bestArrivalTimeMs === undefined
      ? checkpoint
      : { ...checkpoint, bestArrivalTimeMs: this.bestArrivalTimeMs };
  }

  restoreCheckpoint(candidate: unknown): SimulationSnapshot {
    this.assertActive();
    const parsed = SimulationCheckpointSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new RangeError('Simulation checkpoint is incompatible or malformed.');
    }
    const checkpoint = parsed.data;

    const expectedPhysicsSnapshot = encodePhysicsSnapshot(
      checkpoint.tick,
      checkpoint.playerPosition,
      checkpoint.playerVelocity,
      checkpoint.grounded,
      checkpoint.objective.crossingRaised,
    );
    if (!bytesEqual(checkpoint.physicsSnapshot, expectedPhysicsSnapshot)) {
      throw new RangeError('Simulation checkpoint physics state is inconsistent.');
    }

    // This first slice has one dynamic body, so recovery rebuilds the immutable
    // terrain and restores its complete canonical state without depending on
    // runtime-specific WASM serialization or stale contact caches.
    const restored = createPhysicsWorld(checkpoint.playerPosition);
    restored.playerBody.setLinvel(checkpoint.playerVelocity, true);
    this.world.free();
    this.world = restored.world;
    this.playerBody = restored.playerBody;
    this.playerCollider = restored.playerCollider;
    this.crossingColliders = restored.crossingColliders;
    this.tickValue = checkpoint.tick;
    this.acknowledgedInputSequenceValue = checkpoint.acknowledgedInputSequence;
    this.currentInput = copyInput(checkpoint.currentInput);
    this.previousButtons = checkpoint.previousButtons;
    this.yaw = checkpoint.yaw;
    this.groundedValue = checkpoint.grounded;
    this.lastGroundedTick = checkpoint.lastGroundedTick;
    this.jumpBufferedUntilTick = checkpoint.jumpBufferedUntilTick;
    this.jumpConsumed = checkpoint.jumpConsumed;
    this.bestArrivalTimeMs = checkpoint.bestArrivalTimeMs;
    this.objective = copyObjective(checkpoint.objective);
    this.setCrossingRaised(this.objective.crossingRaised);
    return this.snapshot();
  }

  dispose(): void {
    if (!this.disposed) {
      this.world.free();
      this.disposed = true;
    }
  }

  private desiredHorizontalVelocity(): { readonly x: number; readonly z: number } {
    const magnitude = Math.hypot(this.currentInput.moveX, this.currentInput.moveZ);
    const normalizedX =
      magnitude > 1 ? this.currentInput.moveX / magnitude : this.currentInput.moveX;
    const normalizedZ =
      magnitude > 1 ? this.currentInput.moveZ / magnitude : this.currentInput.moveZ;
    const sprinting = (this.currentInput.buttons & InputButton.Sprint) !== 0;
    const speed = sprinting ? SPRINT_SPEED_METERS_PER_SECOND : RUN_SPEED_METERS_PER_SECOND;
    const cosine = Math.cos(this.currentInput.lookYaw);
    const sine = Math.sin(this.currentInput.lookYaw);
    const worldX = normalizedX * cosine - normalizedZ * sine;
    const worldZ = -normalizedX * sine - normalizedZ * cosine;
    if (magnitude > MOVEMENT_FACING_EPSILON) {
      this.yaw = Math.atan2(-worldX, -worldZ);
    }
    return {
      x: worldX * speed,
      z: worldZ * speed,
    };
  }

  private updateGroundedState(): void {
    const translation = this.playerBody.translation();
    const velocity = this.playerBody.linvel();
    const hit = this.world.castRay(
      new RAPIER.Ray(translation, { x: 0, y: -1, z: 0 }),
      PLAYER_STANDING_HALF_HEIGHT + GROUND_PROBE_PADDING,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      this.playerCollider,
      this.playerBody,
    );
    this.groundedValue =
      hit !== null &&
      hit.timeOfImpact <= PLAYER_STANDING_HALF_HEIGHT + GROUND_PROBE_PADDING &&
      velocity.y <= GROUND_MAX_UPWARD_SPEED;
    if (this.groundedValue) {
      this.lastGroundedTick = this.tickValue;
      this.jumpConsumed = false;
    }
  }

  private collectLocationEvents(events: DurableEvent[]): void {
    const position = this.playerBody.translation();
    if (
      !this.objective.optionalVistaFound &&
      distanceSquared(position, ARRIVAL_SLICE_POSITIONS.optionalVista) <=
        VISTA_RADIUS_METERS * VISTA_RADIUS_METERS
    ) {
      this.objective = { ...this.objective, optionalVistaFound: true };
      events.push(
        this.createEvent('optional-vista-found', ARRIVAL_SLICE_IDS.optionalVista, {
          optionalVistaFound: true,
        }),
      );
    }

    // Shards resonate in fixed definition order so concurrent pickups produce
    // deterministic event sequences across replays.
    for (const shard of ARRIVAL_ECHO_SHARDS) {
      if (this.objective.collectedEchoShards.includes(shard.key)) continue;
      if (
        distanceSquared(position, shard.position) >
        ECHO_SHARD_RADIUS_METERS * ECHO_SHARD_RADIUS_METERS
      ) {
        continue;
      }
      const collectedEchoShards = [...this.objective.collectedEchoShards, shard.key];
      this.objective = { ...this.objective, collectedEchoShards };
      events.push(
        this.createEvent('echo-shard-collected', shard.id, {
          echoShardKey: shard.key,
          collectedCount: collectedEchoShards.length,
        }),
      );
    }

    if (
      this.objective.checkpoint === 'shore' &&
      distanceSquared(position, ARRIVAL_SLICE_POSITIONS.revealRidge) <=
        CHECKPOINT_RADIUS_METERS * CHECKPOINT_RADIUS_METERS
    ) {
      this.objective = { ...this.objective, checkpoint: 'ridge' };
      events.push(
        this.createEvent('checkpoint-reached', ARRIVAL_SLICE_IDS.revealRidge, {
          checkpoint: 'ridge',
        }),
      );
    }
  }

  private nearestEligibleInteraction(): InteractionDescriptor | undefined {
    const eligible = ARRIVAL_SLICE.interactions.filter((interaction) =>
      this.isInteractionEligible(interaction),
    );
    eligible.sort((left, right) => {
      const position = this.playerBody.translation();
      const leftAnchor = ARRIVAL_SLICE.anchors.find(({ id }) => id === left.anchorId);
      const rightAnchor = ARRIVAL_SLICE.anchors.find(({ id }) => id === right.anchorId);
      const leftDistance =
        leftAnchor === undefined ? Infinity : distanceSquared(position, leftAnchor.position);
      const rightDistance =
        rightAnchor === undefined ? Infinity : distanceSquared(position, rightAnchor.position);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return left.anchorId < right.anchorId ? -1 : left.anchorId === right.anchorId ? 0 : 1;
    });
    return eligible[0];
  }

  private isInteractionEligible(interaction: InteractionDescriptor): boolean {
    if (
      interaction.persistentStateKey === 'loomAwakened' &&
      (!this.objective.arrivalChimeActivated ||
        this.objective.collectedEchoShards.length < ARRIVAL_ECHO_SHARDS.length)
    ) {
      return false;
    }
    if (
      (interaction.persistentStateKey === 'arrivalChimeActivated' &&
        this.objective.arrivalChimeActivated) ||
      (interaction.persistentStateKey === 'loomAwakened' && this.objective.loomAwakened)
    ) {
      return false;
    }
    const anchor = ARRIVAL_SLICE.anchors.find(({ id }) => id === interaction.anchorId);
    if (anchor === undefined) return false;
    return (
      distanceSquared(this.playerBody.translation(), anchor.position) <=
      interaction.radiusMeters * interaction.radiusMeters
    );
  }

  private activateInteraction(interaction: InteractionDescriptor): readonly DurableEvent[] {
    if (!this.isInteractionEligible(interaction)) return [];

    if (interaction.persistentStateKey === 'arrivalChimeActivated') {
      this.objective = {
        ...this.objective,
        arrivalChimeActivated: true,
        crossingRaised: true,
      };
      this.setCrossingRaised(true);
      return [
        this.createEvent('arrival-chime-activated', interaction.anchorId, {
          arrivalChimeActivated: true,
          crossingRaised: true,
        }),
      ];
    }

    if (interaction.persistentStateKey === 'loomAwakened') {
      this.objective = { ...this.objective, loomAwakened: true, checkpoint: 'loom' };
      this.bestArrivalTimeMs ??= Math.round(this.tickValue * FIXED_STEP_SECONDS * 1_000);
      return [
        this.createEvent('loom-awakened', interaction.anchorId, {
          loomAwakened: true,
        }),
        this.createEvent('checkpoint-reached', interaction.anchorId, {
          checkpoint: 'loom',
        }),
      ];
    }

    return [];
  }

  private createEvent(
    eventType: DurableEvent['eventType'],
    entityId: StableWorldId,
    payload: DurableEvent['payload'],
  ): DurableEvent {
    return {
      type: 'durable-event',
      tick: this.tickValue,
      eventId: eventId(eventType, entityId),
      eventType,
      entityId,
      payload,
    };
  }

  private setCrossingRaised(raised: boolean): void {
    for (const collider of this.crossingColliders) collider.setEnabled(raised);
  }

  private teleportTo(position: Vec3): void {
    const center = playerCenterAt(position);
    this.playerBody.setTranslation(center, true);
    this.playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.world.propagateModifiedBodyPositionsToColliders();
    this.currentInput = { ...ZERO_INPUT, sequence: this.acknowledgedInputSequenceValue };
    this.previousButtons = 0;
    this.groundedValue = true;
    this.lastGroundedTick = this.tickValue;
    this.jumpBufferedUntilTick = -1;
    this.jumpConsumed = false;
  }

  private isOutsideRecoverableBounds(): boolean {
    const position = this.playerBody.translation();
    const { min, max } = ARRIVAL_SLICE.playableBounds;
    return (
      position.x < min.x - RESPAWN_BOUNDS_PADDING_METERS ||
      position.x > max.x + RESPAWN_BOUNDS_PADDING_METERS ||
      position.y < min.y - RESPAWN_BOUNDS_PADDING_METERS ||
      position.z < min.z - RESPAWN_BOUNDS_PADDING_METERS ||
      position.z > max.z + RESPAWN_BOUNDS_PADDING_METERS
    );
  }

  private isInsideCrossingFailureVolume(): boolean {
    const position = this.playerBody.translation();
    return (
      position.x >= CROSSING_RECOVERY_BOUNDS.minX &&
      position.x <= CROSSING_RECOVERY_BOUNDS.maxX &&
      position.y < CROSSING_RECOVERY_BOUNDS.maxY &&
      position.z >= CROSSING_RECOVERY_BOUNDS.minZ &&
      position.z <= CROSSING_RECOVERY_BOUNDS.maxZ
    );
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('GameSimulation has been disposed.');
  }
}

export { FIXED_TICK_RATE };
