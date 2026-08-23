import type {
  ArrivalSliceDefinition,
  ArrivalSliceStateKey,
  SeededRandomStream,
  StableWorldId,
  Vec3,
  WorldAnchorDescriptor,
} from './types.js';
import {
  ARRIVAL_TERRAIN_CELL_SIZE_METERS,
  ARRIVAL_TERRAIN_ORIGIN,
  ARRIVAL_TERRAIN_SEED,
  ARRIVAL_TERRAIN_SIZE,
} from './terrain.js';

export const ARRIVAL_SLICE_SCHEMA_VERSION = 1 as const;
export const ARRIVAL_SLICE_SEED = ARRIVAL_TERRAIN_SEED;

export const ARRIVAL_SLICE_IDS = {
  world: 'world.resonance-reach.arrival-to-loom.v1',
  arrivalShore: 'landmark.arrival-shore',
  arrivalSpawn: 'spawn.arrival-shore',
  optionalVista: 'landmark.arrival-shore.tidepool-vista',
  mantleLedge: 'landmark.arrival-shore.mantle-ledge',
  revealRidge: 'checkpoint.arrival-shore.reveal-ridge',
  arrivalChime: 'interaction.arrival-chime',
  crossing: 'mechanism.arrival-crossing',
  crossingSegmentNear: 'mechanism.arrival-crossing.segment-near',
  crossingSegmentMiddle: 'mechanism.arrival-crossing.segment-middle',
  crossingSegmentFar: 'mechanism.arrival-crossing.segment-far',
  loom: 'landmark.loom',
  loomSocketMurmurwood: 'landmark.loom.socket-murmurwood',
  loomSocketWhistling: 'landmark.loom.socket-whistling',
  loomSocketStormglass: 'landmark.loom.socket-stormglass',
  murmurwoodSilhouette: 'silhouette.murmurwood-basin',
  whistlingSilhouette: 'silhouette.whistling-cut',
  stormglassSilhouette: 'silhouette.stormglass-aerie',
  beaconSilhouette: 'silhouette.beacon-overlook',
  routeShore: 'route.arrival.shore',
  routeMantle: 'route.arrival.mantle',
  routeReveal: 'route.arrival.reveal',
  routeChime: 'route.arrival.chime',
  routeCrossing: 'route.arrival.crossing',
  routeLoom: 'route.arrival.loom',
  contentArrivalShore: 'content.arrival-shore',
  contentArrivalShoreRock: 'content.arrival-shore.scatter.rock',
  contentArrivalShoreCoral: 'content.arrival-shore.scatter.coral',
  contentArrivalShoreReed: 'content.arrival-shore.scatter.reed',
  contentArrivalShoreGrass: 'content.arrival-shore.scatter.grass',
  contentArrivalChime: 'content.arrival-chime',
  contentCrossing: 'content.arrival-crossing',
  contentLoom: 'content.loom',
  contentMurmurwoodSilhouette: 'content.silhouette.murmurwood-basin',
  contentWhistlingSilhouette: 'content.silhouette.whistling-cut',
  contentStormglassSilhouette: 'content.silhouette.stormglass-aerie',
  contentBeaconSilhouette: 'content.silhouette.beacon-overlook',
} as const;

export type ArrivalSliceId = (typeof ARRIVAL_SLICE_IDS)[keyof typeof ARRIVAL_SLICE_IDS];

export type EchoShardKey = 'tidepool' | 'ledge' | 'pond';

export interface EchoShardDescriptor {
  readonly key: EchoShardKey;
  readonly id: StableWorldId;
  /** Hover anchor in world space; renderers bob around this height. */
  readonly position: Vec3;
  readonly accentColor: `#${string}`;
  readonly hint: string;
}

/**
 * Three durable Echo Shards hidden across Arrival Shore. Collecting all three
 * is required before the Loom will awaken, which turns the island's optional
 * landmarks into a purposeful exploration loop.
 */
