import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  BasicShadowMap,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  CatmullRomCurve3,
  CineonToneMapping,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  FogExp2,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Material,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  ARRIVAL_SLICE_DEFINITION,
  ARRIVAL_POND,
  ARRIVAL_SLICE_POSITIONS,
  ARRIVAL_TERRAIN_CELL_SIZE_METERS,
  ARRIVAL_TERRAIN_ORIGIN,
  ARRIVAL_TERRAIN_RESOLUTION,
  arrivalTerrainHeight,
  type CrossingSegmentDescriptor,
  type DistantSilhouetteDescriptor,
  type Vec3,
} from '@vibes/world';
import type { ObjectiveSnapshot, SimulationSnapshot } from '@vibes/protocol';

import { selectAvatarAnimation, type AvatarAnimationState } from './avatarAnimation';
import type { RobotAvatar } from './RobotAvatar';
import {
  addStylizedWaterRipple,
  createStylizedGrassField,
  createStylizedSeabedMaterial,
  createStylizedTerrainMaterial,
  createStylizedWaterMaterial,
  createStylizedWaterState,
} from './StylizedEnvironment';

export interface RenderMetrics {
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
}

export interface AvatarDiagnostics {
  readonly status: 'loading' | 'ready' | 'fallback';
  readonly kind: 'robot-expressive' | 'procedural';
  readonly animation: AvatarAnimationState;
  readonly activeClip: string | null;
  readonly clips: readonly string[];
}

const COLOR = {
  skyTop: new Color('#5faebf'),
  skyHorizon: new Color('#f3af78'),
  sand: new Color('#d7b98c'),
  grass: new Color('#628b6d'),
  rock: new Color('#8c7169'),
  cliff: new Color('#51666a'),
  water: new Color('#1d8891'),
  resonance: new Color('#63f2db'),
  coral: new Color('#f07f6d'),
} as const;
const AVATAR_VISUAL_VERTICAL_OFFSET_METERS = -0.37;
const ROBOT_AVATAR_URL = `${import.meta.env.BASE_URL}models/RobotExpressive.glb`;
const FULL_ROTATION_RADIANS = Math.PI * 2;

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b_79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function toVector3(value: Vec3): Vector3 {
  return new Vector3(value.x, value.y, value.z);
}

function objectiveEquals(left: ObjectiveSnapshot, right: ObjectiveSnapshot): boolean {
  return (
    left.arrivalChimeActivated === right.arrivalChimeActivated &&
    left.crossingRaised === right.crossingRaised &&
    left.loomAwakened === right.loomAwakened &&
    left.optionalVistaFound === right.optionalVistaFound &&
    left.checkpoint === right.checkpoint
  );
}

function lerpAngle(current: number, target: number, alpha: number): number {
  const shortestDelta =
    MathUtils.euclideanModulo(target - current + Math.PI, FULL_ROTATION_RADIANS) - Math.PI;
  return current + shortestDelta * alpha;
}

