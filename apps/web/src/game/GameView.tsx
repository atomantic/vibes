import { useEffect, useRef } from 'react';
import {
  WORLD_CELL_SIZE,
  type DurableEvent,
  type SimulationError,
  type SimulationReady,
  type SimulationSnapshot,
} from '@vibes/protocol';

import { KeyboardInput } from './input/KeyboardInput';
import { readArrivalSave } from './persistence';
import { ThreeRenderer, type RenderMetrics } from './render/ThreeRenderer';
import { LocalWorkerTransport } from './session/LocalWorkerTransport';

const INPUT_INTERVAL_SECONDS = 1 / 30;

export interface GameViewProps {
  readonly active: boolean;
  readonly paused: boolean;
  readonly reducedMotion: boolean;
  readonly cameraSensitivity: number;
  readonly resetSequence: number;
  readonly onReady: (ready: SimulationReady) => void;
  readonly onSnapshot: (snapshot: SimulationSnapshot) => void;
  readonly onDurableEvent: (event: DurableEvent) => void;
  readonly onError: (error: SimulationError) => void;
  readonly onMetrics: (metrics: RenderMetrics) => void;
  readonly onPauseRequest: () => void;
}

export function GameView({
  active,
  paused,
  reducedMotion,
  cameraSensitivity,
  resetSequence,
  onReady,
  onSnapshot,
  onDurableEvent,
  onError,
  onMetrics,
  onPauseRequest,
}: GameViewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const transportRef = useRef<LocalWorkerTransport | null>(null);
  const inputRef = useRef<KeyboardInput | null>(null);
  const resetSequenceRef = useRef(resetSequence);

  const currentProps = useRef({
    active,
    paused,
    reducedMotion,
    cameraSensitivity,
    onReady,
    onSnapshot,
    onDurableEvent,
    onError,
    onMetrics,
    onPauseRequest,
  });
  currentProps.current = {
    active,
    paused,
    reducedMotion,
    cameraSensitivity,
    onReady,
    onSnapshot,
    onDurableEvent,
    onError,
    onMetrics,
    onPauseRequest,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let renderer: ThreeRenderer | null = null;
    let input: KeyboardInput | null = null;
    let transport: LocalWorkerTransport | null = null;
    let testHook: VibesTestHook | undefined;
    let unsubscribeSnapshot: (() => void) | null = null;
    let unsubscribeEvent: (() => void) | null = null;
    let unsubscribeError: (() => void) | null = null;
    let latestSnapshot: SimulationSnapshot | null = null;
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
          transport.sendInput(input.sample(inputSequence, intendedTick));
          inputSequence += 1;
          inputAccumulator -= INPUT_INTERVAL_SECONDS;
        }
      } else {
        inputAccumulator = 0;
      }

      const camera = input.camera;
      renderer.render(deltaSeconds, elapsedSeconds, camera, props.reducedMotion);
      const hook = window.__VIBES_TEST__;
      if (hook !== undefined) {
        hook.camera = { ...camera };
        hook.frames += 1;
        hook.contextLost = renderer.contextLost;
        hook.paused = props.paused;
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
      if (transportRef.current === transport) transportRef.current = null;
      if (inputRef.current === input) inputRef.current = null;
      if (window.__VIBES_TEST__ === testHook) delete window.__VIBES_TEST__;
    };

    try {
      renderer = new ThreeRenderer(container);
      input = new KeyboardInput();
      transport = new LocalWorkerTransport();

      input.attach(renderer.canvas);
      input.setSensitivityMultiplier(currentProps.current.cameraSensitivity);
      input.setEnabled(currentProps.current.active && !currentProps.current.paused);
      transportRef.current = transport;
      inputRef.current = input;

      testHook = {
        ready: false,
        tick: 0,
        position: { x: 0, y: 0, z: 0 },
        yaw: 0,
        camera: { yaw: 0, pitch: -0.24 },
        setCamera: (yaw, pitch) => {
          input?.setCamera(yaw, pitch);
        },
        frames: 0,
        contextLost: false,
        paused: currentProps.current.paused,
      };
      window.__VIBES_TEST__ = testHook;

      document.addEventListener('pointerlockchange', onPointerLockChange);
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('blur', suspendForFocusLoss);

      unsubscribeSnapshot = transport.on('snapshot', (snapshot) => {
        latestSnapshot = snapshot;
        renderer?.setSnapshot(snapshot);
        currentProps.current.onSnapshot(snapshot);
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
          const hook = window.__VIBES_TEST__;
          if (hook !== undefined) hook.ready = true;
          currentProps.current.onReady(ready);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          cleanup();
          reportInitializationFailure(error);
        });

      animationFrame = window.requestAnimationFrame(renderFrame);
    } catch (error) {
      cleanup();
      reportInitializationFailure(error);
    }

    return cleanup;
  }, []);

  useEffect(() => {
    transportRef.current?.setPaused(!active || paused);
    inputRef.current?.setEnabled(active && !paused);
    const hook = window.__VIBES_TEST__;
    if (hook !== undefined) hook.paused = paused;
  }, [active, paused]);

  useEffect(() => {
    if (resetSequenceRef.current === resetSequence) return;
    resetSequenceRef.current = resetSequence;
    transportRef.current?.resetWorld();
  }, [resetSequence]);

  return <div className="game-viewport" ref={containerRef} />;
}
