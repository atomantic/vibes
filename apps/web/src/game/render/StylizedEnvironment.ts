import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
  type IUniform,
} from 'three';

const GROUND_MASK_UNIFORMS = /* glsl */ `
  uniform vec3 dirtColor;
  uniform float dirtScale;
  uniform float dirtCoverage;
  uniform float dirtSoftness;
  uniform float dirtWarp;
`;

// Adapted from cortiz2894/stylized-components. Keeping the same world-space
// function in both materials is what makes grass thin into matching bare soil.
const GROUND_MASK_GLSL = /* glsl */ `
  float groundHash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }

  float groundNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(groundHash(i), groundHash(i + vec2(1.0, 0.0)), u.x),
      mix(groundHash(i + vec2(0.0, 1.0)), groundHash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float groundFbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float normalization = 0.0;
    for (int octave = 0; octave < 4; octave++) {
      value += amplitude * groundNoise(p);
      normalization += amplitude;
      p = p * 2.03 + vec2(3.1, 7.7);
      amplitude *= 0.5;
    }
    return value / max(normalization, 0.001);
  }

  float groundDirt(vec2 worldXZ) {
    vec2 p = worldXZ * dirtScale;
    vec2 warp = vec2(
      groundFbm(p + vec2(11.3, 2.7)),
      groundFbm(p + vec2(5.9, 17.1))
    );
    p += (warp - 0.5) * dirtWarp;
    float threshold = 1.0 - dirtCoverage;
    return smoothstep(
      threshold - dirtSoftness,
      threshold + dirtSoftness,
      groundFbm(p)
    );
  }
`;

const DIRT_UNIFORMS = {
  dirtColor: { value: new Color('#80654f') },
  dirtScale: { value: 0.055 },
  dirtCoverage: { value: 0.43 },
  dirtSoftness: { value: 0.12 },
  dirtWarp: { value: 0.72 },
} satisfies Record<string, IUniform>;

export interface StylizedEnvironmentUniforms {
  readonly time: IUniform<number>;
}

const MAX_WATER_RIPPLES = 8;
const MAX_WATER_RIPPLES_GLSL = '8';

export interface StylizedWaterState {
  readonly time: IUniform<number>;
  readonly cameraXZ: IUniform<Vector2>;
  readonly rippleCenters: readonly Vector2[];
  readonly rippleTimes: Float32Array;
  readonly rippleCount: IUniform<number>;
  nextRippleIndex: number;
}

export function createStylizedWaterState(time: IUniform<number>): StylizedWaterState {
  return {
    time,
    cameraXZ: { value: new Vector2() },
    rippleCenters: Array.from({ length: MAX_WATER_RIPPLES }, () => new Vector2()),
    rippleTimes: new Float32Array(MAX_WATER_RIPPLES),
    rippleCount: { value: 0 },
    nextRippleIndex: 0,
  };
}

export function addStylizedWaterRipple(
  state: StylizedWaterState,
  x: number,
  z: number,
  startTime: number,
): void {
  const index = state.nextRippleIndex;
  state.rippleCenters[index]?.set(x, z);
  state.rippleTimes[index] = startTime;
  state.rippleCount.value = Math.min(state.rippleCount.value + 1, MAX_WATER_RIPPLES);
  state.nextRippleIndex = (index + 1) % MAX_WATER_RIPPLES;
}

export type EnvironmentLodTier = 'near' | 'far';

export interface EnvironmentLodPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DistanceTierEnvironmentOptions {
  readonly center: EnvironmentLodPoint;
  readonly near: Object3D;
  readonly far: Object3D;
  /** Switch from the reduced representation back to the near representation. */
  readonly nearDistance: number;
  /** Switch from the near representation to the reduced representation. */
  readonly farDistance: number;
}

export interface DistanceTierEnvironment {
  readonly group: Group;
  readonly activeTier: EnvironmentLodTier;
  update(cameraPosition: EnvironmentLodPoint): EnvironmentLodTier;
  rebuild(near: Object3D, far: Object3D): void;
  dispose(): void;
}

export function disposeEnvironmentObject(object: Object3D): void {
  object.traverse((child) => {
    if (child instanceof InstancedMesh) child.dispose();
    const renderable = child as unknown as {
      readonly geometry?: unknown;
      readonly material?: unknown;
    };
    if (renderable.geometry instanceof BufferGeometry) renderable.geometry.dispose();
    if (Array.isArray(renderable.material)) {
      for (const material of renderable.material) {
        if (material instanceof Material) material.dispose();
      }
    } else if (renderable.material instanceof Material) {
      renderable.material.dispose();
    }
  });
}

