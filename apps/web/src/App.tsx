import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ARRIVAL_ECHO_SHARDS,
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
import { WORLD_CELL_SIZE } from '@vibes/protocol';

import { SynthAudio } from './game/audio/SynthAudio';
import { GameView } from './game/GameView';
import { persistArrivalSave, readArrivalSave } from './game/persistence';
import type { RenderMetrics } from './game/render/ThreeRenderer';
import type { AuthorityTransport } from './game/session/AuthorityTransport';
import { LocalWorkerTransport } from './game/session/LocalWorkerTransport';
import { readPlayerSettings, SETTINGS_KEY, type PlayerSettings } from './settings';

interface PlayerPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const GAME_CONTROLS_DESCRIPTION_ID = 'game-control-instructions';

const DEFAULT_OBJECTIVE: ObjectiveSnapshot = {
  arrivalChimeActivated: false,
  crossingRaised: false,
  loomAwakened: false,
  optionalVistaFound: false,
  collectedEchoShards: [],
  checkpoint: 'shore',
};

function applyCompassBearing(compass: HTMLDivElement, bearingDegrees: number | null): void {
  if (bearingDegrees === null) {
    compass.style.removeProperty('--compass-bearing');
    return;
  }
  compass.style.setProperty('--compass-bearing', `${bearingDegrees.toFixed(1)}deg`);
}

