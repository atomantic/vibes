export const InputButton = {
  Jump: 1 << 0,
  Sprint: 1 << 1,
  Interact: 1 << 2,
  RecenterCamera: 1 << 3,
} as const;

export type InputButtonMask = number;

export interface InputFrame {
  readonly sequence: number;
  readonly intendedTick: number;
  /** Camera-local horizontal axis: -1 left, +1 right. */
  readonly moveX: number;
  /** Camera-local depth axis: -1 backward, +1 forward. */
  readonly moveZ: number;
  /** Ground-plane camera orbit angle used to resolve movement into world space. */
  readonly lookYaw: number;
  readonly lookPitch: number;
  readonly buttons: InputButtonMask;
}

export interface WorldPosition {
  readonly cellX: number;
  readonly cellZ: number;
  readonly localX: number;
  readonly y: number;
  readonly localZ: number;
}

export interface EntitySnapshot {
  readonly entityId: string;
  readonly kind: 'player';
  readonly position: WorldPosition;
  readonly velocity: readonly [number, number, number];
  readonly yaw: number;
  readonly grounded: boolean;
}

export interface ObjectiveSnapshot {
  readonly arrivalChimeActivated: boolean;
  readonly crossingRaised: boolean;
  readonly loomAwakened: boolean;
  readonly optionalVistaFound: boolean;
  readonly checkpoint: 'shore' | 'ridge' | 'loom';
}

export interface SimulationReady {
  readonly type: 'simulation-ready';
  readonly protocolMajor: number;
  readonly protocolMinor: number;
  readonly worldId: string;
  readonly worldSeed: number;
  readonly tickRate: number;
}

export interface SimulationSnapshot {
  readonly type: 'simulation-snapshot';
  readonly tick: number;
  readonly acknowledgedInputSequence: number;
  readonly entities: readonly EntitySnapshot[];
  readonly objective: ObjectiveSnapshot;
}

export interface InteractionRequest {
  readonly type: 'interaction-request';
  readonly sequence: number;
  readonly intendedTick: number;
  readonly targetEntityId: string;
}

export interface DurableEvent {
  readonly type: 'durable-event';
  readonly tick: number;
  readonly eventId: string;
  readonly eventType:
    'arrival-chime-activated' | 'loom-awakened' | 'optional-vista-found' | 'checkpoint-reached';
  readonly entityId: string;
  readonly payload: Readonly<Record<string, string | number | boolean>>;
}

export interface SimulationError {
  readonly type: 'simulation-error';
  readonly code:
    'invalid-input' | 'protocol-mismatch' | 'initialization-failed' | 'simulation-failed';
  readonly message: string;
  readonly recoverable: boolean;
}

export type WorkerToClientMessage =
  SimulationReady | SimulationSnapshot | DurableEvent | SimulationError;

export type ClientToWorkerMessage =
  | { readonly type: 'input-frame'; readonly payload: ArrayBuffer }
  | { readonly type: 'interaction'; readonly request: InteractionRequest }
  | { readonly type: 'load-save'; readonly save: unknown }
  | { readonly type: 'set-paused'; readonly paused: boolean }
  | { readonly type: 'reset-world' };