export const ARRIVAL_ECHO_SHARDS = [
  {
    key: 'tidepool',
    id: 'collectible.echo-shard.tidepool',
    position: { x: -20, y: 3.9, z: 82 },
    accentColor: '#63f2db',
    hint: 'Where the tidepools catch the light.',
  },
  {
    key: 'ledge',
    id: 'collectible.echo-shard.ledge',
    position: { x: 12.5, y: 6.9, z: 66 },
    accentColor: '#f3b562',
    hint: 'High beside the mantle ledge.',
  },
  {
    key: 'pond',
    id: 'collectible.echo-shard.pond',
    position: { x: 11, y: 1.65, z: 104 },
    accentColor: '#9873b9',
    hint: 'Wading water keeps it company.',
  },
] as const satisfies readonly EchoShardDescriptor[];

export const ARRIVAL_ECHO_SHARDS_REQUIRED = ARRIVAL_ECHO_SHARDS.length;

export const ARRIVAL_SLICE_POSITIONS = {
  arrivalShore: { x: 0, y: 2, z: 100 },
  arrivalSpawn: { x: 0, y: 2, z: 112 },
  optionalVista: { x: -20, y: 3, z: 82 },
  mantleLedge: { x: 9, y: 7, z: 70 },
  revealRidge: { x: 0, y: 12, z: 56 },
  arrivalChime: { x: 4, y: 11, z: 37 },
  crossing: { x: 1, y: 10.5, z: 25.5 },
  loom: { x: 0, y: 12, z: 0 },
  murmurwoodSilhouette: { x: -115, y: 20, z: -90 },
  whistlingSilhouette: { x: 125, y: 28, z: -80 },
  stormglassSilhouette: { x: 0, y: 105, z: -175 },
  beaconSilhouette: { x: -95, y: 82, z: -235 },
} as const satisfies Readonly<Record<string, Vec3>>;

const PALETTE = {
  shore: {
    primary: '#D7B98C',
    secondary: '#F07F6D',
    accent: '#63F2DB',
    shadow: '#174C52',
  },
  chime: {
    primary: '#A87868',
    secondary: '#5D6F73',
    accent: '#63F2DB',
    shadow: '#174C52',
  },
  crossing: {
    primary: '#A87868',
    secondary: '#5D6F73',
    accent: '#F07F6D',
    shadow: '#174C52',
  },
  loom: {
    primary: '#A87868',
    secondary: '#5D6F73',
    accent: '#63F2DB',
    shadow: '#174C52',
  },
  murmurwood: {
    primary: '#315B49',
    secondary: '#173F43',
    accent: '#9873B9',
    shadow: '#102D32',
  },
  whistling: {
    primary: '#BE8A54',
    secondary: '#D6C58D',
    accent: '#57C9C0',
    shadow: '#4D4B42',
  },
  stormglass: {
    primary: '#6F7F89',
    secondary: '#DDE4DF',
    accent: '#D99B54',
    shadow: '#33464F',
  },
  beacon: {
    primary: '#7E716C',
    secondary: '#DDE4DF',
    accent: '#F3B562',
    shadow: '#354C54',
  },
} as const;

const CROSSING_SEGMENTS = [
  {
    id: ARRIVAL_SLICE_IDS.crossingSegmentNear,
    order: 0,
    inactivePosition: { x: 1.2, y: 8.7, z: 31 },
    activePosition: { x: 1.2, y: 9.7, z: 31 },
    sizeMeters: { x: 4.8, y: 1, z: 3.8 },
    activationDelayMs: 0,
  },
  {
    id: ARRIVAL_SLICE_IDS.crossingSegmentMiddle,
    order: 1,
    inactivePosition: { x: -0.8, y: 8.2, z: 25.5 },
    activePosition: { x: -0.8, y: 9.7, z: 25.5 },
    sizeMeters: { x: 4.8, y: 1, z: 3.8 },
    activationDelayMs: 180,
  },
  {
    id: ARRIVAL_SLICE_IDS.crossingSegmentFar,
    order: 2,
    inactivePosition: { x: 0.6, y: 8.6, z: 20 },
    activePosition: { x: 0.6, y: 9.7, z: 20 },
    sizeMeters: { x: 4.8, y: 1, z: 3.8 },
    activationDelayMs: 360,
  },
] as const;

