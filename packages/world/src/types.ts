export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Bounds3 {
  readonly min: Vec3;
  readonly max: Vec3;
}

export type StableWorldId = string;

export type SeededRandomStream = () => number;

export type WorldAnchorKind =
  'spawn' | 'landmark' | 'interaction' | 'mechanism' | 'checkpoint' | 'silhouette';

export type SpatialRole = 'playable' | 'backdrop';

export interface WorldAnchorDescriptor {
  readonly id: StableWorldId;
  readonly label: string;
  readonly kind: WorldAnchorKind;
  readonly position: Vec3;
  readonly spatialRole: SpatialRole;
  readonly orientationDegrees?: number;
}

export type TraversalLesson =
  'move' | 'sprint' | 'jump' | 'mantle' | 'interact' | 'world-objective';

export interface RouteStepDescriptor {
  readonly id: StableWorldId;
  readonly anchorId: StableWorldId;
  readonly objective: string;
  readonly lessons: readonly TraversalLesson[];
  readonly checkpoint?: 'shore' | 'ridge' | 'loom';
}

export type ArrivalSliceStateKey = 'arrivalChimeActivated' | 'loomAwakened' | 'optionalVistaFound';

export interface InteractionDescriptor {
  readonly anchorId: StableWorldId;
  readonly action: 'interact';
  readonly prompt: string;
  readonly radiusMeters: number;
  readonly persistentStateKey: ArrivalSliceStateKey;
  readonly activatesAnchorIds: readonly StableWorldId[];
  readonly caption: string;
}

export interface PaletteDescriptor {
  readonly primary: `#${string}`;
  readonly secondary: `#${string}`;
  readonly accent: `#${string}`;
  readonly shadow: `#${string}`;
}

export type ArrivalContentGeneratorId =
  | 'arrival-shore-heightfield'
  | 'arrival-chime-assembly'
  | 'rising-stone-crossing'
  | 'loom-ring-assembly'
  | 'distant-silhouette';

export type ScatterArchetype = 'rock' | 'coral' | 'reed' | 'grass';

export type ScatterGeneratorId =
  'scatter-rock' | 'scatter-coral' | 'scatter-reed' | 'scatter-grass';

export type SilhouetteGeneratorId =
  | 'silhouette-forest-basin'
  | 'silhouette-wind-canyon'
  | 'silhouette-sky-ruin'
  | 'silhouette-beacon-spire';

export type VisualGeneratorId =
  ArrivalContentGeneratorId | ScatterGeneratorId | SilhouetteGeneratorId;

export type VisualGeneratorKind = 'content' | 'scatter' | 'silhouette';

export interface VisualGeneratorDescriptor<K extends VisualGeneratorKind = VisualGeneratorKind> {
  readonly id: StableWorldId;
  readonly kind: K;
}

export interface VisualGeneratorRegistry {
  readonly content: Readonly<
    Record<ArrivalContentGeneratorId, VisualGeneratorDescriptor<'content'>>
  >;
  readonly scatter: Readonly<Record<ScatterGeneratorId, VisualGeneratorDescriptor<'scatter'>>>;
  readonly silhouette: Readonly<
    Record<SilhouetteGeneratorId, VisualGeneratorDescriptor<'silhouette'>>
  >;
}

export interface ScatterArchetypeDescriptor {
  readonly id: StableWorldId;
  readonly kind: 'scatter';
  readonly generator: ScatterGeneratorId;
}

export interface SilhouetteArchetypeDescriptor {
  readonly id: StableWorldId;
  readonly kind: 'silhouette';
  readonly generator: SilhouetteGeneratorId;
}

export interface VisualArchetypeRegistry {
  readonly scatter: Readonly<Record<ScatterArchetype, ScatterArchetypeDescriptor>>;
  readonly silhouette: Readonly<Record<DistantSilhouetteArchetype, SilhouetteArchetypeDescriptor>>;
}

export interface ScatterDescriptor {
  readonly id: StableWorldId;
  readonly archetype: ScatterArchetype;
  readonly count: number;
  readonly seedOffset: number;
  readonly radiusMeters: number;
  readonly minimumScale: number;
  readonly maximumScale: number;
}

export interface ArrivalShoreContentDescriptor {
  readonly id: StableWorldId;
  readonly anchorId: StableWorldId;
  readonly generator: 'arrival-shore-heightfield';
  readonly seedOffset: number;
  readonly extentMeters: Vec2;
  readonly cellSizeMeters: number;
  readonly waterLevelMeters: number;
  readonly palette: PaletteDescriptor;
  readonly scatter: readonly ScatterDescriptor[];
  readonly guidance: readonly (
    'loom-silhouette' | 'resonance-ribbon' | 'path-value-contrast' | 'wind-direction'
  )[];
}

