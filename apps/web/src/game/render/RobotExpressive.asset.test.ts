/// <reference types="node" />

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const EXPECTED_BYTES = 463_988;
const EXPECTED_SHA256 = '047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319';
const GLTF_BINARY_MAGIC = 0x4654_6c67;

describe('RobotExpressive asset', () => {
  it('matches the audited CC0 upstream binary', () => {
    const model = readFileSync(
      new URL('../../../public/models/RobotExpressive.glb', import.meta.url),
    );

    expect(model.byteLength).toBe(EXPECTED_BYTES);
    expect(model.readUInt32LE(0)).toBe(GLTF_BINARY_MAGIC);
    expect(model.readUInt32LE(4)).toBe(2);
    expect(createHash('sha256').update(model).digest('hex')).toBe(EXPECTED_SHA256);
  });
});