export const ARRIVAL_SLICE_CONTENT = {
  arrivalShore: {
    id: ARRIVAL_SLICE_IDS.contentArrivalShore,
    anchorId: ARRIVAL_SLICE_IDS.arrivalShore,
    generator: 'arrival-shore-heightfield',
    seedOffset: 11,
    extentMeters: {
      x: ARRIVAL_TERRAIN_SIZE.widthMeters,
      y: ARRIVAL_TERRAIN_SIZE.depthMeters,
    },
    cellSizeMeters: ARRIVAL_TERRAIN_CELL_SIZE_METERS,
    waterLevelMeters: 0,
    palette: PALETTE.shore,
    scatter: [
      {
        id: ARRIVAL_SLICE_IDS.contentArrivalShoreRock,
        archetype: 'rock',
        count: 56,
        seedOffset: 101,
        radiusMeters: 72,
        minimumScale: 0.55,
        maximumScale: 3.4,
      },
      {
        id: ARRIVAL_SLICE_IDS.contentArrivalShoreCoral,
        archetype: 'coral',
        count: 84,
        seedOffset: 211,
        radiusMeters: 58,
        minimumScale: 0.35,
        maximumScale: 1.8,
      },
      {
        id: ARRIVAL_SLICE_IDS.contentArrivalShoreReed,
        archetype: 'reed',
        count: 260,
        seedOffset: 307,
        radiusMeters: 68,
        minimumScale: 0.7,
        maximumScale: 1.45,
      },
      {
        id: ARRIVAL_SLICE_IDS.contentArrivalShoreGrass,
        archetype: 'grass',
        count: 420,
        seedOffset: 401,
        radiusMeters: 78,
        minimumScale: 0.65,
        maximumScale: 1.4,
      },
    ],
    guidance: ['loom-silhouette', 'resonance-ribbon', 'path-value-contrast', 'wind-direction'],
  },
  arrivalChime: {
    id: ARRIVAL_SLICE_IDS.contentArrivalChime,
    anchorId: ARRIVAL_SLICE_IDS.arrivalChime,
    generator: 'arrival-chime-assembly',
    seedOffset: 503,
    footprintRadiusMeters: 2.25,
    heightMeters: 4.5,
    pulseDurationMs: 1_200,
    palette: PALETTE.chime,
    energyTargetAnchorId: ARRIVAL_SLICE_IDS.loom,
  },
  crossing: {
    id: ARRIVAL_SLICE_IDS.contentCrossing,
    anchorId: ARRIVAL_SLICE_IDS.crossing,
    generator: 'rising-stone-crossing',
    seedOffset: 607,
    activationDurationMs: 1_200,
    segments: CROSSING_SEGMENTS,
    failureRecoveryCheckpoint: 'ridge',
    palette: PALETTE.crossing,
  },
  loom: {
    id: ARRIVAL_SLICE_IDS.contentLoom,
    anchorId: ARRIVAL_SLICE_IDS.loom,
    generator: 'loom-ring-assembly',
    seedOffset: 709,
    platformRadiusMeters: 16,
    platformHeightMeters: 0.6,
    platformCenterOffsetYMeters: 0.2,
    platformSides: 12,
    ringCount: 3,
    ringDiameterMeters: 10,
    ringThicknessMeters: 0.28,
    activationDurationMs: 4_000,
    sockets: [
      {
        id: ARRIVAL_SLICE_IDS.loomSocketMurmurwood,
        index: 0,
        position: { x: -4.76, y: 12.5, z: 2.75 },
      },
      {
        id: ARRIVAL_SLICE_IDS.loomSocketWhistling,
        index: 1,
        position: { x: 4.76, y: 12.5, z: 2.75 },
      },
      {
        id: ARRIVAL_SLICE_IDS.loomSocketStormglass,
        index: 2,
        position: { x: 0, y: 12.5, z: -5.5 },
      },
    ],
    palette: PALETTE.loom,
  },
  distantSilhouettes: [
    {
      id: ARRIVAL_SLICE_IDS.contentMurmurwoodSilhouette,
      anchorId: ARRIVAL_SLICE_IDS.murmurwoodSilhouette,
      generator: 'distant-silhouette',
      seedOffset: 811,
      archetype: 'forest-basin',
      scale: { x: 72, y: 30, z: 52 },
      palette: PALETTE.murmurwood,
      visibleFromAnchorIds: [
        ARRIVAL_SLICE_IDS.arrivalSpawn,
        ARRIVAL_SLICE_IDS.revealRidge,
        ARRIVAL_SLICE_IDS.loom,
      ],
    },
    {
      id: ARRIVAL_SLICE_IDS.contentWhistlingSilhouette,
      anchorId: ARRIVAL_SLICE_IDS.whistlingSilhouette,
      generator: 'distant-silhouette',
      seedOffset: 907,
      archetype: 'wind-canyon',
      scale: { x: 78, y: 42, z: 58 },
      palette: PALETTE.whistling,
      visibleFromAnchorIds: [
        ARRIVAL_SLICE_IDS.arrivalSpawn,
        ARRIVAL_SLICE_IDS.revealRidge,
        ARRIVAL_SLICE_IDS.loom,
      ],
    },
    {
      id: ARRIVAL_SLICE_IDS.contentStormglassSilhouette,
      anchorId: ARRIVAL_SLICE_IDS.stormglassSilhouette,
      generator: 'distant-silhouette',
      seedOffset: 1_009,
      archetype: 'sky-ruin',
      scale: { x: 58, y: 68, z: 42 },
      palette: PALETTE.stormglass,
      visibleFromAnchorIds: [
        ARRIVAL_SLICE_IDS.arrivalSpawn,
        ARRIVAL_SLICE_IDS.revealRidge,
        ARRIVAL_SLICE_IDS.loom,
      ],
    },
    {
      id: ARRIVAL_SLICE_IDS.contentBeaconSilhouette,
      anchorId: ARRIVAL_SLICE_IDS.beaconSilhouette,
      generator: 'distant-silhouette',
      seedOffset: 1_103,
      archetype: 'beacon-spire',
      scale: { x: 26, y: 62, z: 26 },
      palette: PALETTE.beacon,
      visibleFromAnchorIds: [ARRIVAL_SLICE_IDS.revealRidge, ARRIVAL_SLICE_IDS.loom],
    },
  ],
} as const satisfies ArrivalSliceDefinition['content'];

