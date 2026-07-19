import type { Vec2 } from './types.js';

export const ARRIVAL_TERRAIN_SEED = 0x56494245;
export const ARRIVAL_TERRAIN_CELL_SIZE_METERS = 2.5;
export const ARRIVAL_TERRAIN_SIZE = {
  widthMeters: 160,
  depthMeters: 165,
} as const;
export const ARRIVAL_TERRAIN_ORIGIN = {
  x: -ARRIVAL_TERRAIN_SIZE.widthMeters / 2,
  z: -24.5,
} as const;
export const ARRIVAL_TERRAIN_RESOLUTION = {
  columns: ARRIVAL_TERRAIN_SIZE.widthMeters / ARRIVAL_TERRAIN_CELL_SIZE_METERS + 1,
  rows: ARRIVAL_TERRAIN_SIZE.depthMeters / ARRIVAL_TERRAIN_CELL_SIZE_METERS + 1,
} as const;

interface GroundPathPoint extends Vec2 {
  readonly height: number;
}

// The route is data rather than renderer geometry so every consumer flattens
// the same corridor through the deterministic height field.
const GROUND_PATH = [
  { x: 0, y: 112, height: 0.75 },
  { x: -2, y: 96, height: 1.35 },
  { x: 5, y: 78, height: 4.4 },
  { x: 9, y: 70, height: 5.45 },
  { x: 0, y: 56, height: 10.35 },
  { x: 4, y: 37, height: 9.45 },
  { x: 3, y: 34, height: 9.65 },
  { x: 1, y: 16, height: 10.15 },
  { x: 0, y: 0, height: 10.45 },
] as const satisfies readonly [GroundPathPoint, GroundPathPoint, ...GroundPathPoint[]];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function smoothstep01(value: number): number {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
}

function hashGridPoint(x: number, z: number): number {
  let value = Math.imul(x, 0x1f12_3bb5) ^ Math.imul(z, 0x5f35_6495) ^ ARRIVAL_TERRAIN_SEED;
  value = Math.imul(value ^ (value >>> 16), 0x45d9_f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9_f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffff_ffff;
}

function valueNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const xBlend = smoothstep01(x - x0);
  const zBlend = smoothstep01(z - z0);
  const north = lerp(hashGridPoint(x0, z0), hashGridPoint(x0 + 1, z0), xBlend);
  const south = lerp(hashGridPoint(x0, z0 + 1), hashGridPoint(x0 + 1, z0 + 1), xBlend);
  return lerp(north, south, zBlend);
}

function fractalNoise(x: number, z: number): number {
  let amplitude = 0.5;
  let frequency = 0.028;
  let sum = 0;
  let normalization = 0;

  for (let octave = 0; octave < 4; octave += 1) {
    sum += valueNoise(x * frequency, z * frequency) * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return sum / normalization;
}

function nearestGroundPath(
  x: number,
  z: number,
): {
  readonly distance: number;
  readonly height: number;
} {
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  let nearestHeight: number = GROUND_PATH[0].height;
  let start: GroundPathPoint = GROUND_PATH[0];

  for (const end of GROUND_PATH.slice(1)) {
    const deltaX = end.x - start.x;
    const deltaZ = end.y - start.y;
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    const projection = ((x - start.x) * deltaX + (z - start.y) * deltaZ) / lengthSquared;
    const amount = clamp01(projection);
    const closestX = lerp(start.x, end.x, amount);
    const closestZ = lerp(start.y, end.y, amount);
    const distanceX = x - closestX;
    const distanceZ = z - closestZ;
    const distanceSquared = distanceX * distanceX + distanceZ * distanceZ;

    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared;
      nearestHeight = lerp(start.height, end.height, amount);
    }

    start = end;
  }

  return {
    distance: Math.sqrt(nearestDistanceSquared),
    height: nearestHeight,
  };
}

/**
 * Returns the canonical ground height, in meters, for an Arrival slice world
 * coordinate. It is pure and deterministic across browser and Node runtimes.
 * Render and collision meshes must sample this same function and grid.
 */
export function arrivalTerrainHeight(x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new RangeError('Arrival terrain coordinates must be finite numbers.');
  }

  const northwardProgress = smoothstep01((112 - z) / 112);
  const baseHeight = lerp(0.7, 10.4, northwardProgress);
  const terrainNoise = (fractalNoise(x, z) * 2 - 1) * (0.65 + northwardProgress);
  const cliffRise = smoothstep01((Math.abs(x) - 24) / 48) * 4.5;
  let height = baseHeight + terrainNoise + cliffRise;

  const path = nearestGroundPath(x, z);
  const pathBlend = 1 - smoothstep01((path.distance - 3) / 7);
  height = lerp(height, path.height, pathBlend);

  // The only break in the flattened route is the authored crossing gap. Its
  // traversable surface comes from the deterministic crossing segment data.
  const crossingDistance = Math.sqrt(
    (x / 6.5) * (x / 6.5) + ((z - 25.5) / 9.5) * ((z - 25.5) / 9.5),
  );
  const crossingCarve = 1 - smoothstep01((crossingDistance - 0.72) / 0.25);
  const carvedHeight = 4.4 + (fractalNoise(x + 31, z - 17) - 0.5) * 0.35;
  height = lerp(height, carvedHeight, crossingCarve);

  // Quantization removes insignificant floating-point drift when the same
  // samples are serialized by different runtimes.
  return Math.round(height * 10_000) / 10_000;
}
