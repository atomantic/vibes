import {
  AnimationAction,
  AnimationMixer,
  Box3,
  BufferGeometry,
  Group,
  LoopOnce,
  LoopRepeat,
  Material,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { avatarAnimationPlaybackRate, type AvatarAnimationState } from './avatarAnimation';

const AVATAR_STANDING_HALF_HEIGHT_METERS = 1.1;
const ROBOT_AVATAR_HEIGHT_METERS = AVATAR_STANDING_HALF_HEIGHT_METERS * 2;
const AVATAR_CROSSFADE_SECONDS = 0.16;
const ROBOT_AVATAR_CLIPS: Readonly<Record<AvatarAnimationState, string>> = {
  idle: 'Idle',
  walk: 'Walking',
  run: 'Running',
  jump: 'Jump',
};

export interface RobotAvatar {
  readonly visual: Group;
  readonly activeClip: string | null;
  readonly clipNames: readonly string[];
  update(state: AvatarAnimationState, horizontalSpeed: number, deltaSeconds: number): void;
  dispose(): void;
}

function disposeObjectResources(root: Object3D): void {
  root.traverse((object) => {
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
    if (object instanceof SkinnedMesh) object.skeleton.dispose();
  });
}

function applyVibesPalette(root: Object3D): void {
  const updatedMaterials = new Set<Material>();
  root.traverse((object) => {
    const mesh = object as unknown as {
      castShadow?: boolean;
      receiveShadow?: boolean;
      readonly material?: Material | Material[];
    };
    if (mesh.material === undefined) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial) || updatedMaterials.has(material)) continue;
      updatedMaterials.add(material);
      switch (material.name) {
        case 'Main':
          material.color.set('#e98568');
          material.emissive.set('#3c191d');
          material.emissiveIntensity = 0.16;
          break;
        case 'Grey':
          material.color.set('#39777b');
          material.emissive.set('#102f35');
          material.emissiveIntensity = 0.12;
          break;
        case 'Black':
          material.color.set('#142f36');
          break;
      }
      material.metalness = 0.18;
      material.roughness = 0.68;
      material.needsUpdate = true;
    }
  });
}

class LoadedRobotAvatar implements RobotAvatar {
  readonly visual: Group;
  readonly clipNames: readonly string[];
  readonly #modelRoot: Object3D;
  readonly #mixer: AnimationMixer;
  readonly #actions = new Map<AvatarAnimationState, AnimationAction>();
  #activeAction: AnimationAction | null = null;
  #disposed = false;

  constructor(modelRoot: Object3D, animations: readonly import('three').AnimationClip[]) {
    const bounds = new Box3().setFromObject(modelRoot);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0) {
      throw new Error('RobotExpressive has invalid model bounds.');
    }

    const clipsByName = new Map(animations.map((clip) => [clip.name, clip]));
    for (const clipName of Object.values(ROBOT_AVATAR_CLIPS)) {
      if (!clipsByName.has(clipName)) {
        throw new Error(`RobotExpressive is missing the ${clipName} animation.`);
      }
    }

    this.#modelRoot = modelRoot;
    this.clipNames = animations.map(({ name }) => name);
    this.visual = new Group();
    const scale = ROBOT_AVATAR_HEIGHT_METERS / size.y;
    modelRoot.position.set(-center.x, -bounds.min.y, -center.z);
    this.visual.position.y = -AVATAR_STANDING_HALF_HEIGHT_METERS;
    this.visual.rotation.y = Math.PI;
    this.visual.scale.setScalar(scale);
    this.visual.add(modelRoot);
    applyVibesPalette(modelRoot);

    this.#mixer = new AnimationMixer(modelRoot);
    for (const [state, clipName] of Object.entries(ROBOT_AVATAR_CLIPS) as [
      AvatarAnimationState,
      string,
    ][]) {
      const clip = clipsByName.get(clipName);
      if (clip !== undefined) this.#actions.set(state, this.#mixer.clipAction(clip));
    }
  }

  get activeClip(): string | null {
    return this.#activeAction?.getClip().name ?? null;
  }

  update(state: AvatarAnimationState, horizontalSpeed: number, deltaSeconds: number): void {
    if (this.#disposed) return;
    const nextAction = this.#actions.get(state);
    if (nextAction === undefined) return;

    const playbackRate = avatarAnimationPlaybackRate(state, horizontalSpeed);
    if (nextAction !== this.#activeAction) {
      const previousAction = this.#activeAction;
      previousAction?.fadeOut(AVATAR_CROSSFADE_SECONDS);
      nextAction.reset();
      nextAction.enabled = true;
      nextAction.clampWhenFinished = state === 'jump';
      nextAction.setLoop(
        state === 'jump' ? LoopOnce : LoopRepeat,
        state === 'jump' ? 1 : Number.POSITIVE_INFINITY,
      );
      nextAction.setEffectiveWeight(1);
      nextAction.setEffectiveTimeScale(playbackRate);
      if (previousAction !== null) nextAction.fadeIn(AVATAR_CROSSFADE_SECONDS);
      nextAction.play();
      this.#activeAction = nextAction;
    } else {
      nextAction.setEffectiveTimeScale(playbackRate);
    }
    this.#mixer.update(deltaSeconds);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#mixer.stopAllAction();
    this.#mixer.uncacheRoot(this.#modelRoot);
    this.visual.removeFromParent();
    disposeObjectResources(this.#modelRoot);
  }
}

export function loadRobotAvatar(url: string): Promise<RobotAvatar> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        try {
          resolve(new LoadedRobotAvatar(gltf.scene, gltf.animations));
        } catch (error) {
          disposeObjectResources(gltf.scene);
          reject(error instanceof Error ? error : new Error('RobotExpressive is invalid.'));
        }
      },
      undefined,
      (error) => {
        reject(error instanceof Error ? error : new Error('RobotExpressive failed to load.'));
      },
    );
  });
}
