import { z } from 'zod';

export const WorldPositionSchema = z
  .object({
    cellX: z.number().int().min(-32_768).max(32_767),
    cellZ: z.number().int().min(-32_768).max(32_767),
    localX: z.number().min(-32).max(32),
    y: z.number().min(-4_096).max(4_096),
    localZ: z.number().min(-32).max(32),
  })
  .strict();

export const ObjectiveSnapshotSchema = z
  .object({
    arrivalChimeActivated: z.boolean(),
    crossingRaised: z.boolean(),
    loomAwakened: z.boolean(),
    optionalVistaFound: z.boolean(),
    checkpoint: z.enum(['shore', 'ridge', 'loom']),
  })
  .strict()
  .superRefine((objective, context) => {
    if (objective.crossingRaised !== objective.arrivalChimeActivated) {
      context.addIssue({
        code: 'custom',
        path: ['crossingRaised'],
        message: 'Crossing state must match the Arrival Chime state.',
      });
    }
    if (
      objective.loomAwakened !== (objective.checkpoint === 'loom') ||
      (objective.loomAwakened && !objective.arrivalChimeActivated)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['loomAwakened'],
        message: 'Loom state violates the Arrival progression.',
      });
    }
  });

export const EntitySnapshotSchema = z
  .object({
    entityId: z.string().min(1).max(96),
    kind: z.literal('player'),
    position: WorldPositionSchema,
    velocity: z.tuple([z.number(), z.number(), z.number()]),
    yaw: z.number().min(-Math.PI).max(Math.PI),
    grounded: z.boolean(),
  })
  .strict();

export const SimulationSnapshotSchema = z
  .object({
    type: z.literal('simulation-snapshot'),
    tick: z.number().int().nonnegative().max(0xffff_ffff),
    acknowledgedInputSequence: z.number().int().nonnegative().max(0xffff_ffff),
    entities: z.array(EntitySnapshotSchema).max(64),
    objective: ObjectiveSnapshotSchema,
  })
  .strict();

export const ArrivalSliceSaveSchema = z
  .object({
    schemaVersion: z.literal(1),
    worldSeed: z.number().int().nonnegative().max(0xffff_ffff),
    arrivalChimeActivated: z.boolean(),
    loomAwakened: z.boolean(),
    optionalVistaFound: z.boolean(),
    checkpoint: z.enum(['shore', 'ridge', 'loom']),
    bestArrivalTimeMs: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((save, context) => {
    if (save.loomAwakened && !save.arrivalChimeActivated) {
      context.addIssue({
        code: 'custom',
        path: ['loomAwakened'],
        message: 'The Arrival Chime must be active before the Loom can awaken.',
      });
    }
    if (save.loomAwakened !== (save.checkpoint === 'loom')) {
      context.addIssue({
        code: 'custom',
        path: ['checkpoint'],
        message: 'The Loom checkpoint must match Loom completion.',
      });
    }
    if (save.bestArrivalTimeMs !== undefined && !save.loomAwakened) {
      context.addIssue({
        code: 'custom',
        path: ['bestArrivalTimeMs'],
        message: 'An arrival time requires a completed Loom objective.',
      });
    }
  });

export type ArrivalSliceSave = z.infer<typeof ArrivalSliceSaveSchema>;