export interface ArrivalChimeContentDescriptor {
  readonly id: StableWorldId;
  readonly anchorId: StableWorldId;
  readonly generator: 'arrival-chime-assembly';
  readonly seedOffset: number;
  readonly footprintRadiusMeters: number;
  readonly heightMeters: number;
  readonly pulseDurationMs: number;
  readonly palette: PaletteDescriptor;
  readonly energyTargetAnchorId: StableWorldId;
}

export interface CrossingSegmentDescriptor {
  readonly id: StableWorldId;
  readonly order: number;
  readonly inactivePosition: Vec3;
  readonly activePosition: Vec3;
  readonly sizeMeters: Vec3;
  readonly activationDelayMs: number;
}

export interface CrossingContentDescriptor {
  readonly id: StableWorldId;
  readonly anchorId: StableWorldId;
  readonly generator: 'rising-stone-crossing';
  readonly seedOffset: number;
  readonly activationDurationMs: number;
  readonly segments: readonly CrossingSegmentDescriptor[];
  readonly failureRecoveryCheckpoint: 'ridge';
  readonly palette: PaletteDescriptor;
}

export interface LoomSocketDescriptor {
  readonly id: StableWorldId;
  readonly position: Vec3;
  readonly index: 0 | 1 | 2;
}

export interface LoomContentDescriptor {
  readonly id: StableWorldId;
  readonly anchorId: StableWorldId;
  readonly generator: 'loom-ring-assembly';
  readonly seedOffset: number;
  readonly platformRadiusMeters: number;
  readonly platformHeightMeters: number;
  readonly platformCenterOffsetYMeters: number;
  readonly platformSides: number;
  readonly ringCount: 3;
  readonly ringDiameterMeters: number;
  readonly ringThicknessMeters: number;
  readonly activationDurationMs: number;
  readonly sockets: readonly LoomSocketDescriptor[];
  readonly palette: PaletteDescriptor;
}

export type DistantSilhouetteArchetype =
  'forest-basin' | 'wind-canyon' | 'sky-ruin' | 'beacon-spire';

export interface DistantSilhouetteDescriptor {
  readonly id: StableWorldId;
  readonly anchorId: StableWorldId;
  readonly generator: 'distant-silhouette';
  readonly seedOffset: number;
  readonly archetype: DistantSilhouetteArchetype;
  readonly scale: Vec3;
  readonly palette: PaletteDescriptor;
  readonly visibleFromAnchorIds: readonly StableWorldId[];
}

export interface ArrivalSliceContent {
  readonly arrivalShore: ArrivalShoreContentDescriptor;
  readonly arrivalChime: ArrivalChimeContentDescriptor;
  readonly crossing: CrossingContentDescriptor;
  readonly loom: LoomContentDescriptor;
  readonly distantSilhouettes: readonly DistantSilhouetteDescriptor[];
}

export interface ArrivalSliceDefinition {
  readonly schemaVersion: number;
  readonly id: StableWorldId;
  readonly seed: number;
  readonly coordinateSystem: {
    readonly handedness: 'right';
    readonly upAxis: 'y';
    readonly forwardAxis: '-z';
    readonly metersPerUnit: 1;
  };
  readonly playableBounds: Bounds3;
  readonly anchors: readonly WorldAnchorDescriptor[];
  readonly visualGenerators: VisualGeneratorRegistry;
  readonly visualArchetypes: VisualArchetypeRegistry;
  readonly route: readonly RouteStepDescriptor[];
  readonly content: ArrivalSliceContent;
  readonly interactions: readonly InteractionDescriptor[];
  readonly crossingSegments: readonly CrossingSegmentDescriptor[];
  readonly persistentStateKeys: readonly ArrivalSliceStateKey[];
}

export type WorldDefinitionValidationCode =
  | 'invalid-schema'
  | 'invalid-seed'
  | 'invalid-bounds'
  | 'invalid-id'
  | 'duplicate-id'
  | 'invalid-position'
  | 'outside-playable-bounds'
  | 'missing-reference'
  | 'invalid-generator'
  | 'invalid-interaction'
  | 'invalid-content'
  | 'invalid-route';

export interface WorldDefinitionValidationIssue {
  readonly code: WorldDefinitionValidationCode;
  readonly path: string;
  readonly message: string;
}
