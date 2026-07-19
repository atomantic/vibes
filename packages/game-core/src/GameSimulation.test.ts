import { describe, expect, it } from 'vitest';

import { InputButton } from '@vibes/protocol';
import type { InputFrame, InteractionRequest } from '@vibes/protocol';
import { ARRIVAL_SLICE_POSITIONS, ARRIVAL_SLICE_SEED } from '@vibes/world';

import { FIXED_TICK_RATE, GameSimulation, JUMP_SPEED_METERS_PER_SECOND } from './index.js';

function frame(
  sequence: number,
  overrides: Partial<Omit<InputFrame, 'sequence' | 'intendedTick'>> = {},
): InputFrame {
  return {
    sequence,
    intendedTick: sequence,
    moveX: 0,
    moveZ: 0,
    lookYaw: 0,
    lookPitch: 0,
    buttons: 0,
    ...overrides,
  };
}

function playerPosition(simulation: GameSimulation): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} {
  const position = simulation.snapshot().entities[0]?.position;
  if (position === undefined) throw new Error('Player snapshot is missing.');
  return {
    x: position.cellX * 64 + position.localX,
    y: position.y,
    z: position.cellZ * 64 + position.localZ,
  };
}

describe('GameSimulation', () => {
  it('advances a dynamic capsule at a fixed 30 Hz', () => {
    const simulation = GameSimulation.create();
    try {
      const initial = playerPosition(simulation);
      for (let sequence = 1; sequence <= FIXED_TICK_RATE * 2; sequence += 1) {
        simulation.step(
          frame(sequence, {
            moveZ: 1,
            buttons: InputButton.Sprint,
          }),
        );
      }

      const moved = playerPosition(simulation);
      expect(simulation.tick).toBe(60);
      expect(moved.z).toBeLessThan(initial.z - 8);
      expect(Number.isFinite(moved.y)).toBe(true);
    } finally {
      simulation.dispose();
    }
  });

  it('does not allow a second jump while airborne', () => {
    const simulation = GameSimulation.create();
    try {
      for (let sequence = 1; sequence <= 8; sequence += 1) {
        simulation.step(frame(sequence));
      }
      const firstJump = simulation.step(frame(9, { buttons: InputButton.Jump }));
      const released = simulation.step(frame(10));
      const secondPress = simulation.step(frame(11, { buttons: InputButton.Jump }));
      const firstVelocity = firstJump.snapshot.entities[0]?.velocity[1];
      const releasedVelocity = released.snapshot.entities[0]?.velocity[1];
      const secondVelocity = secondPress.snapshot.entities[0]?.velocity[1];

      expect(firstVelocity).toBeDefined();
      expect(releasedVelocity).toBeDefined();
      expect(secondVelocity).toBeDefined();
      expect(firstVelocity).toBeLessThanOrEqual(JUMP_SPEED_METERS_PER_SECOND);
      expect(releasedVelocity).toBeLessThan(firstVelocity ?? Infinity);
      expect(secondVelocity).toBeLessThan(releasedVelocity ?? Infinity);
      expect(secondVelocity).toBeLessThan(JUMP_SPEED_METERS_PER_SECOND - 1);
    } finally {
      simulation.dispose();
    }
  });

  it('buffers a jump pressed just before landing', () => {
    const simulation = GameSimulation.create({
      initialPosition: { ...ARRIVAL_SLICE_POSITIONS.arrivalSpawn, y: 4 },
    });
    try {
      for (let sequence = 1; sequence <= 10; sequence += 1) {
        simulation.step(frame(sequence));
      }
      expect(simulation.grounded).toBe(false);

      const queued = simulation.step(frame(11, { buttons: InputButton.Jump }));
      expect(queued.snapshot.entities[0]?.velocity[1]).toBeLessThanOrEqual(0);
      let launchedVelocity = Number.NEGATIVE_INFINITY;
      for (let sequence = 12; sequence <= 15; sequence += 1) {
        launchedVelocity =
          simulation.step(frame(sequence, { buttons: InputButton.Jump })).snapshot.entities[0]
            ?.velocity[1] ?? Number.NEGATIVE_INFINITY;
        if (launchedVelocity > 0) break;
      }
      expect(launchedVelocity).toBeGreaterThan(0);
    } finally {
      simulation.dispose();
    }
  });

  it('edge-detects the chime and emits one stable crossing event', () => {
    const simulation = GameSimulation.create({
      initialPosition: ARRIVAL_SLICE_POSITIONS.arrivalChime,
    });
    try {
      simulation.step(frame(1));
      const activated = simulation.step(frame(2, { buttons: InputButton.Interact }));
      const held = simulation.step(frame(3, { buttons: InputButton.Interact }));
      simulation.step(frame(4));
      const pressedAgain = simulation.step(frame(5, { buttons: InputButton.Interact }));

      expect(activated.snapshot.objective).toMatchObject({
        arrivalChimeActivated: true,
        crossingRaised: true,
      });
      expect(activated.events).toHaveLength(1);
      expect(activated.events[0]).toMatchObject({
        eventType: 'arrival-chime-activated',
        entityId: 'interaction.arrival-chime',
      });
      expect(held.events).toEqual([]);
      expect(pressedAgain.events).toEqual([]);
    } finally {
      simulation.dispose();
    }
  });

  it('awakens the Loom, advances its checkpoint, and produces a round-trippable save', () => {
    const locked = GameSimulation.create({ initialPosition: ARRIVAL_SLICE_POSITIONS.loom });
    try {
      expect(locked.step(frame(1, { buttons: InputButton.Interact })).events).toEqual([]);
    } finally {
      locked.dispose();
    }

    const simulation = GameSimulation.create();
    try {
      simulation.loadSave({
        schemaVersion: 1,
        worldSeed: ARRIVAL_SLICE_SEED,
        arrivalChimeActivated: true,
        loomAwakened: false,
        optionalVistaFound: false,
        checkpoint: 'ridge',
      });
      let sequence = 1;
      while (sequence <= FIXED_TICK_RATE * 12) {
        const position = playerPosition(simulation);
        if (Math.hypot(position.x, position.z) < 1.5) break;
        const jumpPulse = simulation.grounded ? InputButton.Jump : 0;
        simulation.step(
          frame(sequence, {
            moveZ: 1,
            buttons: InputButton.Sprint | jumpPulse,
          }),
        );
        sequence += 1;
      }
      simulation.step(frame(sequence));
      sequence += 1;
      const result = simulation.step(frame(sequence, { buttons: InputButton.Interact }));
      const save = simulation.save();

      expect(result.events.map(({ eventType }) => eventType)).toEqual([
        'loom-awakened',
        'checkpoint-reached',
      ]);
      expect(save).toMatchObject({
        schemaVersion: 1,
        worldSeed: ARRIVAL_SLICE_SEED,
        loomAwakened: true,
        checkpoint: 'loom',
      });

      const restored = GameSimulation.create();
      try {
        const restoredSnapshot = restored.loadSave(save);
        expect(restoredSnapshot.objective.loomAwakened).toBe(true);
        expect(restoredSnapshot.objective.checkpoint).toBe('loom');
        restored.reset();
        expect(restored.snapshot().objective).toMatchObject({
          arrivalChimeActivated: false,
          loomAwakened: false,
          checkpoint: 'shore',
        });
      } finally {
        restored.dispose();
      }
    } finally {
      simulation.dispose();
    }
  });

  it('records the ridge checkpoint once and respawns there', () => {
    const simulation = GameSimulation.create({
      initialPosition: ARRIVAL_SLICE_POSITIONS.revealRidge,
    });
    try {
      const reached = simulation.step(frame(1));
      const repeated = simulation.step(frame(2));
      expect(reached.events).toEqual([
        expect.objectContaining({
          eventType: 'checkpoint-reached',
          entityId: 'checkpoint.arrival-shore.reveal-ridge',
        }),
      ]);
      expect(repeated.events).toEqual([]);
      expect(simulation.save().checkpoint).toBe('ridge');

      for (let sequence = 3; sequence <= 18; sequence += 1) {
        simulation.step(frame(sequence, { moveX: 1 }));
      }
      simulation.respawn();
      const respawned = playerPosition(simulation);
      expect(respawned.x).toBeCloseTo(ARRIVAL_SLICE_POSITIONS.revealRidge.x, 5);
      expect(respawned.z).toBeCloseTo(ARRIVAL_SLICE_POSITIONS.revealRidge.z, 5);
    } finally {
      simulation.dispose();
    }
  });

  it('restores a canonical physics checkpoint and deterministic continuation', () => {
    const first = GameSimulation.create();
    const second = GameSimulation.create();
    try {
      for (let sequence = 1; sequence <= 45; sequence += 1) {
        const input = frame(sequence, {
          moveX: sequence < 18 ? 0.35 : -0.2,
          moveZ: 0.8,
          buttons:
            (sequence === 12 ? InputButton.Jump : 0) | (sequence > 20 ? InputButton.Sprint : 0),
        });
        first.step(input);
        second.step(input);
      }

      const checkpoint = first.takeCheckpoint();
      expect(second.takeCheckpoint().physicsSnapshot).toEqual(checkpoint.physicsSnapshot);

      for (let sequence = 46; sequence <= 75; sequence += 1) {
        first.step(frame(sequence, { moveZ: 1 }));
      }
      first.restoreCheckpoint(checkpoint);
      second.restoreCheckpoint(checkpoint);

      for (let sequence = 46; sequence <= 90; sequence += 1) {
        const input = frame(sequence, { moveX: 0.1, moveZ: 0.9 });
        first.step(input);
        second.step(input);
      }

      expect(first.snapshot()).toEqual(second.snapshot());
      expect(first.takeCheckpoint().physicsSnapshot).toEqual(
        second.takeCheckpoint().physicsSnapshot,
      );
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  it('rejects invalid input and incompatible saves', () => {
    const simulation = GameSimulation.create();
    try {
      expect(() => simulation.step(frame(1, { moveX: Number.NaN }))).toThrow(RangeError);
      expect(() =>
        simulation.loadSave({
          schemaVersion: 1,
          worldSeed: ARRIVAL_SLICE_SEED + 1,
          arrivalChimeActivated: false,
          loomAwakened: false,
          optionalVistaFound: false,
          checkpoint: 'shore',
        }),
      ).toThrow(RangeError);
    } finally {
      simulation.dispose();
    }
  });

  it.each([
    ['negative sequence', { ...frame(1), sequence: -1 }],
    ['oversized intended tick', { ...frame(1), intendedTick: 0x1_0000_0000 }],
    ['non-finite movement', frame(1, { moveZ: Number.POSITIVE_INFINITY })],
    ['out-of-range movement', frame(1, { moveX: -1.01 })],
    ['non-finite yaw', frame(1, { lookYaw: Number.NaN })],
    ['out-of-range pitch', frame(1, { lookPitch: Math.PI })],
    ['fractional buttons', frame(1, { buttons: 0.5 })],
    ['negative buttons', frame(1, { buttons: -1 })],
    ['unknown button bit', frame(1, { buttons: 1 << 12 })],
  ] satisfies readonly (readonly [string, InputFrame])[])(
    'rejects %s at the simulation boundary',
    (_label, invalidInput) => {
      const simulation = GameSimulation.create();
      try {
        expect(() => simulation.step(invalidInput)).toThrow(RangeError);
        expect(simulation.tick).toBe(0);
      } finally {
        simulation.dispose();
      }
    },
  );

  it('validates explicit interactions without corrupting input acknowledgement', () => {
    const simulation = GameSimulation.create({
      initialPosition: ARRIVAL_SLICE_POSITIONS.arrivalChime,
    });
    const request: InteractionRequest = {
      type: 'interaction-request',
      sequence: 7,
      intendedTick: 1,
      targetEntityId: 'interaction.arrival-chime',
    };
    try {
      expect(() => simulation.interact({ ...request, sequence: -1 })).toThrow(RangeError);
      expect(() => simulation.interact({ ...request, targetEntityId: '' })).toThrow(RangeError);
      expect(simulation.interact({ ...request, targetEntityId: 'interaction.missing' })).toEqual(
        [],
      );

      const events = simulation.interact(request);
      expect(events).toEqual([expect.objectContaining({ eventType: 'arrival-chime-activated' })]);
      expect(simulation.acknowledgedInputSequence).toBe(0);
      expect(simulation.interact({ ...request, sequence: 8 })).toEqual([]);
    } finally {
      simulation.dispose();
    }

    const distant = GameSimulation.create();
    try {
      expect(distant.interact({ ...request, sequence: 0xffff_ffff })).toEqual([]);
      const before = playerPosition(distant);
      distant.step(frame(1, { moveZ: 1 }));
      expect(distant.acknowledgedInputSequence).toBe(1);
      expect(playerPosition(distant).z).toBeLessThan(before.z);
    } finally {
      distant.dispose();
    }
  });

  it('emits the vista event, accepts an omitted input, and recovers out of bounds', () => {
    const vista = GameSimulation.create({
      initialPosition: ARRIVAL_SLICE_POSITIONS.optionalVista,
    });
    try {
      const result = vista.step();
      expect(result.events).toEqual([
        expect.objectContaining({ eventType: 'optional-vista-found' }),
      ]);
      expect(result.snapshot.objective.optionalVistaFound).toBe(true);
    } finally {
      vista.dispose();
    }

    const outside = GameSimulation.create({ initialPosition: { x: 100, y: 2, z: 112 } });
    try {
      outside.step(frame(1, { moveX: 1, moveZ: 1 }));
      expect(playerPosition(outside).x).toBeCloseTo(ARRIVAL_SLICE_POSITIONS.arrivalSpawn.x, 5);
      expect(outside.snapshot().objective.checkpoint).toBe('shore');
    } finally {
      outside.dispose();
    }
  });

  it('recovers a crossing fall at the declared ridge checkpoint', () => {
    const simulation = GameSimulation.create({ initialPosition: { x: 0, y: 6, z: 25.5 } });
    try {
      const result = simulation.step(frame(1));
      const recovered = playerPosition(simulation);
      expect(recovered.x).toBeCloseTo(ARRIVAL_SLICE_POSITIONS.revealRidge.x, 5);
      expect(recovered.z).toBeCloseTo(ARRIVAL_SLICE_POSITIONS.revealRidge.z, 5);
      expect(result.events).toEqual([
        expect.objectContaining({
          eventType: 'checkpoint-reached',
          entityId: 'checkpoint.arrival-shore.reveal-ridge',
        }),
      ]);
    } finally {
      simulation.dispose();
    }
  });

  it('can traverse the raised crossing with standard sprint and jump input', () => {
    const simulation = GameSimulation.create();
    try {
      simulation.loadSave({
        schemaVersion: 1,
        worldSeed: ARRIVAL_SLICE_SEED,
        arrivalChimeActivated: true,
        loomAwakened: false,
        optionalVistaFound: false,
        checkpoint: 'ridge',
      });

      let crossed = false;
      let minimumZ = Number.POSITIVE_INFINITY;
      for (let sequence = 1; sequence <= FIXED_TICK_RATE * 10; sequence += 1) {
        const jumpPulse = simulation.grounded ? InputButton.Jump : 0;
        simulation.step(
          frame(sequence, {
            moveZ: 1,
            buttons: InputButton.Sprint | jumpPulse,
          }),
        );
        const position = playerPosition(simulation);
        minimumZ = Math.min(minimumZ, position.z);
        if (position.z < 15) {
          crossed = true;
          break;
        }
      }

      expect(
        crossed,
        `minimum z ${minimumZ.toFixed(3)}, final ${JSON.stringify(playerPosition(simulation))}`,
      ).toBe(true);
    } finally {
      simulation.dispose();
    }
  });

  it('rejects malformed save envelopes before changing the world', () => {
    const simulation = GameSimulation.create();
    try {
      expect(() => simulation.loadSave({})).toThrow(TypeError);
      expect(simulation.tick).toBe(0);

      const snapshot = simulation.loadSave({
        schemaVersion: 1,
        worldSeed: ARRIVAL_SLICE_SEED,
        arrivalChimeActivated: true,
        loomAwakened: true,
        optionalVistaFound: true,
        checkpoint: 'loom',
        bestArrivalTimeMs: 12_345,
      });
      expect(snapshot.objective).toMatchObject({
        arrivalChimeActivated: true,
        crossingRaised: true,
        loomAwakened: true,
        optionalVistaFound: true,
        checkpoint: 'loom',
      });
      expect(simulation.save().bestArrivalTimeMs).toBe(12_345);
    } finally {
      simulation.dispose();
    }
  });

  it('rejects incompatible and tampered simulation checkpoints', () => {
    const simulation = GameSimulation.create();
    try {
      simulation.step(frame(1));
      const checkpoint = simulation.takeCheckpoint();
      const corruptedBytes = checkpoint.physicsSnapshot.slice();
      corruptedBytes[12] = (corruptedBytes[12] ?? 0) ^ 0xff;

      const invalidCheckpoints = [
        { ...checkpoint, schemaVersion: 2 },
        { ...checkpoint, worldId: 'world.other' },
        { ...checkpoint, physicsSnapshot: new Uint8Array() },
        { ...checkpoint, tick: -1 },
        { ...checkpoint, acknowledgedInputSequence: 0x1_0000_0000 },
        { ...checkpoint, currentInput: frame(1, { lookYaw: Number.NaN }) },
        { ...checkpoint, yaw: Number.NaN },
        { ...checkpoint, previousButtons: 1 << 12 },
        {
          ...checkpoint,
          objective: { ...checkpoint.objective, crossingRaised: true },
        },
        { ...checkpoint, bestArrivalTimeMs: 100 },
        {
          ...checkpoint,
          playerPosition: { ...checkpoint.playerPosition, x: Number.NaN },
        },
        {
          ...checkpoint,
          playerVelocity: { ...checkpoint.playerVelocity, z: Number.POSITIVE_INFINITY },
        },
        { ...checkpoint, physicsSnapshot: checkpoint.physicsSnapshot.slice(1) },
        { ...checkpoint, physicsSnapshot: corruptedBytes },
      ];

      for (const invalid of invalidCheckpoints) {
        expect(() => simulation.restoreCheckpoint(invalid)).toThrow(RangeError);
      }
    } finally {
      simulation.dispose();
    }
  });

  it('makes disposal idempotent and rejects later use', () => {
    const simulation = GameSimulation.create();
    simulation.dispose();
    expect(() => {
      simulation.dispose();
    }).not.toThrow();
    expect(() => simulation.snapshot()).toThrow('GameSimulation has been disposed.');
    expect(() => simulation.step(frame(1))).toThrow('GameSimulation has been disposed.');
  });
});