export function createDistanceTierEnvironment(
  options: DistanceTierEnvironmentOptions,
): DistanceTierEnvironment {
  if (
    !Number.isFinite(options.nearDistance) ||
    !Number.isFinite(options.farDistance) ||
    options.nearDistance < 0 ||
    options.farDistance <= options.nearDistance
  ) {
    throw new Error('Environment LOD distances must be finite and ordered near < far.');
  }

  const group = new Group();
  const center = { ...options.center };
  let near = options.near;
  let far = options.far;
  let activeTier: EnvironmentLodTier = 'near';
  let lastCameraPosition: EnvironmentLodPoint | null = null;
  let disposed = false;

  const syncVisibility = (): void => {
    near.visible = activeTier === 'near';
    far.visible = activeTier === 'far';
  };

  const attachRepresentations = (): void => {
    group.add(near, far);
    syncVisibility();
  };

  const updateTier = (cameraPosition: EnvironmentLodPoint): void => {
    const distance = Math.hypot(
      cameraPosition.x - center.x,
      cameraPosition.y - center.y,
      cameraPosition.z - center.z,
    );
    if (activeTier === 'near' && distance >= options.farDistance) {
      activeTier = 'far';
      syncVisibility();
    } else if (activeTier === 'far' && distance <= options.nearDistance) {
      activeTier = 'near';
      syncVisibility();
    }
  };

  attachRepresentations();

  return {
    group,
    get activeTier(): EnvironmentLodTier {
      return activeTier;
    },
    update(cameraPosition): EnvironmentLodTier {
      if (disposed) return activeTier;
      lastCameraPosition = { ...cameraPosition };
      updateTier(cameraPosition);
      return activeTier;
    },
    rebuild(nextNear, nextFar): void {
      if (disposed) return;
      group.remove(near, far);
      disposeEnvironmentObject(near);
      disposeEnvironmentObject(far);
      near = nextNear;
      far = nextFar;
      activeTier = 'near';
      if (lastCameraPosition !== null) updateTier(lastCameraPosition);
      attachRepresentations();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      group.remove(near, far);
      disposeEnvironmentObject(near);
      disposeEnvironmentObject(far);
    },
  };
}

export interface GrassFieldOptions {
  readonly count: number;
  readonly time: IUniform<number>;
  readonly heightAt: (x: number, z: number) => number;
  readonly random: () => number;
  readonly placement?: {
    readonly centerX: number;
    readonly centerZ: number;
    readonly radiusX: number;
    readonly radiusZ: number;
    readonly excludeRadiusX?: number;
    readonly excludeRadiusZ?: number;
    readonly edgeSoftness?: number;
  };
  readonly bounds?: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
  readonly clearPath?: boolean;
  readonly minTerrainHeight?: number;
  readonly maxTerrainHeight?: number;
  readonly minBladeHeight?: number;
  readonly maxBladeHeight?: number;
  readonly minBladeWidth?: number;
  readonly maxBladeWidth?: number;
  readonly dirtInfluence?: number;
}

