import type {
  ArrivalSliceSave,
  DurableEvent,
  InputFrame,
  SimulationError,
  SimulationReady,
  SimulationSnapshot,
} from '@vibes/protocol';

export interface AuthorityTransportEvents {
  readonly ready: SimulationReady;
  readonly snapshot: SimulationSnapshot;
  readonly durableEvent: DurableEvent;
  readonly error: SimulationError;
}

export type AuthorityEventName = keyof AuthorityTransportEvents;

export interface AuthorityTransport {
  connect(): Promise<SimulationReady>;
  sendInput(input: InputFrame): void;
  loadSave(save: ArrivalSliceSave | undefined): void;
  setPaused(paused: boolean): void;
  resetWorld(): void;
  on<EventName extends AuthorityEventName>(
    event: EventName,
    listener: (payload: AuthorityTransportEvents[EventName]) => void,
  ): () => void;
  dispose(): void;
}