const ANCHORS = [
  {
    id: ARRIVAL_SLICE_IDS.arrivalShore,
    label: 'Arrival Shore',
    kind: 'landmark',
    position: ARRIVAL_SLICE_POSITIONS.arrivalShore,
    spatialRole: 'playable',
    orientationDegrees: 180,
  },
  {
    id: ARRIVAL_SLICE_IDS.arrivalSpawn,
    label: 'Arrival Shore spawn',
    kind: 'spawn',
    position: ARRIVAL_SLICE_POSITIONS.arrivalSpawn,
    spatialRole: 'playable',
    orientationDegrees: 180,
  },
  {
    id: ARRIVAL_SLICE_IDS.optionalVista,
    label: 'Tidepool vista',
    kind: 'landmark',
    position: ARRIVAL_SLICE_POSITIONS.optionalVista,
    spatialRole: 'playable',
    orientationDegrees: 170,
  },
  {
    id: ARRIVAL_SLICE_IDS.mantleLedge,
    label: 'Mantle ledge',
    kind: 'landmark',
    position: ARRIVAL_SLICE_POSITIONS.mantleLedge,
    spatialRole: 'playable',
    orientationDegrees: 180,
  },
  {
    id: ARRIVAL_SLICE_IDS.revealRidge,
    label: 'Loom reveal ridge',
    kind: 'checkpoint',
    position: ARRIVAL_SLICE_POSITIONS.revealRidge,
    spatialRole: 'playable',
    orientationDegrees: 180,
  },
  {
    id: ARRIVAL_SLICE_IDS.arrivalChime,
    label: 'Arrival Chime',
    kind: 'interaction',
    position: ARRIVAL_SLICE_POSITIONS.arrivalChime,
    spatialRole: 'playable',
    orientationDegrees: 180,
  },
  {
    id: ARRIVAL_SLICE_IDS.crossing,
    label: 'Arrival crossing',
    kind: 'mechanism',
    position: ARRIVAL_SLICE_POSITIONS.crossing,
    spatialRole: 'playable',
    orientationDegrees: 180,
  },
  {
    id: ARRIVAL_SLICE_IDS.loom,
    label: 'The Loom',
    kind: 'interaction',
    position: ARRIVAL_SLICE_POSITIONS.loom,
    spatialRole: 'playable',
    orientationDegrees: 0,
  },
  {
    id: ARRIVAL_SLICE_IDS.murmurwoodSilhouette,
    label: 'Murmurwood Basin silhouette',
    kind: 'silhouette',
    position: ARRIVAL_SLICE_POSITIONS.murmurwoodSilhouette,
    spatialRole: 'backdrop',
  },
  {
    id: ARRIVAL_SLICE_IDS.whistlingSilhouette,
    label: 'Whistling Cut silhouette',
    kind: 'silhouette',
    position: ARRIVAL_SLICE_POSITIONS.whistlingSilhouette,
    spatialRole: 'backdrop',
  },
  {
    id: ARRIVAL_SLICE_IDS.stormglassSilhouette,
    label: 'Stormglass Aerie silhouette',
    kind: 'silhouette',
    position: ARRIVAL_SLICE_POSITIONS.stormglassSilhouette,
    spatialRole: 'backdrop',
  },
  {
    id: ARRIVAL_SLICE_IDS.beaconSilhouette,
    label: 'Beacon overlook silhouette',
    kind: 'silhouette',
    position: ARRIVAL_SLICE_POSITIONS.beaconSilhouette,
    spatialRole: 'backdrop',
  },
] as const satisfies readonly WorldAnchorDescriptor[];

