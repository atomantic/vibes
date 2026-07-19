import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ARRIVAL_SLICE_DEFINITION,
  ARRIVAL_SLICE_SEED,
  ARRIVAL_SLICE_POSITIONS,
} from '@vibes/world';
import type {
  ArrivalSliceSave,
  DurableEvent,
  ObjectiveSnapshot,
  SimulationError,
  SimulationReady,
  SimulationSnapshot,
} from '@vibes/protocol';

import { GameView } from './game/GameView';
import { persistArrivalSave, readArrivalSave } from './game/persistence';
import type { RenderMetrics } from './game/render/ThreeRenderer';

interface PlayerPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface PlayerSettings {
  readonly reducedMotion: boolean;
  readonly cameraSensitivity: number;
  readonly uiScale: number;
}

const SETTINGS_KEY = 'vibes.player-settings.v1';

const DEFAULT_OBJECTIVE: ObjectiveSnapshot = {
  arrivalChimeActivated: false,
  crossingRaised: false,
  loomAwakened: false,
  optionalVistaFound: false,
  checkpoint: 'shore',
};

function readSettings(): PlayerSettings {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw === null) {
      return { reducedMotion: prefersReducedMotion, cameraSensitivity: 1, uiScale: 1 };
    }
    const value = JSON.parse(raw) as Partial<PlayerSettings>;
    return {
      reducedMotion:
        typeof value.reducedMotion === 'boolean' ? value.reducedMotion : prefersReducedMotion,
      cameraSensitivity:
        typeof value.cameraSensitivity === 'number'
          ? Math.min(2, Math.max(0.35, value.cameraSensitivity))
          : 1,
      uiScale:
        typeof value.uiScale === 'number' ? Math.min(1.35, Math.max(0.85, value.uiScale)) : 1,
    };
  } catch {
    return { reducedMotion: prefersReducedMotion, cameraSensitivity: 1, uiScale: 1 };
  }
}

function distanceTo(position: PlayerPosition, target: PlayerPosition): number {
  return Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z);
}

function objectiveText(objective: ObjectiveSnapshot): string {
  if (objective.loomAwakened) return 'The Loom is awake. Three Shards are still missing.';
  if (objective.arrivalChimeActivated) return 'Cross the awakened path and reach the Loom.';
  if (objective.checkpoint === 'ridge') return 'Attune the Arrival Chime to open the way.';
  return 'Follow the answering light toward the ridge.';
}

function canTimeArrival(save: ArrivalSliceSave | undefined): boolean {
  return (
    save === undefined ||
    (!save.arrivalChimeActivated &&
      !save.loomAwakened &&
      !save.optionalVistaFound &&
      save.checkpoint === 'shore')
  );
}

