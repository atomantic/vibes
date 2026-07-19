import { InputButton, ObjectiveSnapshotSchema } from '@vibes/protocol';
import { ARRIVAL_SLICE } from '@vibes/world';
import { z } from 'zod';

import { COYOTE_TICKS, JUMP_BUFFER_TICKS } from './simulationConstants.js';

const UINT32_MAX = 0xffff_ffff;
const KNOWN_INPUT_BUTTONS =
  InputButton.Jump | InputButton.Sprint | InputButton.Interact | InputButton.RecenterCamera;
const uint32Schema = z.number().int().nonnegative().max(UINT32_MAX);
const buttonMaskSchema = z
  .number()
  .int()
  .nonnegative()
  .refine((buttons) => (buttons & ~KNOWN_INPUT_BUTTONS) === 0, 'Unsupported input button bit.');
const vec3Schema = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  })
  .strict();
const inputFrameSchema = z
  .object({
    sequence: uint32Schema,
    intendedTick: uint32Schema,
    moveX: z.number().min(-1).max(1),
    moveZ: z.number().min(-1).max(1),
    lookYaw: z.number().min(-Math.PI).max(Math.PI),
    lookPitch: z
      .number()
      .min(-Math.PI / 2)
      .max(Math.PI / 2),
    buttons: buttonMaskSchema,
  })
  .strict();

export const SimulationCheckpointSchema = z
  .object({
    schemaVersion: z.literal(1),
    worldId: z.literal(ARRIVAL_SLICE.id),
    tick: uint32Schema,
    acknowledgedInputSequence: uint32Schema,
    physicsSnapshot: z
      .instanceof(Uint8Array)
      .refine((snapshot) => snapshot.byteLength === 64, 'Physics snapshot must be 64 bytes.'),
    playerPosition: vec3Schema,
    playerVelocity: vec3Schema,
    objective: ObjectiveSnapshotSchema,
    currentInput: inputFrameSchema,
    previousButtons: buttonMaskSchema,
    yaw: z.number().min(-Math.PI).max(Math.PI),
    grounded: z.boolean(),
    lastGroundedTick: z
      .number()
      .int()
      .min(-COYOTE_TICKS - 1),
    jumpBufferedUntilTick: z.number().int().min(-1),
    jumpConsumed: z.boolean(),
    bestArrivalTimeMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict()
  .superRefine((checkpoint, context) => {
    if (checkpoint.currentInput.sequence > checkpoint.acknowledgedInputSequence) {
      context.addIssue({
        code: 'custom',
        path: ['currentInput', 'sequence'],
        message: 'Current input cannot be newer than its acknowledgement.',
      });
    }
    if (checkpoint.lastGroundedTick > checkpoint.tick) {
      context.addIssue({
        code: 'custom',
        path: ['lastGroundedTick'],
        message: 'Last grounded tick cannot be in the future.',
      });
    }
    if (checkpoint.jumpBufferedUntilTick > checkpoint.tick + JUMP_BUFFER_TICKS) {
      context.addIssue({
        code: 'custom',
        path: ['jumpBufferedUntilTick'],
        message: 'Jump buffer extends beyond the supported window.',
      });
    }
    if (checkpoint.objective.crossingRaised !== checkpoint.objective.arrivalChimeActivated) {
      context.addIssue({
        code: 'custom',
        path: ['objective', 'crossingRaised'],
        message: 'Crossing state must match the Arrival Chime state.',
      });
    }
    if (
      checkpoint.objective.loomAwakened !== (checkpoint.objective.checkpoint === 'loom') ||
      (checkpoint.objective.loomAwakened && !checkpoint.objective.arrivalChimeActivated)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['objective', 'loomAwakened'],
        message: 'Loom state violates the Arrival progression.',
      });
    }
    if (checkpoint.bestArrivalTimeMs !== undefined && !checkpoint.objective.loomAwakened) {
      context.addIssue({
        code: 'custom',
        path: ['bestArrivalTimeMs'],
        message: 'An arrival time requires a completed Loom objective.',
      });
    }
  });
