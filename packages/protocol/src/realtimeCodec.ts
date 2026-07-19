import type { InputFrame } from './messages';
import { PROTOCOL_VERSION } from './version';

const MAGIC = 0x5649_4245;
const MESSAGE_KIND_INPUT = 1;
const BYTE_LENGTH = 32;
const LITTLE_ENDIAN = true;
const MOVEMENT_SCALE = 32_767;
const KNOWN_BUTTONS_MASK = 0b1111;

function assertUint32(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${name} must be an unsigned 32-bit integer`);
  }
}

function assertFiniteRange(value: number, name: string, minimum: number, maximum: number): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${name} must be finite and between ${String(minimum)} and ${String(maximum)}`,
    );
  }
}

export function encodeInputFrame(input: InputFrame): ArrayBuffer {
  assertUint32(input.sequence, 'sequence');
  assertUint32(input.intendedTick, 'intendedTick');
  assertFiniteRange(input.moveX, 'moveX', -1, 1);
  assertFiniteRange(input.moveZ, 'moveZ', -1, 1);
  assertFiniteRange(input.lookYaw, 'lookYaw', -Math.PI, Math.PI);
  assertFiniteRange(input.lookPitch, 'lookPitch', -1.4, 1.4);
  if (
    !Number.isInteger(input.buttons) ||
    input.buttons < 0 ||
    (input.buttons & ~KNOWN_BUTTONS_MASK) !== 0
  ) {
    throw new RangeError('buttons contains an unknown flag');
  }

  const buffer = new ArrayBuffer(BYTE_LENGTH);
  const view = new DataView(buffer);
  view.setUint32(0, MAGIC, LITTLE_ENDIAN);
  view.setUint8(4, PROTOCOL_VERSION.major);
  view.setUint8(5, MESSAGE_KIND_INPUT);
  view.setUint16(6, input.buttons, LITTLE_ENDIAN);
  view.setUint32(8, input.sequence, LITTLE_ENDIAN);
  view.setUint32(12, input.intendedTick, LITTLE_ENDIAN);
  view.setInt16(16, Math.round(input.moveX * MOVEMENT_SCALE), LITTLE_ENDIAN);
  view.setInt16(18, Math.round(input.moveZ * MOVEMENT_SCALE), LITTLE_ENDIAN);
  view.setFloat32(20, input.lookYaw, LITTLE_ENDIAN);
  view.setFloat32(24, input.lookPitch, LITTLE_ENDIAN);
  view.setUint32(28, 0, LITTLE_ENDIAN);
  return buffer;
}

export function decodeInputFrame(buffer: ArrayBuffer): InputFrame {
  if (buffer.byteLength !== BYTE_LENGTH) {
    throw new RangeError(`input frame must be exactly ${String(BYTE_LENGTH)} bytes`);
  }

  const view = new DataView(buffer);
  if (view.getUint32(0, LITTLE_ENDIAN) !== MAGIC) {
    throw new Error('input frame magic does not match');
  }
  if (view.getUint8(4) !== PROTOCOL_VERSION.major) {
    throw new Error('input frame protocol major does not match');
  }
  if (view.getUint8(5) !== MESSAGE_KIND_INPUT) {
    throw new Error('buffer is not an input frame');
  }
  if (view.getUint32(28, LITTLE_ENDIAN) !== 0) {
    throw new Error('input frame reserved bytes must be zero');
  }

  const buttons = view.getUint16(6, LITTLE_ENDIAN);
  if ((buttons & ~KNOWN_BUTTONS_MASK) !== 0) {
    throw new Error('input frame contains unknown button flags');
  }

  const decoded: InputFrame = {
    sequence: view.getUint32(8, LITTLE_ENDIAN),
    intendedTick: view.getUint32(12, LITTLE_ENDIAN),
    moveX: view.getInt16(16, LITTLE_ENDIAN) / MOVEMENT_SCALE,
    moveZ: view.getInt16(18, LITTLE_ENDIAN) / MOVEMENT_SCALE,
    lookYaw: view.getFloat32(20, LITTLE_ENDIAN),
    lookPitch: view.getFloat32(24, LITTLE_ENDIAN),
    buttons,
  };

  assertFiniteRange(decoded.lookYaw, 'lookYaw', -Math.PI, Math.PI);
  assertFiniteRange(decoded.lookPitch, 'lookPitch', -1.4, 1.4);
  return decoded;
}

export const inputFrameByteLength = BYTE_LENGTH;
