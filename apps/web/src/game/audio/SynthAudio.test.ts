import { afterEach, describe, expect, it, vi } from 'vitest';

import { SynthAudio } from './SynthAudio';

class FakeParam {
  value = 0;

  cancelScheduledValues(): void {
    void this;
  }

  exponentialRampToValueAtTime(): void {
    void this;
  }

  linearRampToValueAtTime(): void {
    void this;
  }

  setValueAtTime(): void {
    void this;
  }
}

class FakeNode {
  connect<T>(node: T): T {
    return node;
  }
}

class FakeOscillator extends FakeNode {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam();
  readonly detune = new FakeParam();
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

class FakeBiquadFilter extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
}

class FakeBufferSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  readonly start = vi.fn();
}

let resolveResume: (() => void) | undefined;

class FakeAudioContext {
  static latest: FakeAudioContext | undefined;
  state: AudioContextState = 'suspended';
  readonly destination = new FakeNode();
  readonly sampleRate = 100;
  readonly currentTime = 0;
  readonly oscillators: FakeOscillator[] = [];
  readonly resume = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveResume = () => {
          this.state = 'running';
          resolve();
        };
      }),
  );

  constructor() {
    FakeAudioContext.latest = this;
  }

  createGain(): FakeNode & { readonly gain: FakeParam } {
    return Object.assign(new FakeNode(), { gain: new FakeParam() });
  }

  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createBuffer(_channels: number, length: number): AudioBuffer {
    return {
      getChannelData: () => new Float32Array(length),
    } as unknown as AudioBuffer;
  }

  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource();
  }

  createBiquadFilter(): FakeBiquadFilter {
    return new FakeBiquadFilter();
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
}

afterEach(() => {
  resolveResume = undefined;
  FakeAudioContext.latest = undefined;
  vi.unstubAllGlobals();
});

describe('SynthAudio', () => {
  it('is safe when Web Audio is unavailable', async () => {
    vi.stubGlobal('window', {});
    const audio = new SynthAudio();

    await audio.unlock();
    audio.startAmbient();
    audio.dispose();
  });

  it('starts ambient voices only after the audio context is running', async () => {
    vi.stubGlobal('window', {
      AudioContext: FakeAudioContext as unknown as typeof AudioContext,
    });
    const audio = new SynthAudio();

    const unlocking = audio.unlock();
    const context = FakeAudioContext.latest;
    expect(context).toBeDefined();
    expect(context?.resume).toHaveBeenCalledOnce();

    audio.startAmbient();
    expect(context?.oscillators).toHaveLength(0);

    resolveResume?.();
    await unlocking;
    audio.startAmbient();
    audio.startAmbient();
    expect(context?.oscillators).toHaveLength(3);
    audio.dispose();
  });
});
