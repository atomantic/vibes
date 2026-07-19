import { describe, expect, it } from 'vitest';

import { InputButton, type InputFrame } from './messages';
import { decodeInputFrame, encodeInputFrame, inputFrameByteLength } from './realtimeCodec';

const validFrame: InputFrame = {
  sequence: 42,
  intendedTick: 91,
  moveX: -0.5,
  moveZ: 0.75,
  lookYaw: 1.25,
  lookPitch: -0.2,
  buttons: InputButton.Jump | InputButton.Sprint,
};

describe('realtime input codec', () => {
  it('round-trips a bounded input frame', () => {
    const encoded = encodeInputFrame(validFrame);
    const decoded = decodeInputFrame(encoded);

    expect(encoded.byteLength).toBe(inputFrameByteLength);
    expect(decoded.sequence).toBe(validFrame.sequence);
    expect(decoded.intendedTick).toBe(validFrame.intendedTick);
    expect(decoded.moveX).toBeCloseTo(validFrame.moveX, 4);
    expect(decoded.moveZ).toBeCloseTo(validFrame.moveZ, 4);
    expect(decoded.lookYaw).toBeCloseTo(validFrame.lookYaw, 5);
    expect(decoded.lookPitch).toBeCloseTo(validFrame.lookPitch, 5);
    expect(decoded.buttons).toBe(validFrame.buttons);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.01])(
    'rejects an unsafe movement value %s',
    (moveX) => {
      expect(() => encodeInputFrame({ ...validFrame, moveX })).toThrow(RangeError);
    },
  );

  it('rejects truncated and wrong-version frames', () => {
    expect(() => decodeInputFrame(new ArrayBuffer(inputFrameByteLength - 1))).toThrow(RangeError);

    const wrongVersion = encodeInputFrame(validFrame);
    new DataView(wrongVersion).setUint8(4, 99);
    expect(() => decodeInputFrame(wrongVersion)).toThrow(/protocol major/);
  });

  it('rejects unknown button flags', () => {
    expect(() => encodeInputFrame({ ...validFrame, buttons: 1 << 8 })).toThrow(/unknown flag/);
  });
});
