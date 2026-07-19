import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KeyboardInput } from './KeyboardInput';

let windowTarget: EventTarget;
let canvas: HTMLCanvasElement;
let pointerLockElement: Element | null;

function dispatchPointerMovement(movementX: number, movementY: number): void {
  const event = new Event('pointermove');
  Object.defineProperties(event, {
    movementX: { value: movementX },
    movementY: { value: movementY },
  });
  windowTarget.dispatchEvent(event);
}

function stubGamepads(gamepads: readonly (Gamepad | null)[]): void {
  vi.stubGlobal('navigator', {
    getGamepads: () => gamepads,
  });
}

beforeEach(() => {
  windowTarget = new EventTarget();
  canvas = Object.assign(new EventTarget(), {
    focus: vi.fn(),
    requestPointerLock: vi.fn(),
  }) as unknown as HTMLCanvasElement;
  pointerLockElement = null;

  vi.stubGlobal('window', windowTarget);
  vi.stubGlobal('document', {
    get pointerLockElement() {
      return pointerLockElement;
    },
    exitPointerLock: vi.fn(() => {
      pointerLockElement = null;
    }),
  });
  stubGamepads([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('KeyboardInput camera sensitivity', () => {
  it.each([
    [0.35, -0.077],
    [1, -0.22],
    [2, -0.44],
  ])('applies a %s× multiplier to pointer look', (multiplier, expectedYaw) => {
    const input = new KeyboardInput();
    input.attach(canvas);
    input.setEnabled(true);
    input.setCamera(0, 0);
    input.setSensitivityMultiplier(multiplier);
    pointerLockElement = canvas;

    dispatchPointerMovement(100, 0);

    expect(input.camera.yaw).toBeCloseTo(expectedYaw);
    expect(input.camera.pitch).toBe(0);
    input.detach();
  });

  it('ignores pointer movement without pointer lock', () => {
    const input = new KeyboardInput();
    input.attach(canvas);
    input.setEnabled(true);
    input.setCamera(0, 0);
    input.setSensitivityMultiplier(2);

    dispatchPointerMovement(100, 100);

    expect(input.camera).toEqual({ yaw: 0, pitch: 0 });
    input.detach();
  });

  it.each([
    [0, -0.077],
    [3, -0.44],
    [Number.NaN, -0.22],
  ])('keeps an unsupported %s multiplier within the public range', (multiplier, expectedYaw) => {
    const input = new KeyboardInput();
    input.attach(canvas);
    input.setEnabled(true);
    input.setCamera(0, 0);
    input.setSensitivityMultiplier(multiplier);
    pointerLockElement = canvas;

    dispatchPointerMovement(100, 0);

    expect(input.camera.yaw).toBeCloseTo(expectedYaw);
    input.detach();
  });

  it.each([
    [0.35, -0.007875, 0.00525],
    [1, -0.0225, 0.015],
    [2, -0.045, 0.03],
  ])(
    'applies a %s× multiplier to gamepad look after the deadzone',
    (multiplier, expectedYaw, expectedPitch) => {
      stubGamepads([
        {
          connected: true,
          axes: [0, 0, 0.5, -0.5],
          buttons: [],
        } as unknown as Gamepad,
      ]);
      const input = new KeyboardInput();
      input.setCamera(0, 0);
      input.setSensitivityMultiplier(multiplier);

      input.sample(1, 1);

      expect(input.camera.yaw).toBeCloseTo(expectedYaw);
      expect(input.camera.pitch).toBeCloseTo(expectedPitch);
    },
  );

  it('preserves the gamepad look deadzone', () => {
    stubGamepads([
      {
        connected: true,
        axes: [0, 0, 0.12, -0.12],
        buttons: [],
      } as unknown as Gamepad,
    ]);
    const input = new KeyboardInput();
    input.setCamera(0, 0);
    input.setSensitivityMultiplier(2);

    input.sample(1, 1);

    expect(input.camera).toEqual({ yaw: 0, pitch: 0 });
  });
});