export function createStylizedTerrainMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, DIRT_UNIFORMS);
    shader.vertexShader = `varying vec3 groundWorldPosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      groundWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;`,
    );
    shader.fragmentShader = `
      varying vec3 groundWorldPosition;
      ${GROUND_MASK_UNIFORMS}
      ${GROUND_MASK_GLSL}
      ${shader.fragmentShader}
    `.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float terrainDirt = groundDirt(groundWorldPosition.xz);
      float grassAltitude = smoothstep(1.8, 4.0, groundWorldPosition.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, dirtColor, terrainDirt * grassAltitude);`,
    );
  };
  material.customProgramCacheKey = () => 'vibes-stylized-terrain-v1';
  return material;
}

function makeBladeGeometry(): BufferGeometry {
  const segments = 3;
  const positions = new Float32Array((segments * 2 + 1) * 3);
  for (let index = 0; index < segments; index += 1) {
    const height = index / segments;
    const halfWidth = 0.5 * Math.pow(1 - height, 1.2);
    positions[index * 6] = -halfWidth;
    positions[index * 6 + 1] = height;
    positions[index * 6 + 3] = halfWidth;
    positions[index * 6 + 4] = height;
  }
  positions[segments * 6 + 1] = 1;

  const indices = [0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5, 4, 6, 5];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createStylizedGrassField(options: GrassFieldOptions): InstancedMesh {
  const material = new ShaderMaterial({
    side: DoubleSide,
    fog: true,
    uniforms: {
      ...DIRT_UNIFORMS,
      dirtInfluence: { value: options.dirtInfluence ?? 1 },
      time: options.time,
      windDirection: { value: new Vector2(0.82, 0.57).normalize() },
      windStrength: { value: 0.42 },
      windSpeed: { value: 1.25 },
      windFrequency: { value: 0.095 },
      grassBottom: { value: new Color('#315f48') },
      grassTop: { value: new Color('#a9d06f') },
      grassDry: { value: new Color('#b89b61') },
      sunDirection: { value: new Vector3(-0.38, 0.74, 0.56).normalize() },
      fogColor: { value: new Color() },
      fogNear: { value: 1 },
      fogFar: { value: 1_000 },
      fogDensity: { value: 0.00025 },
    },
    vertexShader: /* glsl */ `
      ${GROUND_MASK_UNIFORMS}
      ${GROUND_MASK_GLSL}
      uniform float time;
      uniform float dirtInfluence;
      uniform vec2 windDirection;
      uniform float windStrength;
      uniform float windSpeed;
      uniform float windFrequency;
      varying float bladeHeight;
      varying float bladeDirt;
      varying float bladePatch;
      varying vec3 bladeWorldPosition;
      #include <fog_pars_vertex>

      void main() {
        vec2 baseXZ = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        bladeDirt = groundDirt(baseXZ) * dirtInfluence;
        bladePatch = groundFbm(baseXZ * 0.025 + vec2(7.1, 3.7));

        vec3 localPosition = position;
        float shrink = 1.0 - bladeDirt * 0.9;
        localPosition.y *= shrink;
        bladeHeight = position.y * shrink;

        vec4 world = modelMatrix * instanceMatrix * vec4(localPosition, 1.0);
        float heightMask = bladeHeight * bladeHeight;
        float primary = sin(dot(baseXZ, windDirection) * windFrequency + time * windSpeed);
        float crossWind = sin(dot(baseXZ, vec2(-windDirection.y, windDirection.x))
          * windFrequency * 1.9 + time * windSpeed * 0.7 + 2.6) * 0.34;
        world.xz += windDirection * (primary + crossWind + 0.34) * windStrength * heightMask;
        bladeWorldPosition = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      ${GROUND_MASK_UNIFORMS}
      ${GROUND_MASK_GLSL}
      uniform vec3 grassBottom;
      uniform vec3 grassTop;
      uniform vec3 grassDry;
      uniform vec3 sunDirection;
      varying float bladeHeight;
      varying float bladeDirt;
      varying float bladePatch;
      varying vec3 bladeWorldPosition;
      #include <common>
      #include <fog_pars_fragment>

      void main() {
        float gradient = pow(smoothstep(0.02, 0.92, bladeHeight), 0.72);
        vec3 color = mix(grassBottom, grassTop, gradient);
        color = mix(color, grassDry, smoothstep(0.52, 0.78, bladePatch) * 0.34);
        color = mix(color, dirtColor, bladeDirt * 0.82);

        float diffuse = 0.58 + max(dot(vec3(0.0, 1.0, 0.0), sunDirection), 0.0) * 0.42;
        vec3 viewDirection = normalize(cameraPosition - bladeWorldPosition);
        float backlight = pow(max(dot(viewDirection, -sunDirection), 0.0), 3.0);
        color = color * diffuse + grassTop * backlight * bladeHeight * 0.24;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });

  const grass = new InstancedMesh(makeBladeGeometry(), material, options.count);
  const transform = new Matrix4();
  const rotation = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  const up = new Vector3(0, 1, 0);
  let instance = 0;
  let attempts = 0;

  while (instance < options.count && attempts < options.count * 12) {
    attempts += 1;
    let x: number;
    let z: number;
    if (options.placement) {
      const angle = options.random() * Math.PI * 2;
      const radius = Math.sqrt(options.random());
      const edgeSoftness = options.placement.edgeSoftness ?? 0;
      if (
        edgeSoftness > 0 &&
        radius > 1 - edgeSoftness &&
        options.random() > (1 - radius) / edgeSoftness
      ) {
        continue;
      }
      x = options.placement.centerX + Math.cos(angle) * options.placement.radiusX * radius;
      z = options.placement.centerZ + Math.sin(angle) * options.placement.radiusZ * radius;
      if (
        options.placement.excludeRadiusX !== undefined &&
        options.placement.excludeRadiusZ !== undefined
      ) {
        const excludedDistance = Math.hypot(
          (x - options.placement.centerX) / options.placement.excludeRadiusX,
          (z - options.placement.centerZ) / options.placement.excludeRadiusZ,
        );
        if (excludedDistance < 1) continue;
      }
    } else if (options.bounds) {
      x = options.bounds.minX + options.random() * (options.bounds.maxX - options.bounds.minX);
      z = options.bounds.minZ + options.random() * (options.bounds.maxZ - options.bounds.minZ);
    } else {
      x = (options.random() - 0.5) * 150;
      z = -8 + options.random() * 142;
    }
    const height = options.heightAt(x, z);
    const pathClearance = 5.5 + Math.sin(z * 0.075) * 2.2;
    if (
      height < (options.minTerrainHeight ?? 2.1) ||
      height > (options.maxTerrainHeight ?? 12.8) ||
      (options.clearPath !== false && Math.abs(x) < pathClearance)
    ) {
      continue;
    }

    const minBladeHeight = options.minBladeHeight ?? 0.62;
    const maxBladeHeight = options.maxBladeHeight ?? 1.5;
    const minBladeWidth = options.minBladeWidth ?? 0.075;
    const maxBladeWidth = options.maxBladeWidth ?? 0.13;
    const bladeHeight = minBladeHeight + options.random() * (maxBladeHeight - minBladeHeight);
    const bladeWidth = minBladeWidth + options.random() * (maxBladeWidth - minBladeWidth);
    position.set(x, height + 0.015, z);
    rotation.setFromAxisAngle(up, options.random() * Math.PI * 2);
    scale.set(bladeWidth, bladeHeight, bladeWidth);
    transform.compose(position, rotation, scale);
    grass.setMatrixAt(instance, transform);
    instance += 1;
  }

  grass.count = instance;
  grass.instanceMatrix.needsUpdate = true;
  grass.computeBoundingBox();
  grass.computeBoundingSphere();
  grass.frustumCulled = true;
  return grass;
}

