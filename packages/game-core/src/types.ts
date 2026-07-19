import type {
  ArrivalSliceSave,
  DurableEvent,
  InputFrame,
  ObjectiveSnapshot,
  SimulationSnapshot,
} from '@vibes/protocol';
import type { Vec3 } from '@vibes/world';

export type ArrivalCheckpoint = ObjectiveSnapshot['checkpoint'];

export interface GameSimulationOptions {
  /** Diagnostic override used by deterministic slices and tests. */
  readonly initialPosition?: Vec3;
}

export interface SimulationStepResult {
  readonly snapshot: SimulationSnapshot;
  readonly events: readonly DurableEvent[];
}

export interface SimulationCheckpoint {
  readonly schemaVersion: 1;
  readonly worldId: string;
  readonly tick: number;
  readonly acknowledgedInputSequence: number;
  readonly physicsSnapshot: Uint8Array;
  readonly playerPosition: Vec3;
  readonly playerVelocity: Vec3;
  readonly objective: ObjectiveSnapshot;
  readonly currentInput: InputFrame;
  readonly previousButtons: number;
  readonly yaw: number;
  readonly grounded: boolean;
  readonly lastGroundedTick: number;
  readonly jumpBufferedUntilTick: number;
  readonly jumpConsumed: boolean;
  readonly bestArrivalTimeMs?: number;
}

export type { ArrivalSliceSave };