const PERSISTENT_STATE_KEYS = [
  'arrivalChimeActivated',
  'loomAwakened',
  'optionalVistaFound',
] as const satisfies readonly ArrivalSliceStateKey[];

export const ARRIVAL_SLICE_DEFINITION = {
  schemaVersion: ARRIVAL_SLICE_SCHEMA_VERSION,
  id: ARRIVAL_SLICE_IDS.world,
  seed: ARRIVAL_SLICE_SEED,
  coordinateSystem: {
    handedness: 'right',
    upAxis: 'y',
    forwardAxis: '-z',
    metersPerUnit: 1,
  },
  playableBounds: {
    min: {
      x: ARRIVAL_TERRAIN_ORIGIN.x,
      y: -4,
      z: ARRIVAL_TERRAIN_ORIGIN.z,
    },
    max: {
      x: ARRIVAL_TERRAIN_ORIGIN.x + ARRIVAL_TERRAIN_SIZE.widthMeters,
      y: 48,
      z: ARRIVAL_TERRAIN_ORIGIN.z + ARRIVAL_TERRAIN_SIZE.depthMeters,
    },
  },
  anchors: ANCHORS,
  route: [
    {
      id: ARRIVAL_SLICE_IDS.routeShore,
      anchorId: ARRIVAL_SLICE_IDS.arrivalSpawn,
      objective: 'Follow the answering light.',
      lessons: ['move', 'sprint'],
      checkpoint: 'shore',
    },
    {
      id: ARRIVAL_SLICE_IDS.routeMantle,
      anchorId: ARRIVAL_SLICE_IDS.mantleLedge,
      objective: 'Climb toward the ridge.',
      lessons: ['jump', 'mantle'],
    },
    {
      id: ARRIVAL_SLICE_IDS.routeReveal,
      anchorId: ARRIVAL_SLICE_IDS.revealRidge,
      objective: 'Reach the Loom.',
      lessons: [],
      checkpoint: 'ridge',
    },
    {
      id: ARRIVAL_SLICE_IDS.routeChime,
      anchorId: ARRIVAL_SLICE_IDS.arrivalChime,
      objective: 'Attune the way.',
      lessons: ['interact'],
    },
    {
      id: ARRIVAL_SLICE_IDS.routeCrossing,
      anchorId: ARRIVAL_SLICE_IDS.crossing,
      objective: 'Cross the awakened path.',
      lessons: ['jump'],
    },
    {
      id: ARRIVAL_SLICE_IDS.routeLoom,
      anchorId: ARRIVAL_SLICE_IDS.loom,
      objective: 'Wake the Loom.',
      lessons: ['interact', 'world-objective'],
      checkpoint: 'loom',
    },
  ],
  content: ARRIVAL_SLICE_CONTENT,
  interactions: [
    {
      anchorId: ARRIVAL_SLICE_IDS.arrivalChime,
      action: 'interact',
      prompt: 'Attune the way',
      radiusMeters: 3.1,
      persistentStateKey: 'arrivalChimeActivated',
      activatesAnchorIds: [ARRIVAL_SLICE_IDS.crossing, ARRIVAL_SLICE_IDS.loom],
      caption: 'A bright chord travels toward the Loom as the crossing rises.',
    },
    {
      anchorId: ARRIVAL_SLICE_IDS.loom,
      action: 'interact',
      prompt: 'Wake the Loom',
      radiusMeters: 3,
      persistentStateKey: 'loomAwakened',
      activatesAnchorIds: [
        ARRIVAL_SLICE_IDS.loomSocketMurmurwood,
        ARRIVAL_SLICE_IDS.loomSocketWhistling,
        ARRIVAL_SLICE_IDS.loomSocketStormglass,
      ],
      caption: 'Three empty Shard sockets answer as the Loom begins to turn.',
    },
  ],
  crossingSegments: CROSSING_SEGMENTS,
  persistentStateKeys: PERSISTENT_STATE_KEYS,
} as const satisfies ArrivalSliceDefinition;

