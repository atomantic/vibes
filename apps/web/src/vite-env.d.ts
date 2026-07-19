/// <reference types="vite/client" />

interface VibesTestHook {
  ready: boolean;
  tick: number;
  position: { x: number; y: number; z: number };
  yaw: number;
  camera: { yaw: number; pitch: number };
  setCamera: (yaw: number, pitch: number) => void;
  frames: number;
  contextLost: boolean;
  paused: boolean;
  avatar: import('./game/render/ThreeRenderer').AvatarDiagnostics;
}

interface Window {
  __VIBES_TEST__?: VibesTestHook;
}
