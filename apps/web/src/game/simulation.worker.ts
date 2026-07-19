/// <reference lib="webworker" />

import { FIXED_TICK_RATE, GameSimulation } from '@vibes/game-core';
import {
  PROTOCOL_VERSION,
  decodeInputFrame,
  type ClientToWorkerMessage,
  type InputFrame,
  type SimulationError,
  type WorkerToClientMessage,
} from '@vibes/protocol';
import { ARRIVAL_SLICE_DEFINITION } from '@vibes/world';

const worker = self as DedicatedWorkerGlobalScope;

let simulation: GameSimulation | null = null;
let paused = true;
let latestInput: InputFrame = {
  sequence: 0,
  intendedTick: 0,
  moveX: 0,
  moveZ: 0,
  lookYaw: 0,
  lookPitch: -0.24,
  buttons: 0,
};

function post(message: WorkerToClientMessage): void {
  worker.postMessage(message);
}

function reportError(code: SimulationError['code'], error: unknown, recoverable: boolean): void {
  post({
    type: 'simulation-error',
    code,
    message: error instanceof Error ? error.message : String(error),
    recoverable,
  });
}

function postSnapshot(): void {
  if (simulation !== null) post(simulation.snapshot());
}

worker.addEventListener('message', (event: MessageEvent<ClientToWorkerMessage>) => {
  if (simulation === null) return;

  try {
    const message = event.data;
    switch (message.type) {
      case 'input-frame':
        latestInput = decodeInputFrame(message.payload);
        break;
      case 'interaction': {
        const events = simulation.interact(message.request);
        events.forEach(post);
        postSnapshot();
        break;
      }
      case 'load-save':
        simulation.loadSave(message.save);
        postSnapshot();
        break;
      case 'set-paused':
        paused = message.paused;
        break;
      case 'reset-world':
        simulation.reset();
        latestInput = { ...latestInput, buttons: 0, moveX: 0, moveZ: 0 };
        postSnapshot();
        break;
    }
  } catch (error) {
    reportError('invalid-input', error, true);
  }
});

function start(): void {
  try {
    simulation = GameSimulation.create();
    post({
      type: 'simulation-ready',
      protocolMajor: PROTOCOL_VERSION.major,
      protocolMinor: PROTOCOL_VERSION.minor,
      worldId: ARRIVAL_SLICE_DEFINITION.id,
      worldSeed: ARRIVAL_SLICE_DEFINITION.seed,
      tickRate: FIXED_TICK_RATE,
    });

    worker.setInterval(() => {
      if (simulation === null || paused) return;
      try {
        const result = simulation.step(latestInput);
        result.events.forEach(post);
        if (result.snapshot.tick % 2 === 0) post(result.snapshot);
      } catch (error) {
        reportError('simulation-failed', error, false);
        paused = true;
      }
    }, 1000 / FIXED_TICK_RATE);
  } catch (error) {
    reportError('initialization-failed', error, false);
  }
}

start();
