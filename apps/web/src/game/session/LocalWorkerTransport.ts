import {
  SimulationSnapshotSchema,
  encodeInputFrame,
  type ArrivalSliceSave,
  type ClientToWorkerMessage,
  type InputFrame,
  type SimulationError,
  type SimulationReady,
  type SimulationSnapshot,
  type WorkerToClientMessage,
} from '@vibes/protocol';

import type {
  AuthorityEventName,
  AuthorityTransport,
  AuthorityTransportEvents,
} from './AuthorityTransport';

type ListenerMap = {
  [EventName in AuthorityEventName]: Set<(payload: AuthorityTransportEvents[EventName]) => void>;
};

function isReady(message: WorkerToClientMessage): message is SimulationReady {
  return message.type === 'simulation-ready';
}

export class LocalWorkerTransport implements AuthorityTransport {
  readonly #worker = new Worker(new URL('../simulation.worker.ts', import.meta.url), {
    type: 'module',
    name: 'vibes-local-authority',
  });

  readonly #listeners: ListenerMap = {
    ready: new Set(),
    snapshot: new Set(),
    durableEvent: new Set(),
    error: new Set(),
  };

  #ready: SimulationReady | null = null;
  #resolveReady: ((ready: SimulationReady) => void) | null = null;
  #rejectReady: ((error: Error) => void) | null = null;

  constructor() {
    this.#worker.addEventListener('message', this.#onMessage);
    this.#worker.addEventListener('error', this.#onWorkerError);
  }

  connect(): Promise<SimulationReady> {
    if (this.#ready !== null) return Promise.resolve(this.#ready);

    return new Promise<SimulationReady>((resolve, reject) => {
      this.#resolveReady = resolve;
      this.#rejectReady = reject;
    });
  }

  sendInput(input: InputFrame): void {
    const payload = encodeInputFrame(input);
    const message: ClientToWorkerMessage = { type: 'input-frame', payload };
    this.#worker.postMessage(message, [payload]);
  }

  loadSave(save: ArrivalSliceSave | undefined): void {
    const message: ClientToWorkerMessage = { type: 'load-save', save };
    this.#worker.postMessage(message);
  }

  setPaused(paused: boolean): void {
    const message: ClientToWorkerMessage = { type: 'set-paused', paused };
    this.#worker.postMessage(message);
  }

  resetWorld(): void {
    const message: ClientToWorkerMessage = { type: 'reset-world' };
    this.#worker.postMessage(message);
  }

  on<EventName extends AuthorityEventName>(
    event: EventName,
    listener: (payload: AuthorityTransportEvents[EventName]) => void,
  ): () => void {
    const listeners = this.#listeners[event] as Set<
      (payload: AuthorityTransportEvents[EventName]) => void
    >;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  dispose(): void {
    this.#worker.removeEventListener('message', this.#onMessage);
    this.#worker.removeEventListener('error', this.#onWorkerError);
    this.#worker.terminate();
    this.#rejectReady?.(new Error('Local authority was disposed before it became ready'));
  }

  readonly #emit = <EventName extends AuthorityEventName>(
    event: EventName,
    payload: AuthorityTransportEvents[EventName],
  ): void => {
    const listeners = this.#listeners[event] as Set<
      (value: AuthorityTransportEvents[EventName]) => void
    >;
    listeners.forEach((listener) => {
      listener(payload);
    });
  };

  readonly #onMessage = (event: MessageEvent<WorkerToClientMessage>): void => {
    const message = event.data;

    if (isReady(message)) {
      this.#ready = message;
      this.#resolveReady?.(message);
      this.#resolveReady = null;
      this.#rejectReady = null;
      this.#emit('ready', message);
      return;
    }

    if (message.type === 'simulation-snapshot') {
      const snapshot: SimulationSnapshot = SimulationSnapshotSchema.parse(message);
      this.#emit('snapshot', snapshot);
      return;
    }

    if (message.type === 'durable-event') {
      this.#emit('durableEvent', message);
      return;
    }

    const simulationError = message;
    this.#emit('error', simulationError);
    if (!simulationError.recoverable) {
      this.#rejectReady?.(new Error(simulationError.message));
    }
  };

  readonly #onWorkerError = (event: ErrorEvent): void => {
    const error: SimulationError = {
      type: 'simulation-error',
      code: 'initialization-failed',
      message: event.message || 'The local simulation worker failed',
      recoverable: false,
    };
    this.#emit('error', error);
    this.#rejectReady?.(new Error(error.message));
  };
}