export const ARRIVAL_SLICE = ARRIVAL_SLICE_DEFINITION;

const SEEDED_RANDOM_HASH_OFFSET = 0x811c_9dc5;
const SEEDED_RANDOM_HASH_PRIME = 0x0100_0193;
const SEEDED_RANDOM_INCREMENT = 0x6d2b_79f5;

function hashScatterSeed(worldSeed: number, contentId: StableWorldId, seedOffset: number): number {
  let hash = (SEEDED_RANDOM_HASH_OFFSET ^ (worldSeed >>> 0)) >>> 0;
  for (let index = 0; index < contentId.length; index += 1) {
    hash ^= contentId.charCodeAt(index);
    hash = Math.imul(hash, SEEDED_RANDOM_HASH_PRIME) >>> 0;
  }
  hash ^= seedOffset >>> 0;
  return Math.imul(hash, SEEDED_RANDOM_HASH_PRIME) >>> 0;
}

/**
 * Creates a deterministic stream for one authored content descriptor.
 * Hashing the stable ID before starting the PRNG keeps each stream independent
 * when another descriptor's count or generation order changes.
 */
export function createSeededRandomStream(
  worldSeed: number,
  contentId: StableWorldId,
  seedOffset: number,
): SeededRandomStream {
  let value = hashScatterSeed(worldSeed, contentId, seedOffset);
  return () => {
    value += SEEDED_RANDOM_INCREMENT;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function getArrivalSliceAnchor(id: StableWorldId): WorldAnchorDescriptor | undefined {
  return ARRIVAL_SLICE_DEFINITION.anchors.find((anchor) => anchor.id === id);
}
