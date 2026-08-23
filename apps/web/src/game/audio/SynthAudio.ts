const MASTER_GAIN = 0.5;
const AMBIENT_GAIN = 0.05;
const WIND_GAIN = 0.035;
const WIND_FILTER_HERTZ = 420;
const WIND_LFO_HERTZ = 0.07;

type AudioContextConstructor = new () => AudioContext;

function resolveAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const standard = window.AudioContext as unknown as AudioContextConstructor | undefined;
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextConstructor })
    .webkitAudioContext;
  const candidate = standard ?? legacy;
  return typeof candidate === 'function' ? candidate : null;
}

/**
 * Tiny synthesized soundscape for the Arrival slice. Every voice is generated
 * with oscillators and filtered noise so the game ships zero audio assets, and
 * every method is a safe no-op when the Web Audio API is unavailable.
 */
export class SynthAudio {
  #context: AudioContext | null = null;
  #master: GainNode | null = null;
  #muted = false;
  #disposed = false;
  #ambientStarted = false;

  async unlock(): Promise<void> {
    if (this.#disposed) return;
    if (this.#context === null) {
      const ContextConstructor = resolveAudioContextConstructor();
      if (ContextConstructor === null) return;
      try {
        this.#context = new ContextConstructor();
        this.#master = this.#context.createGain();
        this.#master.gain.value = this.#muted ? 0 : MASTER_GAIN;
        this.#master.connect(this.#context.destination);
      } catch {
        this.#context = null;
        this.#master = null;
        return;
      }
    }

    const context = this.#context;
    if (context.state === 'running') return;
    try {
      await context.resume();
    } catch {
      // Autoplay policies may hold the context suspended until a later
      // gesture; a later unlock attempt can retry the resume.
    }
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;
    const master = this.#master;
    const context = this.#context;
    if (master === null || context === null) return;
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.linearRampToValueAtTime(muted ? 0 : MASTER_GAIN, now + 0.12);
  }

  startAmbient(): void {
    const context = this.#context;
    const master = this.#master;
    if (this.#ambientStarted || context === null || master === null || context.state !== 'running')
      return;

    const ambientGain = context.createGain();
    ambientGain.gain.value = AMBIENT_GAIN;
    ambientGain.connect(master);

    for (const frequency of [110, 164.81]) {
      const drone = context.createOscillator();
      drone.type = 'triangle';
      drone.frequency.value = frequency;
      drone.detune.value = frequency === 110 ? -4 : 5;
      const droneGain = context.createGain();
      droneGain.gain.value = 0.6;
      drone.connect(droneGain).connect(ambientGain);
      drone.start();
    }

    const windSeconds = 3;
    const noiseBuffer = context.createBuffer(
      1,
      context.sampleRate * windSeconds,
      context.sampleRate,
    );
    const samples = noiseBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.random() * 2 - 1;
    }
    const wind = context.createBufferSource();
    wind.buffer = noiseBuffer;
    wind.loop = true;
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = WIND_FILTER_HERTZ;
    windFilter.Q.value = 0.8;
    const windGain = context.createGain();
    windGain.gain.value = WIND_GAIN;
    const windLfo = context.createOscillator();
    windLfo.frequency.value = WIND_LFO_HERTZ;
    const windLfoGain = context.createGain();
    windLfoGain.gain.value = WIND_FILTER_HERTZ * 0.45;
    windLfo.connect(windLfoGain).connect(windFilter.frequency);
    wind.connect(windFilter).connect(windGain).connect(master);
    wind.start();
    windLfo.start();
    this.#ambientStarted = true;
  }

  playChimeActivation(): void {
    this.#playArpeggio([523.25, 659.25, 783.99, 1046.5], 0.16, 0.09, 'sine');
  }

  playEchoShard(count: number): void {
    const step = Math.min(Math.max(count, 1), 3);
    const base = 587.33 * Math.pow(1.122, step - 1);
    this.#playBell(base, 1.1);
    this.#playBell(base * 1.5, 0.7, 0.05);
  }

  playFinale(): void {
    this.#playChord([130.81, 196, 261.63, 329.63, 392], 3.4, 0.11);
    this.#playArpeggio([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.22, 0.07, 'triangle');
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    void this.#context?.close().catch(() => {
      // Closing an already-interrupted context is harmless.
    });
    this.#context = null;
    this.#master = null;
    this.#ambientStarted = false;
  }

  #playBell(frequencyHertz: number, durationSeconds: number, level = 0.14): void {
    const context = this.#context;
    const master = this.#master;
    if (context === null || master === null || context.state !== 'running') return;
    const now = context.currentTime;

    const partials: readonly [number, number][] = [
      [1, 1],
      [2.76, 0.35],
    ];
    for (const [multiple, amplitude] of partials) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequencyHertz * multiple;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(level * amplitude, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
      oscillator.connect(gain).connect(master);
      oscillator.start(now);
      oscillator.stop(now + durationSeconds + 0.05);
    }
  }

  #playArpeggio(
    frequencies: readonly number[],
    noteGapSeconds: number,
    level: number,
    type: OscillatorType,
  ): void {
    const context = this.#context;
    const master = this.#master;
    if (context === null || master === null || context.state !== 'running') return;

    frequencies.forEach((frequency, index) => {
      const start = context.currentTime + index * noteGapSeconds;
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + noteGapSeconds * 3);
      oscillator.connect(gain).connect(master);
      oscillator.start(start);
      oscillator.stop(start + noteGapSeconds * 3 + 0.05);
    });
  }

  #playChord(frequencies: readonly number[], durationSeconds: number, level: number): void {
    const context = this.#context;
    const master = this.#master;
    if (context === null || master === null || context.state !== 'running') return;
    const now = context.currentTime;

    for (const frequency of frequencies) {
      const oscillator = context.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(level, now + 0.6);
      gain.gain.setValueAtTime(level, now + durationSeconds * 0.55);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
      oscillator.connect(gain).connect(master);
      oscillator.start(now);
      oscillator.stop(now + durationSeconds + 0.05);
    }
  }
}
