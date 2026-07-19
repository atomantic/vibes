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

    window.__VIBES_TEST__ = {
      ready: false,
      tick: 0,
      position: { x: 0, y: 0, z: 0 },
      frames: 0,
      contextLost: false,
      paused: currentProps.current.paused,
    };

    const renderer = new ThreeRenderer(container);
    const input = new KeyboardInput();
    const transport = new LocalWorkerTransport();
    input.attach(renderer.canvas);
    input.setSensitivity(currentProps.current.cameraSensitivity);
    input.setEnabled(currentProps.current.active && !currentProps.current.paused);
    transportRef.current = transport;
    inputRef.current = input;

    let latestSnapshot: SimulationSnapshot | null = null;
    let inputAccumulator = 0;
    let inputSequence = 1;
    let previousTime = performance.now();
    let elapsedSeconds = 0;
    let animationFrame = 0;
    let previousMetrics: RenderMetrics | null = null;
    let hadPointerLock = false;
    let cancelled = false;

    const onPointerLockChange = (): void => {
      if (document.pointerLockElement === renderer.canvas) {
        hadPointerLock = true;
      } else if (hadPointerLock && currentProps.current.active && !currentProps.current.paused) {
        currentProps.current.onPauseRequest();
      }
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);

    const unsubscribeSnapshot = transport.on('snapshot', (snapshot) => {
      latestSnapshot = snapshot;
      renderer.setSnapshot(snapshot);
      currentProps.current.onSnapshot(snapshot);
      const player = snapshot.entities[0];
      if (player !== undefined) {
        window.__VIBES_TEST__.position = {
          x: player.position.cellX * WORLD_CELL_SIZE + player.position.localX,
          y: player.position.y,
          z: player.position.cellZ * WORLD_CELL_SIZE + player.position.localZ,
        };
      }
      window.__VIBES_TEST__.tick = snapshot.tick;
    });
    const unsubscribeEvent = transport.on('durableEvent', (event) => {
      currentProps.current.onDurableEvent(event);
    });
    const unsubscribeError = transport.on('error', (error) => {
      currentProps.current.onError(error);
    });

    const renderFrame = (time: number): void => {
      const deltaSeconds = Math.min((time - previousTime) / 1_000, 0.1);
      previousTime = time;
      elapsedSeconds += deltaSeconds;
      const props = currentProps.current;
      input.setSensitivity(props.cameraSensitivity);
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

      renderer.render(deltaSeconds, elapsedSeconds, input.camera, props.reducedMotion);
      window.__VIBES_TEST__.frames += 1;
      window.__VIBES_TEST__.contextLost = renderer.contextLost;
      window.__VIBES_TEST__.paused = props.paused;

      const metrics = renderer.metrics;
      if (metrics !== previousMetrics) {
        previousMetrics = metrics;
        props.onMetrics(metrics);
      }
      animationFrame = window.requestAnimationFrame(renderFrame);
    };

    void transport
      .connect()
      .then((ready) => {
        if (cancelled) return;
        const save = readArrivalSave();
        if (save === undefined) transport.resetWorld();
        else transport.loadSave(save);
        transport.setPaused(!currentProps.current.active || currentProps.current.paused);
        window.__VIBES_TEST__.ready = true;
        currentProps.current.onReady(ready);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        currentProps.current.onError({
          type: 'simulation-error',
          code: 'initialization-failed',
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
        });
      });

    animationFrame = window.requestAnimationFrame(renderFrame);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      unsubscribeSnapshot();
      unsubscribeEvent();
      unsubscribeError();
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      input.detach();
      transport.dispose();
      renderer.dispose();
      transportRef.current = null;
      inputRef.current = null;
    };
  }, []);

  useEffect(() => {
    transportRef.current?.setPaused(!active || paused);
    inputRef.current?.setEnabled(active && !paused);
    window.__VIBES_TEST__.paused = paused;
  }, [active, paused]);

  useEffect(() => {
    if (resetSequenceRef.current === resetSequence) return;
    resetSequenceRef.current = resetSequence;
    transportRef.current?.resetWorld();
  }, [resetSequence]);

  return <div className="game-viewport" ref={containerRef} />;
}
