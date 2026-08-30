import { useEffect, useRef } from 'react';
import {
  WORLD_CELL_SIZE,
  type DurableEvent,
  type InputFrame,
  type SimulationError,
  type SimulationReady,
  type SimulationSnapshot,
} from '@vibes/protocol';

import { KeyboardInput } from './input/KeyboardInput';
import { readArrivalSave } from './persistence';
import type { RenderMetrics, ThreeRenderer as ThreeRendererInstance } from './render/ThreeRenderer';
import type { AuthorityTransport } from './session/AuthorityTransport';

const INPUT_INTERVAL_SECONDS = 1 / 30;
const TEST_HOOKS_ENABLED = import.meta.env.MODE === 'e2e';

export interface GameViewProps {
  readonly active: boolean;
  readonly paused: boolean;
  readonly reducedMotion: boolean;
  readonly cameraSensitivity: number;
  readonly resetSequence: number;
  readonly createTransport: () => AuthorityTransport;
  readonly onReady: (ready: SimulationReady) => void;
  readonly onSnapshot: (snapshot: SimulationSnapshot) => void;
  readonly onDurableEvent: (event: DurableEvent) => void;
  readonly onError: (error: SimulationError) => void;
  readonly onMetrics: (metrics: RenderMetrics) => void;
  readonly onPauseRequest: () => void;
  readonly onCompassBearingChange: (bearingDegrees: number | null) => void;
}