// Close imperative Three.js port of stylized-components/waterFloor. Uniform
// ratios stay aligned with the pinned source while spatial frequency is tuned
// for Vibes' larger meter scale.
export function createStylizedWaterMaterial(state: StylizedWaterState): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: FrontSide,
    uniforms: {
      time: state.time,
      cameraXZ: state.cameraXZ,
      rippleCenters: { value: state.rippleCenters },
      rippleTimes: { value: state.rippleTimes },
      rippleCount: state.rippleCount,
      deepColor: { value: new Color('#1a3a5c') },
      midColor: { value: new Color('#59c0e8') },
      highlightColor: { value: new Color('#ffffff') },
    },
    vertexShader: /* glsl */ `
      varying vec2 waterWorldXZ;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        waterWorldXZ = world.xz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 deepColor;
      uniform vec3 midColor;
      uniform vec3 highlightColor;
      uniform vec2 cameraXZ;
      uniform vec2 rippleCenters[${MAX_WATER_RIPPLES_GLSL}];
      uniform float rippleTimes[${MAX_WATER_RIPPLES_GLSL}];
      uniform int rippleCount;
      varying vec2 waterWorldXZ;

      vec2 waterHash(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453);
      }

      float smoothMinimum(float a, float b, float radius) {
        float h = max(radius - abs(a - b), 0.0) / radius;
        return min(a, b) - h * h * h * radius / 6.0;
      }

      vec2 cellPoint(vec2 seed) {
        return 0.5 + 0.5 * sin(time * 0.30 + 6.2831 * seed);
      }

      vec2 voronoiDistances(vec2 p) {
        vec2 cell = floor(p);
        vec2 local = fract(p);
        float nearest = 8.0;
        float smoothNearest = 8.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            float distanceToPoint = length(neighbor + cellPoint(waterHash(cell + neighbor)) - local);
            nearest = min(nearest, distanceToPoint);
            smoothNearest = smoothMinimum(smoothNearest, distanceToPoint, 0.55);
          }
        }
        return vec2(nearest, smoothNearest);
      }

      float valueNoise(vec2 p) {
        vec2 cell = floor(p);
        vec2 local = fract(p);
        local = local * local * (3.0 - 2.0 * local);
        return mix(
          mix(waterHash(cell).x, waterHash(cell + vec2(1.0, 0.0)).x, local.x),
          mix(waterHash(cell + vec2(0.0, 1.0)).x, waterHash(cell + 1.0).x, local.x),
          local.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int octave = 0; octave < 2; octave++) {
          value += amplitude * valueNoise(p);
          p *= 2.0;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 noiseUV = waterWorldXZ * 1.52 + vec2(time * 0.20, 0.0);
        vec2 distortion = vec2(fbm(noiseUV) - 0.5) * 0.30;
        vec2 cells = voronoiDistances(
          waterWorldXZ * 0.48 + vec2(0.0, 0.05) * time + distortion
        );
        float edge = cells.x - cells.y;
        float ramp = smoothstep(0.057, 0.077, edge);

        float midPosition = 0.084;
        float deepToMid = clamp(ramp / midPosition, 0.0, 1.0);
        float midToHighlight = clamp((ramp - midPosition) / (1.0 - midPosition), 0.0, 1.0);
        vec3 color = mix(
          mix(deepColor, midColor, deepToMid),
          mix(midColor, highlightColor, midToHighlight),
          step(midPosition, ramp)
        );

        float rippleBrightness = 0.0;
        for (int rippleIndex = 0; rippleIndex < ${MAX_WATER_RIPPLES_GLSL}; rippleIndex++) {
          float rippleEnabled = step(float(rippleIndex), float(rippleCount) - 0.5);
          float elapsed = max(time - rippleTimes[rippleIndex], 0.0);
          float distanceFromImpact = length(waterWorldXZ - rippleCenters[rippleIndex]);
          for (int ringIndex = 0; ringIndex < 2; ringIndex++) {
            float ringElapsed = max(elapsed - float(ringIndex), 0.0);
            float ringRadius = ringElapsed * 1.5;
            float ringDistance = abs(distanceFromImpact - ringRadius);
            float ring = 1.0 - smoothstep(0.0, 0.12, ringDistance);
            rippleBrightness += ring * exp(-ringElapsed * 1.6) * rippleEnabled;
          }
        }
        rippleBrightness = clamp(rippleBrightness * 5.5, 0.0, 1.0);
        color = mix(color, highlightColor, rippleBrightness);

        float cameraDistance = length(waterWorldXZ - cameraXZ);
        float distanceFade = 1.0 - pow(clamp(cameraDistance / 90.0, 0.0, 1.0), 1.4);
        float alpha = mix(0.45, 1.0, max(ramp, rippleBrightness)) * distanceFade;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

export function createStylizedSeabedMaterial(state: StylizedWaterState): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: FrontSide,
    uniforms: {
      time: state.time,
      cameraXZ: state.cameraXZ,
      deepColor: { value: new Color('#1aaae8') },
      cellColor: { value: new Color('#177096') },
    },
    vertexShader: /* glsl */ `
      varying vec2 seabedWorldXZ;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        seabedWorldXZ = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec2 cameraXZ;
      uniform vec3 deepColor;
      uniform vec3 cellColor;
      varying vec2 seabedWorldXZ;

      vec2 seabedHash(vec2 point) {
        point = vec2(
          dot(point, vec2(127.1, 311.7)),
          dot(point, vec2(269.5, 183.3))
        );
        return fract(sin(point) * 43758.5453);
      }

      float seabedSmoothMinimum(float left, float right, float radius) {
        float blend = max(radius - abs(left - right), 0.0) / radius;
        return min(left, right) - blend * blend * blend * radius / 6.0;
      }

      vec2 seabedCellPoint(vec2 seed) {
        return 0.5 + 0.5 * sin(time * 0.49 + 6.2831 * seed);
      }

      vec2 seabedDistances(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        float nearest = 8.0;
        float smoothNearest = 8.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            float distanceToCell = length(
              neighbor + seabedCellPoint(seabedHash(cell + neighbor)) - local
            );
            nearest = min(nearest, distanceToCell);
            smoothNearest = seabedSmoothMinimum(smoothNearest, distanceToCell, 0.4);
          }
        }
        return vec2(nearest, smoothNearest);
      }

      void main() {
        vec2 cells = seabedDistances(
          seabedWorldXZ * 0.256 + vec2(0.0, -0.11) * time
        );
        float edge = cells.x - cells.y;
        float ramp = smoothstep(0.03, 0.09, edge);
        vec3 color = mix(deepColor, cellColor, ramp);
        float cameraDistance = length(seabedWorldXZ - cameraXZ);
        float fade = 1.0 - pow(clamp(cameraDistance / 250.0, 0.0, 1.0), 2.0);
        gl_FragColor = vec4(color, fade);
      }
    `,
  });
}
