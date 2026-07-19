/// <reference types="vite/client" />

interface VibesTestHook {
  ready: boolean;
  tick: number;
  position: { x: number; y: number; z: number };
  frames: number;
  contextLost: boolean;
  paused: boolean;
}

interface Window {
  __VIBES_TEST__: VibesTestHook;
}