function distanceTo(position: PlayerPosition, target: PlayerPosition): number {
  return Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function objectiveText(objective: ObjectiveSnapshot): string {
  if (objective.loomAwakened) return 'The Loom is awake. The Reach remembers your light.';
  if (objective.arrivalChimeActivated) {
    const remaining = ARRIVAL_ECHO_SHARDS.length - objective.collectedEchoShards.length;
    if (remaining > 0) {
      return `Wake the three Echo Shards across the island — ${String(remaining)} still hidden.`;
    }
    return 'Every Shard resonates. Return to the Loom and wake it.';
  }
  if (objective.checkpoint === 'ridge') return 'Attune the Arrival Chime to open the way.';
  return 'Follow the answering light toward the ridge.';
}

function canTimeArrival(save: ArrivalSliceSave | undefined): boolean {
  return (
    save === undefined ||
    (!save.arrivalChimeActivated &&
      !save.loomAwakened &&
      !save.optionalVistaFound &&
      save.collectedEchoShards.length === 0 &&
      save.checkpoint === 'shore')
  );
}

export function App(): React.JSX.Element {
  const persistedArrival = useMemo(() => readArrivalSave(), []);
  const [status, setStatus] = useState('Preparing Resonance Reach');
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [settings, setSettings] = useState<PlayerSettings>(readPlayerSettings);
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
  const [settingsPersistenceStatus, setSettingsPersistenceStatus] = useState('');
  const [progressPersistenceStatus, setProgressPersistenceStatus] = useState('');
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [resetSequence, setResetSequence] = useState(0);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const lastSaveRef = useRef('');
  const initialSnapshotReceivedRef = useRef(false);
  const bestArrivalTimeRef = useRef(persistedArrival?.bestArrivalTimeMs);
  const previousLoomStateRef = useRef(persistedArrival?.loomAwakened ?? false);
  const arrivalTimerArmedRef = useRef(canTimeArrival(persistedArrival));
  const arrivalTimerActiveRef = useRef(false);
  const completedJourneyTimeRef = useRef<number | null>(
    persistedArrival?.loomAwakened === true ? (persistedArrival.bestArrivalTimeMs ?? null) : null,
  );
  const celebrationShownRef = useRef(persistedArrival?.loomAwakened ?? false);
  const simulationTickRateRef = useRef(30);
  const resetPendingRef = useRef(false);
  const audioRef = useRef<SynthAudio | null>(null);
  const pauseResumeButtonRef = useRef<HTMLButtonElement>(null);
  const fatalRetryButtonRef = useRef<HTMLButtonElement>(null);
  const compassRef = useRef<HTMLDivElement>(null);
  const pendingCompassBearingRef = useRef<number | null>(null);
  const announcementTimeoutRef = useRef<number | undefined>(undefined);
  const progressStatusTimeoutRef = useRef<number | undefined>(undefined);
  const announcementEventRef = useRef<{ readonly tick: number; readonly priority: number } | null>(
    null,
  );

  const currentObjective = useMemo(() => objectiveText(objective), [objective]);
  const visiblePersistenceStatus = settingsPersistenceStatus || progressPersistenceStatus;
  const journeyTimeMs =
    completedJourneyTimeRef.current ?? Math.round((tick / simulationTickRateRef.current) * 1_000);
  const collectedShardCount = objective.collectedEchoShards.length;

  const showAnnouncement = useCallback((message: string): void => {
    if (announcementTimeoutRef.current !== undefined) {
      window.clearTimeout(announcementTimeoutRef.current);
    }
    setAnnouncement(message);
    announcementTimeoutRef.current = window.setTimeout(() => {
      setAnnouncement('');
      announcementTimeoutRef.current = undefined;
    }, 5_000);
  }, []);

  const createTransport = useCallback((): AuthorityTransport => new LocalWorkerTransport(), []);

  const handleCompassBearingChange = useCallback((bearingDegrees: number | null): void => {
    pendingCompassBearingRef.current = bearingDegrees;
    const compass = compassRef.current;
    if (compass === null) return;
    applyCompassBearing(compass, bearingDegrees);
  }, []);

  const setCompassRef = useCallback((compass: HTMLDivElement | null): void => {
    compassRef.current = compass;
    if (compass !== null) applyCompassBearing(compass, pendingCompassBearingRef.current);
  }, []);

  const beginJourney = useCallback((): void => {
    if (audioRef.current === null) {
      const audio = new SynthAudio();
      audio.setMuted(settings.soundMuted);
      audioRef.current = audio;
      void audio.unlock().then(() => {
        audio.startAmbient();
      });
    } else {
      const audio = audioRef.current;
      void audio.unlock().then(() => {
        audio.startAmbient();
      });
    }
    setStarted(true);
    setPaused(false);
    arrivalTimerActiveRef.current = arrivalTimerArmedRef.current;
  }, [settings.soundMuted]);

  useEffect(() => {
    audioRef.current?.setMuted(settings.soundMuted);
  }, [settings.soundMuted]);

  // The celebration is a quiet banner, not a modal: play continues underneath
  // and it steps aside on its own after a generous pause.
  useEffect(() => {
    if (!celebrationOpen) return;
    const timeout = window.setTimeout(() => {
      setCelebrationOpen(false);
    }, 14_000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [celebrationOpen]);

  useEffect(
    () => () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', String(settings.uiScale));
    root.dataset['reducedMotion'] = String(settings.reducedMotion);
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      setSettingsPersistenceStatus('');
    } catch {
      setSettingsPersistenceStatus('Settings kept for this session');
    }
  }, [settings]);

  useEffect(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='game-canvas']");
    if (canvas === null) return;

    const previousDescription = canvas.getAttribute('aria-describedby');
    canvas.setAttribute('aria-describedby', GAME_CONTROLS_DESCRIPTION_ID);
    return () => {
      if (previousDescription === null) canvas.removeAttribute('aria-describedby');
      else canvas.setAttribute('aria-describedby', previousDescription);
    };
  }, [status]);

  useEffect(() => {
    if (!paused) return;

    pauseResumeButtonRef.current?.focus();
    return () => {
      document.querySelector<HTMLCanvasElement>("[data-testid='game-canvas']")?.focus();
    };
  }, [paused]);

  useEffect(() => {
    if (fatalError !== null) fatalRetryButtonRef.current?.focus();
  }, [fatalError]);

  useEffect(
    () => () => {
      if (announcementTimeoutRef.current !== undefined) {
        window.clearTimeout(announcementTimeoutRef.current);
      }
      if (progressStatusTimeoutRef.current !== undefined) {
        window.clearTimeout(progressStatusTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Enter' && !started && status === 'World ready') {
        beginJourney();
      } else if (event.code === 'Escape' && started) {
        if (celebrationOpen) {
          setCelebrationOpen(false);
          return;
        }
        setPaused((value) => !value);
      } else if (event.code === 'KeyM' && started) {
        event.preventDefault();
        setSettings((current) => {
          const soundMuted = !current.soundMuted;
          showAnnouncement(soundMuted ? 'Sound muted.' : 'Sound on.');
          return { ...current, soundMuted };
        });
      } else if (event.code === 'F3') {
        event.preventDefault();
        setDiagnostics((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [beginJourney, celebrationOpen, showAnnouncement, started, status]);

  useEffect(() => {
    if (!started || paused || fatalError !== null) {
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
      return;
    }
    if (
      objective.arrivalChimeActivated &&
      !objective.loomAwakened &&
      loomInteraction !== undefined &&
      loomDistance <= Math.max(loomInteraction.radiusMeters + 5, 8)
    ) {
      const hiddenShards = ARRIVAL_ECHO_SHARDS.length - objective.collectedEchoShards.length;
      setPrompt(
        objective.collectedEchoShards.length >= ARRIVAL_ECHO_SHARDS.length
          ? `E  ·  ${loomInteraction.prompt}`
          : `The Loom sleeps — ${String(hiddenShards)} Echo Shard${
              hiddenShards === 1 ? '' : 's'
            } still hidden.`,
      );
      return;
    }
    setPrompt(null);
  }, [fatalError, objective, paused, position, started]);

  const handleReady = useCallback((ready: SimulationReady): void => {
    simulationTickRateRef.current = ready.tickRate;
    setStatus('World ready');
  }, []);

  const handleSnapshot = useCallback(
    (snapshot: SimulationSnapshot): void => {
      const isInitialSnapshot = !initialSnapshotReceivedRef.current;
      initialSnapshotReceivedRef.current = true;
      setTick(snapshot.tick);
      setObjective(snapshot.objective);
      const player = snapshot.entities[0];
      if (player !== undefined) {
        setPosition({
          x: player.position.cellX * WORLD_CELL_SIZE + player.position.localX,
          y: player.position.y,
          z: player.position.cellZ * WORLD_CELL_SIZE + player.position.localZ,
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
          completedJourneyTimeRef.current = arrivalTimeMs;
        }
        previousLoomStateRef.current = true;
        arrivalTimerArmedRef.current = false;
        arrivalTimerActiveRef.current = false;
        if (!celebrationShownRef.current) {
          celebrationShownRef.current = true;
          setCelebrationOpen(true);
        }
      }

      const save: ArrivalSliceSave = {
        schemaVersion: 1,
        worldSeed: ARRIVAL_SLICE_SEED,
        arrivalChimeActivated: snapshot.objective.arrivalChimeActivated,
        loomAwakened: snapshot.objective.loomAwakened,
        optionalVistaFound: snapshot.objective.optionalVistaFound,
        collectedEchoShards: [...snapshot.objective.collectedEchoShards],
        checkpoint: snapshot.objective.checkpoint,
        ...(bestArrivalTimeRef.current === undefined
          ? {}
          : { bestArrivalTimeMs: bestArrivalTimeRef.current }),
      };
      const serialized = JSON.stringify(save);
      if (serialized !== lastSaveRef.current) {
        lastSaveRef.current = serialized;
        const persisted = persistArrivalSave(save);
        if (!isInitialSnapshot) {
          if (progressStatusTimeoutRef.current !== undefined) {
            window.clearTimeout(progressStatusTimeoutRef.current);
            progressStatusTimeoutRef.current = undefined;
          }
          setProgressPersistenceStatus(
            persisted ? 'Journey saved' : 'Progress kept for this session',
          );
          if (persisted) {
            progressStatusTimeoutRef.current = window.setTimeout(() => {
              setProgressPersistenceStatus('');
              progressStatusTimeoutRef.current = undefined;
            }, 1_600);
          }
        }
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
        showAnnouncement('The journey begins again at Arrival Shore.');
      }
    },
    [showAnnouncement],
  );

  const handleDurableEvent = useCallback(
    (event: DurableEvent): void => {
      const priority = event.eventType === 'checkpoint-reached' ? 0 : 1;
      const previousEvent = announcementEventRef.current;
      if (
        previousEvent !== null &&
        previousEvent.tick === event.tick &&
        previousEvent.priority > priority
      ) {
        return;
      }

      const audio = audioRef.current;
      let caption: string;
      switch (event.eventType) {
        case 'arrival-chime-activated':
          caption = 'The Chime answers. Ancient stones rise across the hollow.';
          audio?.playChimeActivation();
          break;
        case 'echo-shard-collected': {
          const collectedCount = Number(event.payload['collectedCount'] ?? 0);
          caption =
            collectedCount >= ARRIVAL_ECHO_SHARDS.length
              ? 'The third Echo Shard rings out. The Loom is waiting.'
              : `An Echo Shard joins you — ${String(collectedCount)} of ${String(
                  ARRIVAL_ECHO_SHARDS.length,
                )} resonate.`;
          audio?.playEchoShard(collectedCount);
          break;
        }
        case 'loom-awakened':
          caption = 'The three Shards ring as one. The Loom wakes and the Beacon answers.';
          audio?.playFinale();
          break;
        case 'optional-vista-found':
          caption = 'A hidden resonance joins your journey.';
          break;
        default:
          caption = 'A safe return point has been remembered.';
          break;
      }
      announcementEventRef.current = { tick: event.tick, priority };
      showAnnouncement(caption);
    },
    [showAnnouncement],
  );

  const handleError = useCallback(
    (error: SimulationError): void => {
      if (error.recoverable) {
        showAnnouncement(`The world recovered from an input problem: ${error.message}`);
      } else {
        setStarted(false);
        setPaused(false);
        setFatalError(error.message);
        setStatus('World unavailable');
      }
    },
    [showAnnouncement],
  );

  const handlePauseRequest = useCallback((): void => {
    setPaused(true);
  }, []);

  const restartJourney = (): void => {
    resetPendingRef.current = true;
    setResetSequence((value) => value + 1);
    setObjective(DEFAULT_OBJECTIVE);
    setPaused(false);
    setCelebrationOpen(false);
    setStarted(true);
    previousLoomStateRef.current = false;
    arrivalTimerArmedRef.current = true;
    arrivalTimerActiveRef.current = true;
    completedJourneyTimeRef.current = null;
    celebrationShownRef.current = false;
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
        createTransport={createTransport}
        onReady={handleReady}
        onSnapshot={handleSnapshot}
        onDurableEvent={handleDurableEvent}
        onError={handleError}
        onMetrics={setMetrics}
        onPauseRequest={handlePauseRequest}
        onCompassBearingChange={handleCompassBearingChange}
      />

      <p id={GAME_CONTROLS_DESCRIPTION_ID} className="screen-reader-only">
        Keyboard controls: press Enter to begin, W A S D to move, Shift to sprint, Space to jump, E
        to interact, Escape to pause, and F3 to toggle diagnostics. Click the game world to look
        with the mouse.
      </p>

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
            <div className="objective-heading">
              <span className="eyebrow">ARRIVAL SHORE</span>
              <span
                className="journey-timer"
                role="timer"
                aria-label={
                  completedJourneyTimeRef.current === null ? 'Journey time' : 'Final journey time'
                }
              >
                {formatDuration(journeyTimeMs)}
              </span>
            </div>
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
            <div
              className="shard-tracker"
              aria-label={`Echo Shards recovered: ${collectedShardCount.toString()} of 3`}
            >
              {ARRIVAL_ECHO_SHARDS.map((shard) => {
                const collected = objective.collectedEchoShards.includes(shard.key);
                return (
                  <span
                    key={shard.key}
                    className={collected ? 'shard-chip collected' : 'shard-chip'}
                    style={
                      collected
                        ? ({ '--shard-accent': shard.accentColor } as React.CSSProperties)
                        : undefined
                    }
                    title={
                      collected
                        ? `${shard.key} Echo Shard recovered`
                        : `Echo Shard hidden — ${shard.hint}`
                    }
                  >
                    ◇ {shard.key}
                  </span>
                );
              })}
            </div>
          </section>

          <div ref={setCompassRef} className="landmark-compass" aria-label="The Loom lies ahead">
            <span className="compass-needle" aria-hidden="true" />
            <span>THE LOOM</span>
          </div>

          <div className="crosshair" aria-hidden="true" />
          {prompt !== null ? (
            <div
              className={prompt.startsWith('E ') ? 'interaction-prompt' : 'interaction-prompt hint'}
            >
              {prompt}
            </div>
          ) : null}
          <div className="control-hint" aria-hidden="true">
            <span>WASD move</span>
            <span>Shift sprint</span>
            <span>Space jump</span>
            <span>Hold Space glide</span>
            <span>M sound</span>
            <span>F3 diagnostics</span>
          </div>
        </>
      ) : null}

      {started && celebrationOpen && !fatalError ? (
        <section className="celebration-card" aria-labelledby="celebration-title">
          <span className="eyebrow">THE BEACON ANSWERS</span>
          <h2 id="celebration-title">First Light restored</h2>
          <p>
            Three Shards, one Loom, and a sky that will not forget today. The Reach stays open —
            wander, or begin the journey anew.
          </p>
          <dl className="celebration-stats">
            <div>
              <dt>Journey time</dt>
              <dd>{formatDuration(completedJourneyTimeRef.current ?? journeyTimeMs)}</dd>
            </div>
            <div>
              <dt>Best time</dt>
              <dd>
                {bestArrivalTimeRef.current === undefined
                  ? '—'
                  : formatDuration(bestArrivalTimeRef.current)}
              </dd>
            </div>
            <div>
              <dt>Echo Shards</dt>
              <dd>3 / 3</dd>
            </div>
          </dl>
          <button
            className="text-button compact"
            type="button"
            onClick={() => {
              setCelebrationOpen(false);
            }}
          >
            Keep exploring
          </button>
        </section>
      ) : null}

      {!started && fatalError === null ? (
        <section className="arrival-card" aria-labelledby="arrival-title">
          <span className="eyebrow">RESONANCE REACH · PROTOTYPE 01</span>
          <h1 id="arrival-title">First Light at the Loom</h1>
          <p>
            The island has been quiet for generations. Follow the answering light, wake the three
            Echo Shards hidden across the shore, and give the sleeping Loom its voice back.
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
            <span>Glide across the Reach</span>
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
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return;
            const focusableElements = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled)',
              ),
            );
            const firstElement = focusableElements[0];
            const lastElement = focusableElements.at(-1);
            if (firstElement === undefined || lastElement === undefined) return;

            if (event.shiftKey && document.activeElement === firstElement) {
              event.preventDefault();
              lastElement.focus();
            } else if (!event.shiftKey && document.activeElement === lastElement) {
              event.preventDefault();
              firstElement.focus();
            }
          }}
        >
          <span className="eyebrow">THE WORLD IS WAITING</span>
          <h2 id="pause-title">Paused</h2>
          <button
            ref={pauseResumeButtonRef}
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
          <label className="setting-row">
            <span>
              <strong>Sound</strong>
              <small>Synthesized ambience and resonance cues (M)</small>
            </span>
            <input
              type="checkbox"
              checked={!settings.soundMuted}
              onChange={(event) => {
                setSettings((current) => ({ ...current, soundMuted: !event.target.checked }));
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
            ref={fatalRetryButtonRef}
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
            <span>echo shards</span>
            <strong>
              {objective.collectedEchoShards.length} / {ARRIVAL_ECHO_SHARDS.length}
            </strong>
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
        {visiblePersistenceStatus}
      </div>
    </main>
  );
}