export function App(): React.JSX.Element {
  const persistedArrival = useMemo(() => readArrivalSave(), []);
  const [status, setStatus] = useState('Preparing Resonance Reach');
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [settings, setSettings] = useState<PlayerSettings>(readSettings);
  const [objective, setObjective] = useState<ObjectiveSnapshot>(DEFAULT_OBJECTIVE);
  const [position, setPosition] = useState<PlayerPosition>({
    x: ARRIVAL_SLICE_POSITIONS.arrivalSpawn.x,
    y: ARRIVAL_SLICE_POSITIONS.arrivalSpawn.y,
    z: ARRIVAL_SLICE_POSITIONS.arrivalSpawn.z,
  });
  const [tick, setTick] = useState(0);
  const [metrics, setMetrics] = useState<RenderMetrics>({
    fps: 0,
    frameTimeMs: 0,
    drawCalls: 0,
    triangles: 0,
  });
  const [prompt, setPrompt] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [resetSequence, setResetSequence] = useState(0);
  const lastSaveRef = useRef('');
  const bestArrivalTimeRef = useRef(persistedArrival?.bestArrivalTimeMs);
  const previousLoomStateRef = useRef(persistedArrival?.loomAwakened ?? false);
  const arrivalTimerArmedRef = useRef(canTimeArrival(persistedArrival));
  const arrivalTimerActiveRef = useRef(false);
  const simulationTickRateRef = useRef(30);
  const resetPendingRef = useRef(false);

  const currentObjective = useMemo(() => objectiveText(objective), [objective]);

  const beginJourney = useCallback((): void => {
    setStarted(true);
    setPaused(false);
    arrivalTimerActiveRef.current = arrivalTimerArmedRef.current;
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', String(settings.uiScale));
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Enter' && !started && status === 'World ready') {
        beginJourney();
      } else if (event.code === 'Escape' && started) {
        setPaused((value) => !value);
      } else if (event.code === 'F3') {
        event.preventDefault();
        setDiagnostics((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [beginJourney, started, status]);

  useEffect(() => {
    if (!started || paused) {
      setPrompt(null);
      return;
    }
    const chimeDistance = distanceTo(position, ARRIVAL_SLICE_POSITIONS.arrivalChime);
    const loomDistance = distanceTo(position, ARRIVAL_SLICE_POSITIONS.loom);
    const chimeInteraction = ARRIVAL_SLICE_DEFINITION.interactions.find(
      ({ persistentStateKey }) => persistentStateKey === 'arrivalChimeActivated',
    );
    const loomInteraction = ARRIVAL_SLICE_DEFINITION.interactions.find(
      ({ persistentStateKey }) => persistentStateKey === 'loomAwakened',
    );
    if (
      !objective.arrivalChimeActivated &&
      chimeInteraction !== undefined &&
      chimeDistance <= chimeInteraction.radiusMeters
    ) {
      setPrompt(`E  ·  ${chimeInteraction.prompt}`);
    } else if (
      objective.arrivalChimeActivated &&
      !objective.loomAwakened &&
      loomInteraction !== undefined &&
      loomDistance <= loomInteraction.radiusMeters
    ) {
      setPrompt(`E  ·  ${loomInteraction.prompt}`);
    } else {
      setPrompt(null);
    }
  }, [objective.arrivalChimeActivated, objective.loomAwakened, paused, position, started]);

  const handleReady = useCallback((ready: SimulationReady): void => {
    simulationTickRateRef.current = ready.tickRate;
    setStatus('World ready');
  }, []);

  const handleSnapshot = useCallback((snapshot: SimulationSnapshot): void => {
    setTick(snapshot.tick);
    setObjective(snapshot.objective);
    const player = snapshot.entities[0];
    if (player !== undefined) {
      setPosition({
        x: player.position.cellX * 64 + player.position.localX,
        y: player.position.y,
        z: player.position.cellZ * 64 + player.position.localZ,
      });
    }

    if (!snapshot.objective.loomAwakened) {
      previousLoomStateRef.current = false;
    } else if (!previousLoomStateRef.current) {
      if (arrivalTimerActiveRef.current) {
        const arrivalTimeMs = Math.round((snapshot.tick / simulationTickRateRef.current) * 1_000);
        bestArrivalTimeRef.current = Math.min(
          bestArrivalTimeRef.current ?? arrivalTimeMs,
          arrivalTimeMs,
        );
      }
      previousLoomStateRef.current = true;
      arrivalTimerArmedRef.current = false;
      arrivalTimerActiveRef.current = false;
    }

    const save: ArrivalSliceSave = {
      schemaVersion: 1,
      worldSeed: ARRIVAL_SLICE_SEED,
      arrivalChimeActivated: snapshot.objective.arrivalChimeActivated,
      loomAwakened: snapshot.objective.loomAwakened,
      optionalVistaFound: snapshot.objective.optionalVistaFound,
      checkpoint: snapshot.objective.checkpoint,
      ...(bestArrivalTimeRef.current === undefined
        ? {}
        : { bestArrivalTimeMs: bestArrivalTimeRef.current }),
    };
    const serialized = JSON.stringify(save);
    if (serialized !== lastSaveRef.current) {
      lastSaveRef.current = serialized;
      persistArrivalSave(save);
      setSaveStatus('Journey saved');
      window.setTimeout(() => {
        setSaveStatus('');
      }, 1_600);
    }
    if (
      resetPendingRef.current &&
      snapshot.tick === 0 &&
      !snapshot.objective.arrivalChimeActivated &&
      !snapshot.objective.loomAwakened &&
      !snapshot.objective.optionalVistaFound &&
      snapshot.objective.checkpoint === 'shore'
    ) {
      resetPendingRef.current = false;
      setAnnouncement('The journey begins again at Arrival Shore.');
    }
  }, []);

  const handleDurableEvent = useCallback((event: DurableEvent): void => {
    const caption =
      event.eventType === 'arrival-chime-activated'
        ? 'The Chime answers. Ancient stones rise across the hollow.'
        : event.eventType === 'loom-awakened'
          ? 'The Loom wakes. Three empty Shard sockets call across the Reach.'
          : event.eventType === 'optional-vista-found'
            ? 'A hidden resonance joins your journey.'
            : 'A safe return point has been remembered.';
    setAnnouncement(caption);
    window.setTimeout(() => {
      setAnnouncement('');
    }, 5_000);
  }, []);

  const handleError = useCallback((error: SimulationError): void => {
    if (error.recoverable) {
      setAnnouncement(`The world recovered from an input problem: ${error.message}`);
    } else {
      setFatalError(error.message);
      setStatus('World unavailable');
    }
  }, []);

  const handlePauseRequest = useCallback((): void => {
    setPaused(true);
  }, []);

  const restartJourney = (): void => {
    resetPendingRef.current = true;
    setResetSequence((value) => value + 1);
    setObjective(DEFAULT_OBJECTIVE);
    setPaused(false);
    setStarted(true);
    previousLoomStateRef.current = false;
    arrivalTimerArmedRef.current = true;
    arrivalTimerActiveRef.current = true;
    bestArrivalTimeRef.current = undefined;
    lastSaveRef.current = '';
  };

  return (
    <main className="game-shell" aria-label="Vibes game">
      <GameView
        active={started}
        paused={paused}
        reducedMotion={settings.reducedMotion}
        cameraSensitivity={settings.cameraSensitivity}
        resetSequence={resetSequence}
        onReady={handleReady}
        onSnapshot={handleSnapshot}
        onDurableEvent={handleDurableEvent}
        onError={handleError}
        onMetrics={setMetrics}
        onPauseRequest={handlePauseRequest}
      />

      <div className="cinematic-vignette" aria-hidden="true" />
      <header className="brand-lockup" aria-label="Vibes">
        <span className="brand-glyph" aria-hidden="true">
          ◇
        </span>
        <span className="brand-name">VIBES</span>
        <span className="build-label">FIRST LIGHT</span>
      </header>

      <div className="world-status" role="status" aria-live="polite">
        {status}
      </div>

      {started && !fatalError ? (
        <>
          <section className="objective-card" aria-label="Current objective">
            <span className="eyebrow">ARRIVAL SHORE</span>
            <h1>{currentObjective}</h1>
            <div className="objective-progress" aria-label="Journey progress">
              <span className="progress-mark complete">✓</span>
              <span
                className={
                  objective.arrivalChimeActivated ? 'progress-line complete' : 'progress-line'
                }
              />
              <span
                className={
                  objective.arrivalChimeActivated ? 'progress-mark complete' : 'progress-mark'
                }
              >
                ◇
              </span>
              <span
                className={objective.loomAwakened ? 'progress-line complete' : 'progress-line'}
              />
              <span className={objective.loomAwakened ? 'progress-mark complete' : 'progress-mark'}>
                ◉
              </span>
            </div>
          </section>

          <div className="landmark-compass" aria-label="The Loom lies ahead">
            <span className="loom-glyph" aria-hidden="true">
              ⌾
            </span>
            <span>THE LOOM</span>
          </div>

          <div className="crosshair" aria-hidden="true" />
          {prompt !== null ? <div className="interaction-prompt">{prompt}</div> : null}
          <div className="control-hint" aria-hidden="true">
            <span>WASD move</span>
            <span>Shift sprint</span>
            <span>Space jump</span>
            <span>Click look</span>
            <span>F3 diagnostics</span>
          </div>
        </>
      ) : null}

      {!started && fatalError === null ? (
        <section className="arrival-card" aria-labelledby="arrival-title">
          <span className="eyebrow">RESONANCE REACH · PROTOTYPE 01</span>
          <h1 id="arrival-title">First Light at the Loom</h1>
          <p>
            The island has been quiet for generations. Follow the answering light and wake what
            waits beyond the ridge.
          </p>
          <button
            className="primary-button"
            type="button"
            disabled={status !== 'World ready'}
            onClick={beginJourney}
          >
            <span>{status === 'World ready' ? 'Enter Resonance Reach' : 'Preparing world…'}</span>
            <kbd>Enter</kbd>
          </button>
          <div className="arrival-details">
            <span>Procedural world</span>
            <span>Local authority</span>
            <span>Progress saved</span>
          </div>
        </section>
      ) : null}

      {paused ? (
        <section
          className="pause-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-title"
        >
          <span className="eyebrow">THE WORLD IS WAITING</span>
          <h2 id="pause-title">Paused</h2>
          <button
            className="primary-button compact"
            type="button"
            onClick={() => {
              setPaused(false);
            }}
          >
            Resume journey <kbd>Esc</kbd>
          </button>
          <label className="setting-row">
            <span>
              <strong>Reduced motion</strong>
              <small>Calmer world and interface animation</small>
            </span>
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(event) => {
                setSettings((current) => ({ ...current, reducedMotion: event.target.checked }));
              }}
            />
          </label>
          <label className="setting-row slider-row">
            <span>
              <strong>Camera sensitivity</strong>
              <small>{settings.cameraSensitivity.toFixed(2)}×</small>
            </span>
            <input
              type="range"
              min="0.35"
              max="2"
              step="0.05"
              value={settings.cameraSensitivity}
              onChange={(event) => {
                setSettings((current) => ({
                  ...current,
                  cameraSensitivity: Number(event.target.value),
                }));
              }}
            />
          </label>
          <button className="text-button" type="button" onClick={restartJourney}>
            Restart journey
          </button>
        </section>
      ) : null}

      {fatalError !== null ? (
        <section className="error-card" role="alert">
          <span className="eyebrow">THE WORLD COULD NOT OPEN</span>
          <h1>Resonance interrupted</h1>
          <p>{fatalError}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              window.location.reload();
            }}
          >
            Try again
          </button>
        </section>
      ) : null}

      {diagnostics ? (
        <aside className="diagnostics" aria-label="World diagnostics">
          <div>
            <span>authority</span>
            <strong>local worker</strong>
          </div>
          <div>
            <span>tick</span>
            <strong>{tick}</strong>
          </div>
          <div>
            <span>fps</span>
            <strong>{metrics.fps}</strong>
          </div>
          <div>
            <span>frame</span>
            <strong>{metrics.frameTimeMs.toFixed(1)} ms</strong>
          </div>
          <div>
            <span>draws</span>
            <strong>{metrics.drawCalls}</strong>
          </div>
          <div>
            <span>triangles</span>
            <strong>{metrics.triangles.toLocaleString()}</strong>
          </div>
          <div>
            <span>position</span>
            <strong>
              {position.x.toFixed(1)}, {position.y.toFixed(1)}, {position.z.toFixed(1)}
            </strong>
          </div>
          <div>
            <span>checkpoint</span>
            <strong>{objective.checkpoint}</strong>
          </div>
          <div>
            <span>seed</span>
            <strong>0x{ARRIVAL_SLICE_SEED.toString(16)}</strong>
          </div>
        </aside>
      ) : null}

      <div className="announcement" aria-live="assertive">
        {announcement}
      </div>
      <div className="save-status" aria-live="polite">
        {saveStatus}
      </div>
    </main>
  );
}
