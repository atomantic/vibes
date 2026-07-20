import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
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

export interface GrassFieldOptions {
  readonly count: number;
  readonly time: IUniform<number>;
  readonly heightAt: (x: number, z: number) => number;
  readonly random: () => number;
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
        bladeDirt = groundDirt(baseXZ);
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
    const x = (options.random() - 0.5) * 150;
    const z = -8 + options.random() * 142;
    const height = options.heightAt(x, z);
    const pathClearance = 5.5 + Math.sin(z * 0.075) * 2.2;
    if (height < 2.1 || height > 12.8 || Math.abs(x) < pathClearance) continue;

    const bladeHeight = 0.62 + options.random() * 0.88;
    const bladeWidth = 0.075 + options.random() * 0.055;
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

export function createStylizedWaterMaterial(time: IUniform<number>): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      time,
      deepColor: { value: new Color('#123f5b') },
      midColor: { value: new Color('#2ca9b4') },
      highlightColor: { value: new Color('#bdf7de') },
      skyColor: { value: new Color('#f3af78') },
      fogColor: { value: new Color() },
      fogNear: { value: 1 },
      fogFar: { value: 1_000 },
      fogDensity: { value: 0.00025 },
    },
    vertexShader: /* glsl */ `
      varying vec2 waterWorldXZ;
      #include <fog_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        waterWorldXZ = world.xz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 deepColor;
      uniform vec3 midColor;
      uniform vec3 highlightColor;
      uniform vec3 skyColor;
      varying vec2 waterWorldXZ;
      #include <fog_pars_fragment>

      vec2 waterHash(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453);
      }

      float smoothMinimum(float a, float b, float radius) {
        float h = max(radius - abs(a - b), 0.0) / radius;
        return min(a, b) - h * h * h * radius / 6.0;
      }

      vec2 cellPoint(vec2 seed) {
        return 0.5 + 0.5 * sin(time * 0.24 + 6.2831 * seed);
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
            smoothNearest = smoothMinimum(smoothNearest, distanceToPoint, 0.54);
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

      void main() {
        vec2 noiseUV = waterWorldXZ * 0.024 + vec2(time * 0.035, 0.0);
        vec2 distortion = vec2(valueNoise(noiseUV) - 0.5) * 0.34;
        vec2 cells = voronoiDistances(waterWorldXZ * 0.075 + vec2(0.0, time * 0.025) + distortion);
        float edge = cells.x - cells.y;
        float band = smoothstep(0.052, 0.073, edge);
        float highlight = smoothstep(0.47, 0.82, band);
        vec3 color = mix(deepColor, midColor, smoothstep(0.03, 0.42, band));
        color = mix(color, highlightColor, highlight);

        float rippleDistance = length(waterWorldXZ - vec2(0.0, 111.0));
        float rippleRadius = mod(time * 1.45, 8.0);
        float ripple = 1.0 - smoothstep(0.0, 0.15, abs(rippleDistance - rippleRadius));
        ripple *= 1.0 - rippleRadius / 8.0;
        color = mix(color, highlightColor, ripple * 0.65);

        float horizon = smoothstep(-20.0, 150.0, waterWorldXZ.y);
        color = mix(color, skyColor, horizon * 0.09);
        gl_FragColor = vec4(color, mix(0.76, 0.94, max(band, ripple)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    fog: true,
  });
}