export class ThreeRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(68, 1, 0.1, 700);
  readonly #avatar = new Group();
  readonly #proceduralAvatar = new Group();
  readonly #avatarTarget = new Vector3(
    ARRIVAL_SLICE_POSITIONS.arrivalSpawn.x,
    ARRIVAL_SLICE_POSITIONS.arrivalSpawn.y,
    ARRIVAL_SLICE_POSITIONS.arrivalSpawn.z,
  );
  readonly #cameraTarget = new Vector3();
  readonly #cameraDesired = new Vector3();
  readonly #loomRings: Mesh[] = [];
  readonly #crossingMeshes = new Map<string, Mesh>();
  readonly #crossingTargets = new Map<string, number>();
  readonly #resonanceMaterials: MeshStandardMaterial[] = [];
  readonly #waterTime = { value: 0 };
  readonly #waterState = createStylizedWaterState(this.#waterTime);
  readonly #lastWaterRipplePosition = new Vector2(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );
  readonly #dust: Points;
  readonly #dustBase: Float32Array;
  #resizeObserver: ResizeObserver | null = null;
  readonly #container: HTMLElement;

  #objective: ObjectiveSnapshot = {
    arrivalChimeActivated: false,
    crossingRaised: false,
    loomAwakened: false,
    optionalVistaFound: false,
    checkpoint: 'shore',
  };
  #playerVelocity = new Vector3();
  #playerYaw = 0;
  #playerGrounded = true;
  #avatarLoadStatus: AvatarDiagnostics['status'] = 'loading';
  #avatarAnimation: AvatarAnimationState = 'idle';
  #robotAvatar: RobotAvatar | null = null;
  #contextLost = false;
  #frameAccumulator = 0;
  #frameSamples = 0;
  #metrics: RenderMetrics = { fps: 0, frameTimeMs: 0, drawCalls: 0, triangles: 0 };
  #disposed = false;
  #nextWaterRippleTime = 0;

  constructor(container: HTMLElement) {
    this.#container = container;
    this.#renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.canvas = this.#renderer.domElement;
    this.canvas.dataset['testid'] = 'game-canvas';
    this.canvas.setAttribute('aria-label', 'Resonance Reach game world');
    this.canvas.setAttribute('aria-describedby', 'game-control-instructions');
    this.canvas.setAttribute('role', 'img');
    this.canvas.tabIndex = 0;
    try {
      this.#renderer.outputColorSpace = SRGBColorSpace;
      this.#renderer.toneMapping = ACESFilmicToneMapping;
      this.#renderer.toneMappingExposure = 1.08;
      this.#renderer.shadowMap.enabled = true;
      this.#renderer.shadowMap.type = BasicShadowMap;
      container.append(this.canvas);

      this.canvas.addEventListener('webglcontextlost', this.#onContextLost);
      this.canvas.addEventListener('webglcontextrestored', this.#onContextRestored);

      this.#scene.background = COLOR.skyHorizon;
      this.#scene.fog = new FogExp2('#8db5af', 0.0038);

      this.#buildLights();
      this.#buildSky();
      this.#buildTerrain();
      this.#buildWater();
      this.#buildPathRibbon();
      this.#buildArrivalChime();
      this.#buildCrossing();
      this.#buildLoom();
      this.#buildSilhouettes();
      this.#buildScatter();
      this.#buildAvatar();
      const dust = this.#buildDust();
      this.#dust = dust.points;
      this.#dustBase = dust.base;

      this.#avatar.position.copy(this.#avatarTarget);
      this.#camera.position.set(7, 7, 120);
      this.#camera.lookAt(this.#avatar.position);

      this.#resizeObserver = new ResizeObserver(this.#resize);
      this.#resizeObserver.observe(container);
      window.addEventListener('resize', this.#resize);
      this.#resize();
      this.#loadRobotAvatar();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  get contextLost(): boolean {
    return this.#contextLost;
  }

  get metrics(): RenderMetrics {
    return this.#metrics;
  }

  get avatarDiagnostics(): AvatarDiagnostics {
    return {
      status: this.#avatarLoadStatus,
      kind: this.#avatarLoadStatus === 'ready' ? 'robot-expressive' : 'procedural',
      animation: this.#avatarAnimation,
      activeClip: this.#robotAvatar?.activeClip ?? null,
      clips: this.#robotAvatar?.clipNames ?? [],
    };
  }

  setSnapshot(snapshot: SimulationSnapshot): void {
    const player = snapshot.entities[0];
    if (player !== undefined) {
      this.#avatarTarget.set(
        player.position.cellX * 64 + player.position.localX,
        player.position.y,
        player.position.cellZ * 64 + player.position.localZ,
      );
      this.#playerVelocity.set(...player.velocity);
      this.#playerYaw = player.yaw;
      this.#playerGrounded = player.grounded;
    }

    if (!objectiveEquals(this.#objective, snapshot.objective)) {
      this.#objective = snapshot.objective;
      for (const segment of ARRIVAL_SLICE_DEFINITION.crossingSegments) {
        this.#crossingTargets.set(
          segment.id,
          snapshot.objective.crossingRaised ? segment.activePosition.y : segment.inactivePosition.y,
        );
      }
    }
  }

  render(
    deltaSeconds: number,
    elapsedSeconds: number,
    camera: Readonly<{ yaw: number; pitch: number }>,
    reducedMotion: boolean,
  ): void {
    const smoothing = 1 - Math.exp(-deltaSeconds * 13);
    this.#avatar.position.lerp(this.#avatarTarget, smoothing);
    this.#avatar.rotation.y = lerpAngle(this.#avatar.rotation.y, this.#playerYaw, smoothing);
    const horizontalSpeed = Math.hypot(this.#playerVelocity.x, this.#playerVelocity.z);
    this.#avatarAnimation = selectAvatarAnimation(
      this.#playerGrounded,
      horizontalSpeed,
      this.#avatarAnimation,
    );
    this.#robotAvatar?.update(this.#avatarAnimation, horizontalSpeed, deltaSeconds);
    this.#avatar.rotation.z = MathUtils.lerp(
      this.#avatar.rotation.z,
      this.#avatarLoadStatus === 'ready' ? 0 : Math.min(horizontalSpeed * 0.012, 0.09),
      smoothing,
    );

    const motionScale = reducedMotion ? 0.2 : 1;
    this.#loomRings.forEach((ring, index) => {
      const direction = index % 2 === 0 ? 1 : -1;
      const speed = this.#objective.loomAwakened ? 0.34 + index * 0.08 : 0.06;
      ring.rotation.z += deltaSeconds * speed * direction * motionScale;
      const resonanceMaterial =
        this.#resonanceMaterials[Math.min(index, this.#resonanceMaterials.length - 1)];
      if (resonanceMaterial !== undefined) ring.material = resonanceMaterial;
    });

    this.#crossingMeshes.forEach((mesh, id) => {
      const targetY = this.#crossingTargets.get(id) ?? mesh.position.y;
      mesh.position.y = MathUtils.damp(mesh.position.y, targetY, 5, deltaSeconds);
    });

    this.#waterTime.value = elapsedSeconds * motionScale;
    this.#animateDust(elapsedSeconds, motionScale);

    this.#cameraTarget.copy(this.#avatar.position).add(new Vector3(0, 0.85, 0));
    const horizontalDistance = 6.2 * Math.cos(camera.pitch);
    this.#cameraDesired.set(
      this.#cameraTarget.x + Math.sin(camera.yaw) * horizontalDistance,
      this.#cameraTarget.y + 1.4 - Math.sin(camera.pitch) * 5.2,
      this.#cameraTarget.z + Math.cos(camera.yaw) * horizontalDistance,
    );
    this.#camera.position.lerp(this.#cameraDesired, 1 - Math.exp(-deltaSeconds * 9));
    this.#camera.lookAt(this.#cameraTarget);
    this.#waterState.cameraXZ.value.set(this.#camera.position.x, this.#camera.position.z);

    const avatarTerrainHeight = arrivalTerrainHeight(
      this.#avatar.position.x,
      this.#avatar.position.z,
    );
    const rippleDistance = Math.hypot(
      this.#avatar.position.x - this.#lastWaterRipplePosition.x,
      this.#avatar.position.z - this.#lastWaterRipplePosition.y,
    );
    if (
      avatarTerrainHeight <= 0.35 &&
      horizontalSpeed >= 0.65 &&
      elapsedSeconds >= this.#nextWaterRippleTime &&
      rippleDistance >= 0.7
    ) {
      addStylizedWaterRipple(
        this.#waterState,
        this.#avatar.position.x,
        this.#avatar.position.z,
        this.#waterTime.value,
      );
      this.#lastWaterRipplePosition.set(this.#avatar.position.x, this.#avatar.position.z);
      this.#nextWaterRippleTime = elapsedSeconds + 0.32;
    }

    this.#renderer.render(this.#scene, this.#camera);
    this.#recordMetrics(deltaSeconds);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#resizeObserver?.disconnect();
    window.removeEventListener('resize', this.#resize);
    this.canvas.removeEventListener('webglcontextlost', this.#onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.#onContextRestored);
    this.#robotAvatar?.dispose();
    this.#scene.traverse((object) => {
      const renderable = object as unknown as {
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
    this.#renderer.dispose();
    this.canvas.remove();
  }

  #buildLights(): void {
    this.#scene.add(new HemisphereLight('#b9e3d8', '#183a3f', 2.5));
    this.#scene.add(new AmbientLight('#ffceae', 0.55));

    const sun = new DirectionalLight('#ffe0b8', 4.2);
    sun.position.set(-38, 74, 52);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -95;
    sun.shadow.camera.right = 95;
    sun.shadow.camera.top = 95;
    sun.shadow.camera.bottom = -95;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 210;
    sun.shadow.bias = -0.00018;
    this.#scene.add(sun);
  }

  #buildSky(): void {
    const geometry = new SphereGeometry(500, 28, 16);
    const material = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: COLOR.skyTop },
        horizonColor: { value: COLOR.skyHorizon },
        sunColor: { value: new Color('#ffe4ba') },
      },
      vertexShader: `
        varying vec3 worldDirection;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          worldDirection = normalize(worldPosition.xyz - cameraPosition);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunColor;
        varying vec3 worldDirection;
        void main() {
          float heightMix = smoothstep(-0.12, 0.68, worldDirection.y);
          vec3 color = mix(horizonColor, topColor, heightMix);
          vec3 sunDirection = normalize(vec3(-0.44, 0.55, 0.7));
          float sun = pow(max(dot(worldDirection, sunDirection), 0.0), 180.0);
          color += sunColor * sun * 1.8;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const sky = new Mesh(geometry, material);
    this.#scene.add(sky);
  }

  #buildTerrain(): void {
    const columns = ARRIVAL_TERRAIN_RESOLUTION.columns;
    const rows = ARRIVAL_TERRAIN_RESOLUTION.rows;
    const vertices = new Float32Array(columns * rows * 3);
    const colors = new Float32Array(columns * rows * 3);
    const indices: number[] = [];
    const vertexColor = new Color();

    for (let row = 0; row < rows; row += 1) {
      const z = ARRIVAL_TERRAIN_ORIGIN.z + row * ARRIVAL_TERRAIN_CELL_SIZE_METERS;
      for (let column = 0; column < columns; column += 1) {
        const x = ARRIVAL_TERRAIN_ORIGIN.x + column * ARRIVAL_TERRAIN_CELL_SIZE_METERS;
        const height = arrivalTerrainHeight(x, z);
        const offset = (row * columns + column) * 3;
        vertices[offset] = x;
        vertices[offset + 1] = height;
        vertices[offset + 2] = z;

        if (height < 1.8) {
          vertexColor.copy(COLOR.sand).lerp(COLOR.coral, MathUtils.clamp((z - 96) / 44, 0, 0.18));
        } else if (height < 8.5) {
          vertexColor.copy(COLOR.grass).lerp(COLOR.rock, MathUtils.clamp(Math.abs(x) / 90, 0, 0.5));
        } else {
          vertexColor
            .copy(COLOR.rock)
            .lerp(COLOR.cliff, MathUtils.clamp((height - 9) / 8, 0, 0.72));
        }
        colors[offset] = vertexColor.r;
        colors[offset + 1] = vertexColor.g;
        colors[offset + 2] = vertexColor.b;
      }
    }

    for (let row = 0; row < rows - 1; row += 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        const northWest = row * columns + column;
        const northEast = northWest + 1;
        const southWest = northWest + columns;
        const southEast = southWest + 1;
        indices.push(northWest, southWest, northEast, northEast, southWest, southEast);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const terrain = new Mesh(geometry, createStylizedTerrainMaterial());
    terrain.receiveShadow = true;
    this.#scene.add(terrain);
  }

  #buildWater(): void {
    const waterMaterial = createStylizedWaterMaterial(this.#waterState);
    const water = new Mesh(new PlaneGeometry(420, 430, 1, 1), waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.12, 38);
    water.renderOrder = 3;
    this.#scene.add(water);

    const pondSeabed = new Mesh(
      new CircleGeometry(1, 64),
      createStylizedSeabedMaterial(this.#waterState),
    );
    pondSeabed.rotation.x = -Math.PI / 2;
    pondSeabed.position.set(ARRIVAL_POND.centerX, ARRIVAL_POND.bedY + 0.02, ARRIVAL_POND.centerZ);
    pondSeabed.scale.set(ARRIVAL_POND.radiusX * 0.76, ARRIVAL_POND.radiusZ * 0.76, 1);
    pondSeabed.renderOrder = 2;
    this.#scene.add(pondSeabed);

    const pond = new Mesh(new CircleGeometry(1, 64), waterMaterial);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(ARRIVAL_POND.centerX, ARRIVAL_POND.surfaceY, ARRIVAL_POND.centerZ);
    pond.scale.set(ARRIVAL_POND.radiusX * 0.74, ARRIVAL_POND.radiusZ * 0.74, 1);
    pond.renderOrder = 3;
    this.#scene.add(pond);
  }

  #buildPathRibbon(): void {
    const routePoints = [
      ARRIVAL_SLICE_POSITIONS.arrivalSpawn,
      { x: -2, y: 2.1, z: 96 },
      ARRIVAL_SLICE_POSITIONS.mantleLedge,
      ARRIVAL_SLICE_POSITIONS.revealRidge,
      ARRIVAL_SLICE_POSITIONS.arrivalChime,
      { x: 2, y: 11, z: 34 },
    ].map(
      (position) =>
        new Vector3(position.x, arrivalTerrainHeight(position.x, position.z) + 0.12, position.z),
    );
    const curve = new CatmullRomCurve3(routePoints, false, 'catmullrom', 0.28);
    const ribbonMaterial = new MeshStandardMaterial({
      color: COLOR.resonance,
      emissive: COLOR.resonance,
      emissiveIntensity: 2.7,
      roughness: 0.25,
      metalness: 0.2,
    });
    this.#resonanceMaterials.push(ribbonMaterial);
    const ribbon = new Mesh(new TubeGeometry(curve, 180, 0.045, 5, false), ribbonMaterial);
    this.#scene.add(ribbon);
  }

  #buildArrivalChime(): void {
    const position = ARRIVAL_SLICE_POSITIONS.arrivalChime;
    const definition = ARRIVAL_SLICE_DEFINITION.content.arrivalChime;
    const group = new Group();
    group.position.set(position.x, arrivalTerrainHeight(position.x, position.z), position.z);

    const stoneMaterial = new MeshStandardMaterial({
      color: '#786b68',
      roughness: 0.8,
    });
    const resonanceMaterial = new MeshStandardMaterial({
      color: COLOR.resonance,
      emissive: COLOR.resonance,
      emissiveIntensity: 3.2,
      roughness: 0.18,
      metalness: 0.3,
    });
    this.#resonanceMaterials.push(resonanceMaterial);

    const base = new Mesh(
      new CylinderGeometry(
        definition.footprintRadiusMeters * 0.82,
        definition.footprintRadiusMeters,
        0.7,
        9,
      ),
      stoneMaterial,
    );
    base.position.y = 0.35;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    for (let index = 0; index < 3; index += 1) {
      const angle = (index / 3) * Math.PI * 2;
      const fin = new Mesh(new BoxGeometry(0.32, 3.2, 0.72), stoneMaterial);
      const finRadius = definition.footprintRadiusMeters * 0.46;
      fin.position.set(Math.sin(angle) * finRadius, 2, Math.cos(angle) * finRadius);
      fin.rotation.y = angle;
      fin.rotation.z = index === 1 ? 0.12 : -0.08;
      fin.castShadow = true;
      group.add(fin);
    }

    const core = new Mesh(new OctahedronGeometry(0.7, 0), resonanceMaterial);
    core.position.y = 3.1;
    core.castShadow = true;
    group.add(core);
    const halo = new Mesh(new TorusGeometry(1.05, 0.08, 8, 48), resonanceMaterial);
    halo.position.y = 3.1;
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
    const light = new PointLight(COLOR.resonance, 7, 18, 2);
    light.position.y = 3.2;
    group.add(light);
    this.#scene.add(group);
  }

  #buildCrossing(): void {
    const material = new MeshStandardMaterial({
      color: '#9c776a',
      emissive: '#512f2b',
      emissiveIntensity: 0.25,
      roughness: 0.74,
    });
    for (const segment of ARRIVAL_SLICE_DEFINITION.crossingSegments) {
      const mesh = this.#createCrossingMesh(segment, material);
      this.#crossingMeshes.set(segment.id, mesh);
      this.#crossingTargets.set(segment.id, segment.inactivePosition.y);
      this.#scene.add(mesh);
    }
  }

  #createCrossingMesh(segment: CrossingSegmentDescriptor, material: MeshStandardMaterial): Mesh {
    const geometry = new BoxGeometry(
      segment.sizeMeters.x,
      segment.sizeMeters.y,
      segment.sizeMeters.z,
      2,
      1,
      2,
    );
    const mesh = new Mesh(geometry, material);
    mesh.position.set(
      segment.inactivePosition.x,
      segment.inactivePosition.y,
      segment.inactivePosition.z,
    );
    mesh.rotation.y = (segment.order - 1) * 0.08;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  #buildLoom(): void {
    const definition = ARRIVAL_SLICE_DEFINITION.content.loom;
    const position = ARRIVAL_SLICE_POSITIONS.loom;
    const group = new Group();
    const groundY = arrivalTerrainHeight(position.x, position.z);
    group.position.set(position.x, groundY, position.z);

    const stone = new MeshStandardMaterial({
      color: '#8d7068',
      roughness: 0.72,
      metalness: 0.08,
    });
    const darkStone = new MeshStandardMaterial({
      color: '#304a50',
      roughness: 0.84,
    });
    const glow = new MeshStandardMaterial({
      color: COLOR.resonance,
      emissive: COLOR.resonance,
      emissiveIntensity: 3.8,
      roughness: 0.14,
      metalness: 0.35,
    });
    this.#resonanceMaterials.push(glow);

    const platform = new Mesh(
      new CylinderGeometry(
        definition.platformRadiusMeters,
        definition.platformRadiusMeters,
        definition.platformHeightMeters,
        definition.platformSides,
      ),
      stone,
    );
    platform.position.y = definition.platformCenterOffsetYMeters;
    platform.castShadow = true;
    platform.receiveShadow = true;
    group.add(platform);

    for (let radius = 4; radius <= 13; radius += 3) {
      const inlay = new Mesh(new RingGeometry(radius - 0.05, radius + 0.05, 72), glow);
      inlay.rotation.x = -Math.PI / 2;
      inlay.position.y =
        definition.platformCenterOffsetYMeters + definition.platformHeightMeters / 2 + 0.01;
      group.add(inlay);
    }

    for (let index = 0; index < definition.ringCount; index += 1) {
      const ring = new Mesh(
        new TorusGeometry(
          definition.ringDiameterMeters * 0.5 + index * 0.72,
          definition.ringThicknessMeters,
          10,
          72,
        ),
        index === 1 ? glow : darkStone,
      );
      ring.position.y = 6.6;
      ring.rotation.set(Math.PI / 2 + index * 0.48, index * 0.7, index * 0.36);
      ring.castShadow = true;
      this.#loomRings.push(ring);
      group.add(ring);
    }

    const core = new Mesh(new OctahedronGeometry(1.75, 1), glow);
    core.position.y = 6.6;
    core.castShadow = true;
    group.add(core);
    const coreLight = new PointLight(COLOR.resonance, 10, 42, 2);
    coreLight.position.y = 6.6;
    group.add(coreLight);

    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2;
      const pillar = new Mesh(new BoxGeometry(1.25, 7.5, 1.25), darkStone);
      pillar.position.set(Math.sin(angle) * 10.5, 4.2, Math.cos(angle) * 10.5);
      pillar.rotation.y = -angle;
      pillar.rotation.z = Math.sin(angle) * 0.1;
      pillar.castShadow = true;
      group.add(pillar);
    }

    for (const socket of definition.sockets) {
      const socketBase = new Mesh(new CylinderGeometry(1.25, 1.65, 1, 8), darkStone);
      const platformTop =
        definition.platformCenterOffsetYMeters + definition.platformHeightMeters / 2;
      socketBase.position.set(socket.position.x, platformTop + 0.5, socket.position.z);
      socketBase.castShadow = true;
      group.add(socketBase);
      const socketGlow = new Mesh(new OctahedronGeometry(0.45, 0), glow);
      socketGlow.position.set(socket.position.x, platformTop + 1.25, socket.position.z);
      group.add(socketGlow);
    }

    this.#scene.add(group);
  }

  #buildSilhouettes(): void {
    for (const silhouette of ARRIVAL_SLICE_DEFINITION.content.distantSilhouettes) {
      this.#scene.add(this.#createSilhouette(silhouette));
    }
    for (let index = 0; index < 13; index += 1) {
      const cloud = new Group();
      const random = seededRandom(ARRIVAL_SLICE_DEFINITION.seed + index * 71);
      cloud.position.set((random() - 0.5) * 330, 38 + random() * 32, -70 - random() * 180);
      for (let puff = 0; puff < 4; puff += 1) {
        const sphere = new Mesh(
          new SphereGeometry(7 + random() * 8, 8, 6),
          new MeshBasicMaterial({
            color: '#dae4d9',
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
          }),
        );
        sphere.position.set((puff - 1.5) * 8, random() * 3, (random() - 0.5) * 8);
        sphere.scale.y = 0.42;
        cloud.add(sphere);
      }
      this.#scene.add(cloud);
    }
  }

  #createSilhouette(definition: DistantSilhouetteDescriptor): Group {
    const anchor = ARRIVAL_SLICE_DEFINITION.anchors.find(
      (candidate) => candidate.id === definition.anchorId,
    );
    const group = new Group();
    if (anchor === undefined) return group;
    group.position.copy(toVector3(anchor.position));
    const material = new MeshStandardMaterial({
      color: definition.palette.primary,
      emissive: definition.palette.shadow,
      emissiveIntensity: 0.12,
      roughness: 0.98,
    });

    if (definition.archetype === 'forest-basin') {
      for (let index = 0; index < 11; index += 1) {
        const tree = new Mesh(new ConeGeometry(4 + (index % 3) * 2, 18 + index * 1.2, 6), material);
        tree.position.set((index - 5) * 7, (index % 4) * 2, Math.abs(index - 5) * 2);
        group.add(tree);
      }
    } else if (definition.archetype === 'wind-canyon') {
      for (let index = 0; index < 5; index += 1) {
        const mesa = new Mesh(new CylinderGeometry(6, 12, 32 + index * 5, 7), material);
        mesa.position.set((index - 2) * 15, index * 2, Math.abs(index - 2) * 4);
        group.add(mesa);
      }
    } else if (definition.archetype === 'sky-ruin') {
      const island = new Mesh(new IcosahedronGeometry(22, 1), material);
      island.scale.set(1.25, 0.38, 0.85);
      group.add(island);
      for (let index = 0; index < 4; index += 1) {
        const tower = new Mesh(new BoxGeometry(3.5, 28 + index * 9, 3.5), material);
        tower.position.set((index - 1.5) * 10, 16 + index * 3, (index % 2) * 5);
        group.add(tower);
      }
    } else {
      const spire = new Mesh(new CylinderGeometry(1.8, 7, 70, 7), material);
      spire.position.y = 28;
      group.add(spire);
      const halo = new Mesh(
        new TorusGeometry(10, 0.65, 8, 40),
        new MeshBasicMaterial({ color: definition.palette.accent }),
      );
      halo.position.y = 65;
      halo.rotation.x = Math.PI / 2;
      group.add(halo);
    }

    return group;
  }

  #buildScatter(): void {
    const random = seededRandom(ARRIVAL_SLICE_DEFINITION.seed ^ 0x5ca7_7e2);
    const rockGeometry = new IcosahedronGeometry(1, 1);
    const rockMaterial = new MeshStandardMaterial({ color: COLOR.rock, roughness: 0.96 });
    const rocks = new InstancedMesh(rockGeometry, rockMaterial, 96);
    const transform = new Matrix4();
    const rotation = new Quaternion();
    const scale = new Vector3();
    const position = new Vector3();
    for (let index = 0; index < 96; index += 1) {
      let x = (random() - 0.5) * 154;
      const z = -15 + random() * 150;
      if (Math.abs(x) < 13) x += x < 0 ? -15 : 15;
      const y = arrivalTerrainHeight(x, z);
      position.set(x, y + 0.4, z);
      rotation.setFromAxisAngle(new Vector3(0, 1, 0), random() * Math.PI * 2);
      const size = 0.55 + random() * 2.1;
      scale.set(size * (0.7 + random() * 0.7), size, size * (0.75 + random() * 0.5));
      transform.compose(position, rotation, scale);
      rocks.setMatrixAt(index, transform);
    }
    rocks.instanceMatrix.setUsage(DynamicDrawUsage);
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.#scene.add(rocks);

    const grass = createStylizedGrassField({
      count: 11_000,
      time: this.#waterTime,
      heightAt: arrivalTerrainHeight,
      random,
    });
    this.#scene.add(grass);

    const launchGrass = createStylizedGrassField({
      count: 53_000,
      time: this.#waterTime,
      heightAt: arrivalTerrainHeight,
      random,
      placement: {
        centerX: ARRIVAL_POND.centerX,
        centerZ: ARRIVAL_POND.centerZ,
        radiusX: 14,
        radiusZ: 16,
        excludeRadiusX: ARRIVAL_POND.radiusX * 0.78,
        excludeRadiusZ: ARRIVAL_POND.radiusZ * 0.78,
        edgeSoftness: 0.3,
      },
      clearPath: true,
      minTerrainHeight: ARRIVAL_POND.bedY + 0.05,
      maxTerrainHeight: 3,
      minBladeHeight: 0.42,
      maxBladeHeight: 0.92,
      minBladeWidth: 0.05,
      maxBladeWidth: 0.085,
      dirtInfluence: 0.08,
    });
    this.#scene.add(launchGrass);

    const coralGeometry = new ConeGeometry(0.22, 1.8, 5);
    const coralMaterial = new MeshStandardMaterial({
      color: COLOR.coral,
      emissive: '#5e2e39',
      emissiveIntensity: 0.22,
      roughness: 0.75,
    });
    const coral = new InstancedMesh(coralGeometry, coralMaterial, 72);
    for (let index = 0; index < 72; index += 1) {
      let x = (random() - 0.5) * 88;
      const z = 89 + random() * 43;
      if (Math.abs(x) < 6) x += x < 0 ? -8 : 8;
      const y = arrivalTerrainHeight(x, z);
      const size = 0.55 + random() * 1.3;
      position.set(x, y + size * 0.75, z);
      rotation.setFromAxisAngle(new Vector3(0, 1, 0), random() * Math.PI * 2);
      scale.set(size * 0.7, size, size * 0.7);
      transform.compose(position, rotation, scale);
      coral.setMatrixAt(index, transform);
    }
    this.#scene.add(coral);
  }

  #buildAvatar(): void {
    const visual = this.#proceduralAvatar;
    visual.position.y = AVATAR_VISUAL_VERTICAL_OFFSET_METERS;
    const bodyMaterial = new MeshPhysicalMaterial({
      color: '#f0a46f',
      roughness: 0.52,
      clearcoat: 0.25,
    });
    const mantleMaterial = new MeshStandardMaterial({
      color: '#205e68',
      emissive: '#153f48',
      emissiveIntensity: 0.35,
      roughness: 0.68,
      side: DoubleSide,
    });
    const glow = new MeshStandardMaterial({
      color: COLOR.resonance,
      emissive: COLOR.resonance,
      emissiveIntensity: 3,
      roughness: 0.18,
    });
    const body = new Mesh(new CapsuleGeometry(0.38, 0.86, 6, 12), bodyMaterial);
    body.position.y = 0.08;
    body.castShadow = true;
    visual.add(body);
    const head = new Mesh(new SphereGeometry(0.36, 16, 10), bodyMaterial);
    head.position.y = 0.97;
    head.castShadow = true;
    visual.add(head);
    const mantle = new Mesh(new ConeGeometry(0.72, 1.25, 5, 1, true), mantleMaterial);
    mantle.position.set(0, 0.25, 0.24);
    mantle.rotation.x = 0.16;
    visual.add(mantle);
    const mark = new Mesh(new OctahedronGeometry(0.12, 0), glow);
    mark.position.set(0, 0.38, -0.39);
    visual.add(mark);
    const scarf = new Mesh(new PlaneGeometry(0.28, 1.8, 1, 4), mantleMaterial);
    scarf.position.set(0.35, 0.45, 0.55);
    scarf.rotation.set(-0.25, 0, -0.12);
    visual.add(scarf);
    this.#avatar.add(visual);
    this.#scene.add(this.#avatar);
  }

  #loadRobotAvatar(): void {
    void import('./RobotAvatar')
      .then(({ loadRobotAvatar }) => {
        if (this.#disposed) return;
        return loadRobotAvatar(ROBOT_AVATAR_URL);
      })
      .then((robotAvatar) => {
        if (robotAvatar === undefined) return;
        if (this.#disposed) {
          robotAvatar.dispose();
          return;
        }

        this.#robotAvatar = robotAvatar;
        this.#avatar.add(robotAvatar.visual);
        robotAvatar.update(
          this.#avatarAnimation,
          Math.hypot(this.#playerVelocity.x, this.#playerVelocity.z),
          0,
        );
        this.#proceduralAvatar.visible = false;
        this.#avatarLoadStatus = 'ready';
      })
      .catch(() => {
        this.#showAvatarFallback();
      });
  }

  #showAvatarFallback(): void {
    if (this.#disposed) return;
    this.#robotAvatar?.dispose();
    this.#robotAvatar = null;
    this.#avatarLoadStatus = 'fallback';
    this.#proceduralAvatar.visible = true;
  }

  #buildDust(): { points: Points; base: Float32Array } {
    const random = seededRandom(ARRIVAL_SLICE_DEFINITION.seed + 0x77aa);
    const positions = new Float32Array(480 * 3);
    for (let index = 0; index < 480; index += 1) {
      const offset = index * 3;
      positions[offset] = (random() - 0.5) * 170;
      positions[offset + 1] = 2 + random() * 20;
      positions[offset + 2] = -20 + random() * 160;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const points = new Points(
      geometry,
      new PointsMaterial({
        color: '#d9f6de',
        size: 0.16,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    this.#scene.add(points);
    return { points, base: positions.slice() };
  }

  #animateDust(elapsedSeconds: number, motionScale: number): void {
    const attribute = this.#dust.geometry.getAttribute('position') as BufferAttribute;
    const positions = attribute.array as Float32Array;
    for (let index = 0; index < positions.length; index += 3) {
      const baseX = this.#dustBase[index] ?? 0;
      const baseY = this.#dustBase[index + 1] ?? 0;
      positions[index] = baseX + Math.sin(elapsedSeconds * 0.16 + index) * 0.8 * motionScale;
      positions[index + 1] =
        baseY + Math.sin(elapsedSeconds * 0.23 + index * 0.2) * 0.6 * motionScale;
    }
    attribute.needsUpdate = true;
  }

  #recordMetrics(deltaSeconds: number): void {
    this.#frameAccumulator += deltaSeconds;
    this.#frameSamples += 1;
    if (this.#frameAccumulator < 0.5) return;
    this.#metrics = {
      fps: Math.round(this.#frameSamples / this.#frameAccumulator),
      frameTimeMs: Math.round((this.#frameAccumulator / this.#frameSamples) * 10_000) / 10,
      drawCalls: this.#renderer.info.render.calls,
      triangles: this.#renderer.info.render.triangles,
    };
    this.#frameAccumulator = 0;
    this.#frameSamples = 0;
  }

  readonly #resize = (): void => {
    const width = Math.max(1, this.#container.clientWidth);
    const height = Math.max(1, this.#container.clientHeight);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.#renderer.setSize(width, height, false);
  };

  readonly #onContextLost = (event: Event): void => {
    event.preventDefault();
    this.#contextLost = true;
  };

  readonly #onContextRestored = (): void => {
    this.#contextLost = false;
    this.#renderer.toneMapping = CineonToneMapping;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
  };
}
