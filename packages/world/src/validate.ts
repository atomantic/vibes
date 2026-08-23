import { ARRIVAL_SLICE_DEFINITION, ARRIVAL_SLICE_IDS } from './arrivalSlice.js';
import type {
  ArrivalSliceDefinition,
  Bounds3,
  StableWorldId,
  Vec3,
  WorldDefinitionValidationIssue,
} from './types.js';

const STABLE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function isFiniteVec3(value: Vec3): boolean {
  return [value.x, value.y, value.z].every(Number.isFinite);
}

function isInsideBounds(position: Vec3, bounds: Bounds3): boolean {
  return (
    position.x >= bounds.min.x &&
    position.x <= bounds.max.x &&
    position.y >= bounds.min.y &&
    position.y <= bounds.max.y &&
    position.z >= bounds.min.z &&
    position.z <= bounds.max.z
  );
}

export function validateArrivalSliceDefinition(
  definition: ArrivalSliceDefinition = ARRIVAL_SLICE_DEFINITION,
): readonly WorldDefinitionValidationIssue[] {
  const issues: WorldDefinitionValidationIssue[] = [];
  const knownIds = new Set<StableWorldId>();

  const issue = (
    code: WorldDefinitionValidationIssue['code'],
    path: string,
    message: string,
  ): void => {
    issues.push({ code, path, message });
  };

  const registerId = (id: StableWorldId, path: string): void => {
    if (!STABLE_ID_PATTERN.test(id)) {
      issue('invalid-id', path, `Stable ID '${id}' is not in canonical form.`);
      return;
    }
    if (knownIds.has(id)) {
      issue('duplicate-id', path, `Stable ID '${id}' is duplicated.`);
      return;
    }
    knownIds.add(id);
  };

  if (definition.schemaVersion !== 1) {
    issue('invalid-schema', 'schemaVersion', 'Arrival slice schema must be 1.');
  }

  if (
    !Number.isSafeInteger(definition.seed) ||
    definition.seed < 0 ||
    definition.seed > 0xffff_ffff
  ) {
    issue('invalid-seed', 'seed', 'Seed must be an unsigned 32-bit integer.');
  }

  registerId(definition.id, 'id');

  const { min, max } = definition.playableBounds;
  if (
    !isFiniteVec3(min) ||
    !isFiniteVec3(max) ||
    min.x >= max.x ||
    min.y >= max.y ||
    min.z >= max.z
  ) {
    issue(
      'invalid-bounds',
      'playableBounds',
      'Playable bounds must be finite and have a positive extent on every axis.',
    );
  }

  const anchorIds = new Set<StableWorldId>();
  definition.anchors.forEach((anchor, index) => {
    const path = `anchors[${index.toString()}]`;
    registerId(anchor.id, `${path}.id`);
    anchorIds.add(anchor.id);

    if (!isFiniteVec3(anchor.position)) {
      issue('invalid-position', `${path}.position`, 'Anchor position must be finite.');
    } else if (
      anchor.spatialRole === 'playable' &&
      !isInsideBounds(anchor.position, definition.playableBounds)
    ) {
      issue(
        'outside-playable-bounds',
        `${path}.position`,
        `Playable anchor '${anchor.id}' is outside the playable bounds.`,
      );
    }

    if (anchor.kind === 'silhouette' && anchor.spatialRole !== 'backdrop') {
      issue(
        'invalid-content',
        `${path}.spatialRole`,
        `Silhouette '${anchor.id}' must be backdrop content.`,
      );
    }
  });

  definition.route.forEach((step, index) => {
    const path = `route[${index.toString()}]`;
    registerId(step.id, `${path}.id`);
    if (!anchorIds.has(step.anchorId)) {
      issue(
        'missing-reference',
        `${path}.anchorId`,
        `Route step references missing anchor '${step.anchorId}'.`,
      );
    }
  });

  const contentDescriptors = [
    definition.content.arrivalShore,
    definition.content.arrivalChime,
    definition.content.crossing,
    definition.content.loom,
    ...definition.content.distantSilhouettes,
  ];
  contentDescriptors.forEach((descriptor, index) => {
    const path = `content[${index.toString()}]`;
    registerId(descriptor.id, `${path}.id`);
    if (!anchorIds.has(descriptor.anchorId)) {
      issue(
        'missing-reference',
        `${path}.anchorId`,
        `Content references missing anchor '${descriptor.anchorId}'.`,
      );
    }
    for (const name of ['primary', 'secondary', 'accent', 'shadow'] as const) {
      const color = descriptor.palette[name];
      if (!HEX_COLOR_PATTERN.test(color)) {
        issue(
          'invalid-content',
          `${path}.palette.${name}`,
          `Palette value '${color}' must be a six-digit hex color.`,
        );
      }
    }
  });

  definition.content.arrivalShore.scatter.forEach((scatter, index) => {
    registerId(scatter.id, `content.arrivalShore.scatter[${index.toString()}].id`);
  });

  definition.content.distantSilhouettes.forEach((silhouette, index) => {
    const path = `content.distantSilhouettes[${index.toString()}]`;
    for (const visibleFromId of silhouette.visibleFromAnchorIds) {
      if (!anchorIds.has(visibleFromId)) {
        issue(
          'missing-reference',
          `${path}.visibleFromAnchorIds`,
          `Silhouette visibility references missing anchor '${visibleFromId}'.`,
        );
      }
    }
  });

  const stateKeys = new Set(definition.persistentStateKeys);
  if (stateKeys.size !== definition.persistentStateKeys.length) {
    issue('invalid-content', 'persistentStateKeys', 'Persistent state keys must be unique.');
  }

  if (
    !Number.isFinite(definition.content.loom.platformHeightMeters) ||
    definition.content.loom.platformHeightMeters <= 0 ||
    !Number.isFinite(definition.content.loom.platformCenterOffsetYMeters)
  ) {
    issue(
      'invalid-content',
      'content.loom.platformHeightMeters',
      'Loom platform dimensions must be finite and have positive height.',
    );
  }

  definition.interactions.forEach((interaction, index) => {
    const path = `interactions[${index.toString()}]`;
    if (!anchorIds.has(interaction.anchorId)) {
      issue(
        'missing-reference',
        `${path}.anchorId`,
        `Interaction references missing anchor '${interaction.anchorId}'.`,
      );
    }
    if (!Number.isFinite(interaction.radiusMeters) || interaction.radiusMeters <= 0) {
      issue(
        'invalid-interaction',
        `${path}.radiusMeters`,
        'Interaction radius must be finite and greater than zero.',
      );
    }
    if (!stateKeys.has(interaction.persistentStateKey)) {
      issue(
        'missing-reference',
        `${path}.persistentStateKey`,
        `Interaction state key '${interaction.persistentStateKey}' is not declared.`,
      );
    }
    for (const targetId of interaction.activatesAnchorIds) {
      const isAnchor = anchorIds.has(targetId);
      const isLoomSocket = definition.content.loom.sockets.some((socket) => socket.id === targetId);
      if (!isAnchor && !isLoomSocket) {
        issue(
          'missing-reference',
          `${path}.activatesAnchorIds`,
          `Interaction target '${targetId}' does not exist.`,
        );
      }
    }
  });

  const crossingIds = new Set<StableWorldId>();
  definition.crossingSegments.forEach((segment, index) => {
    const path = `crossingSegments[${index.toString()}]`;
    registerId(segment.id, `${path}.id`);
    crossingIds.add(segment.id);
    if (!isFiniteVec3(segment.inactivePosition) || !isFiniteVec3(segment.activePosition)) {
      issue('invalid-position', path, `Crossing segment '${segment.id}' positions must be finite.`);
    }
    if (
      !isFiniteVec3(segment.sizeMeters) ||
      segment.sizeMeters.x <= 0 ||
      segment.sizeMeters.y <= 0 ||
      segment.sizeMeters.z <= 0
    ) {
      issue(
        'invalid-content',
        `${path}.sizeMeters`,
        `Crossing segment '${segment.id}' size must be positive and finite.`,
      );
    }
  });

  const contentCrossingIds = new Set(
    definition.content.crossing.segments.map((segment) => segment.id),
  );
  if (
    crossingIds.size !== contentCrossingIds.size ||
    [...crossingIds].some((id) => !contentCrossingIds.has(id))
  ) {
    issue(
      'invalid-content',
      'crossingSegments',
      'Top-level and content crossing segment IDs must match.',
    );
  }

  for (const socket of definition.content.loom.sockets) {
    const socketIndex = socket.index.toString();
    registerId(socket.id, `content.loom.sockets[${socketIndex}].id`);
    if (!isFiniteVec3(socket.position)) {
      issue(
        'invalid-position',
        `content.loom.sockets[${socketIndex}].position`,
        `Loom socket '${socket.id}' position must be finite.`,
      );
    }
  }

  const firstRouteAnchor = definition.route[0]?.anchorId;
  const finalRouteAnchor = definition.route.at(-1)?.anchorId;
  if (
    firstRouteAnchor !== ARRIVAL_SLICE_IDS.arrivalSpawn ||
    finalRouteAnchor !== ARRIVAL_SLICE_IDS.loom
  ) {
    issue(
      'invalid-route',
      'route',
      'Arrival route must begin at Arrival Shore spawn and end at the Loom.',
    );
  }

  return issues;
}

export class ArrivalSliceDefinitionValidationError extends Error {
  public readonly issues: readonly WorldDefinitionValidationIssue[];

  public constructor(issues: readonly WorldDefinitionValidationIssue[]) {
    const summary = issues.map(({ path, message }) => `${path}: ${message}`).join('; ');
    super(`Invalid Arrival slice definition: ${summary}`);
    this.name = 'ArrivalSliceDefinitionValidationError';
    this.issues = issues;
  }
}

export function assertValidArrivalSliceDefinition(
  definition: ArrivalSliceDefinition = ARRIVAL_SLICE_DEFINITION,
): void {
  const issues = validateArrivalSliceDefinition(definition);
  if (issues.length > 0) {
    throw new ArrivalSliceDefinitionValidationError(issues);
  }
}