export function GameView({
  active,
  paused,
  reducedMotion,
  cameraSensitivity,
  resetSequence,
  createTransport,
  onReady,
  onSnapshot,
  onDurableEvent,
  onError,
  onMetrics,
  onPauseRequest,
  onCompassBearingChange,
}: GameViewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const transportRef = useRef<AuthorityTransport | null>(null);
  const inputRef = useRef<KeyboardInput | null>(null);
  const resetSequenceRef = useRef(resetSequence);

  const currentProps = useRef({
    active,
    paused,
    reducedMotion,
    cameraSensitivity,
    createTransport,
    onReady,
    onSnapshot,
    onDurableEvent,
    onError,
    onMetrics,
    onPauseRequest,
    onCompassBearingChange,
  });
  currentProps.current = {
    active,
    paused,
    reducedMotion,
    cameraSensitivity,
    createTransport,
    onReady,
    onSnapshot,
    onDurableEvent,
    onError,
    onMetrics,
    onPauseRequest,
    onCompassBearingChange,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let renderer: ThreeRendererInstance | null = null;
    let input: KeyboardInput | null = null;
    let transport: AuthorityTransport | null = null;
    let testHook: VibesTestHook | undefined;
    let unsubscribeSnapshot: (() => void) | null = null;
    let unsubscribeEvent: (() => void) | null = null;
    let unsubscribeError: (() => void) | null = null;
    let latestSnapshot: SimulationSnapshot | null = null;
    // Snapshots acknowledge only a sequence number. E2E builds retain the sampled
    // frames long enough to expose the exact yaw and movement axes that sequence carried.
    const sampledInputs = TEST_HOOKS_ENABLED ? new Map<number, InputFrame>() : undefined;
    let inputAccumulator = 0;
    let inputSequence = 1;
    let previousTime = performance.now();
    let elapsedSeconds = 0;
    let animationFrame = 0;
    let previousMetrics: RenderMetrics | null = null;
    let hadPointerLock = false;
    let cancelled = false;
    let cleanedUp = false;

    const reportInitializationFailure = (error: unknown): void => {
      currentProps.current.onError({
        type: 'simulation-error',
        code: 'initialization-failed',
        message: error instanceof Error ? error.message : String(error),
        recoverable: false,
      });
    };

    const suspendForFocusLoss = (): void => {
      const props = currentProps.current;
      if (!props.active || props.paused || input === null || transport === null) return;

      input.setEnabled(false);
      transport.setPaused(true);
      props.onPauseRequest();
    };

    const onPointerLockChange = (): void => {
      if (renderer !== null && document.pointerLockElement === renderer.canvas) {
        hadPointerLock = true;
      } else if (hadPointerLock) {
        suspendForFocusLoss();
      }
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') suspendForFocusLoss();
    };

    const renderFrame = (time: number): void => {
      if (cancelled || renderer === null || input === null || transport === null) return;

      const deltaSeconds = Math.min((time - previousTime) / 1_000, 0.1);
      previousTime = time;
      elapsedSeconds += deltaSeconds;
      const props = currentProps.current;
      input.setSensitivityMultiplier(props.cameraSensitivity);
      input.setEnabled(props.active && !props.paused);

      if (props.active && !props.paused) {
        inputAccumulator += deltaSeconds;
        while (inputAccumulator >= INPUT_INTERVAL_SECONDS) {
          const intendedTick = (latestSnapshot?.tick ?? 0) + 1;
          const sampledInput = input.sample(inputSequence, intendedTick);
          sampledInputs?.set(sampledInput.sequence, sampledInput);
          transport.sendInput(sampledInput);
          inputSequence += 1;
          inputAccumulator -= INPUT_INTERVAL_SECONDS;
        }
      } else {
        inputAccumulator = 0;
      }

      const camera = input.camera;
      renderer.render(deltaSeconds, elapsedSeconds, camera, props.reducedMotion);
      if (TEST_HOOKS_ENABLED) {
        const hook = window.__VIBES_TEST__;
        if (hook !== undefined) {
          hook.camera = { ...camera };
          hook.frames += 1;
          hook.contextLost = renderer.contextLost;
          hook.paused = props.paused;
          hook.avatar = renderer.avatarDiagnostics;
        }
      }

      const metrics = renderer.metrics;
      if (metrics !== previousMetrics) {
        previousMetrics = metrics;
        props.onMetrics(metrics);
      }
      animationFrame = window.requestAnimationFrame(renderFrame);
    };

    const cleanup = (): void => {
      if (cleanedUp) return;
      cleanedUp = true;
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      unsubscribeSnapshot?.();
      unsubscribeEvent?.();
      unsubscribeError?.();
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', suspendForFocusLoss);
      input?.detach();
      transport?.dispose();
      renderer?.dispose();
      currentProps.current.onCompassBearingChange(null);
      if (transportRef.current === transport) transportRef.current = null;
      if (inputRef.current === input) inputRef.current = null;
      if (TEST_HOOKS_ENABLED && testHook !== undefined && window.__VIBES_TEST__ === testHook) {
        delete window.__VIBES_TEST__;
      }
    };

    const initialize = async (): Promise<void> => {
      try {
        const { ThreeRenderer } = await import('./render/ThreeRenderer');
        if (cancelled) return;
        renderer = new ThreeRenderer(container, currentProps.current.onCompassBearingChange);
        input = new KeyboardInput();
        transport = currentProps.current.createTransport();

        input.attach(renderer.canvas);
        input.setSensitivityMultiplier(currentProps.current.cameraSensitivity);
        input.setEnabled(currentProps.current.active && !currentProps.current.paused);
        transportRef.current = transport;
        inputRef.current = input;

        if (TEST_HOOKS_ENABLED) {
          testHook = {
            ready: false,
            tick: 0,
            position: { x: 0, y: 0, z: 0 },
            yaw: 0,
            camera: { yaw: 0, pitch: -0.24 },
            acknowledgedInput: { sequence: 0, moveX: 0, moveZ: 0, lookYaw: 0 },
            setCamera: (yaw, pitch) => {
              input?.setCamera(yaw, pitch);
            },
            frames: 0,
            contextLost: false,
            paused: currentProps.current.paused,
            avatar: renderer.avatarDiagnostics,
          };
          window.__VIBES_TEST__ = testHook;
        }

        document.addEventListener('pointerlockchange', onPointerLockChange);
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('blur', suspendForFocusLoss);

        unsubscribeSnapshot = transport.on('snapshot', (snapshot) => {
          latestSnapshot = snapshot;
          renderer?.setSnapshot(snapshot);
          currentProps.current.onSnapshot(snapshot);
          if (!TEST_HOOKS_ENABLED) return;
          const hook = window.__VIBES_TEST__;
          if (hook === undefined) return;

          const player = snapshot.entities[0];
          if (player !== undefined) {
            hook.position = {
              x: player.position.cellX * WORLD_CELL_SIZE + player.position.localX,
              y: player.position.y,
              z: player.position.cellZ * WORLD_CELL_SIZE + player.position.localZ,
            };
            hook.yaw = player.yaw;
          }
          const acknowledgedInput = sampledInputs?.get(snapshot.acknowledgedInputSequence);
          if (sampledInputs !== undefined && acknowledgedInput !== undefined) {
            hook.acknowledgedInput = {
              sequence: acknowledgedInput.sequence,
              moveX: acknowledgedInput.moveX,
              moveZ: acknowledgedInput.moveZ,
              lookYaw: acknowledgedInput.lookYaw,
            };
            for (const sequence of sampledInputs.keys()) {
              if (sequence <= acknowledgedInput.sequence) sampledInputs.delete(sequence);
            }
          }
          hook.tick = snapshot.tick;
        });
        unsubscribeEvent = transport.on('durableEvent', (event) => {
          currentProps.current.onDurableEvent(event);
        });
        unsubscribeError = transport.on('error', (error) => {
          currentProps.current.onError(error);
        });

        void transport
          .connect()
          .then((ready) => {
            if (cancelled || transport === null) return;
            const save = readArrivalSave();
            if (save === undefined) transport.resetWorld();
            else transport.loadSave(save);
            transport.setPaused(!currentProps.current.active || currentProps.current.paused);
            if (TEST_HOOKS_ENABLED) {
              const hook = window.__VIBES_TEST__;
              if (hook !== undefined) hook.ready = true;
            }
            currentProps.current.onReady(ready);
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            cleanup();
            reportInitializationFailure(error);
          });

        animationFrame = window.requestAnimationFrame(renderFrame);
      } catch (error) {
        if (cancelled) return;
        cleanup();
        reportInitializationFailure(error);
      }
    };

    void initialize();

    return cleanup;
  }, []);

  useEffect(() => {
    transportRef.current?.setPaused(!active || paused);
    inputRef.current?.setEnabled(active && !paused);
    if (TEST_HOOKS_ENABLED) {
      const hook = window.__VIBES_TEST__;
      if (hook !== undefined) hook.paused = paused;
    }
  }, [active, paused]);

  useEffect(() => {
    if (resetSequenceRef.current === resetSequence) return;
    resetSequenceRef.current = resetSequence;
    transportRef.current?.resetWorld();
  }, [resetSequence]);

  return <div className="game-viewport" ref={containerRef} />;
}
