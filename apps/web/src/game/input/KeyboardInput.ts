import { InputButton, type InputFrame } from '@vibes/protocol';

const TWO_PI = Math.PI * 2;

function normalizeYaw(value: number): number {
  let normalized = value % TWO_PI;
  if (normalized > Math.PI) normalized -= TWO_PI;
  if (normalized < -Math.PI) normalized += TWO_PI;
  return normalized;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export class KeyboardInput {
  readonly #pressed = new Set<string>();
  #canvas: HTMLCanvasElement | null = null;
  #enabled = false;
  #yaw = 0;
  #pitch = -0.24;
  #sensitivity = 0.0022;

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (!this.#enabled || event.repeat) return;
    this.#pressed.add(event.code);

    if (event.code === 'Space' || event.code === 'KeyE' || event.code === 'KeyR') {
      event.preventDefault();
    }
  };

  readonly #onKeyUp = (event: KeyboardEvent): void => {
    this.#pressed.delete(event.code);
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    if (!this.#enabled || document.pointerLockElement !== this.#canvas) return;
    this.#yaw = normalizeYaw(this.#yaw - event.movementX * this.#sensitivity);
    this.#pitch = clamp(this.#pitch - event.movementY * this.#sensitivity, -1.15, 0.55);
  };

  readonly #onCanvasClick = (): void => {
    if (this.#enabled && this.#canvas !== null && document.pointerLockElement === null) {
      this.#canvas.focus();
      try {
        const request = this.#canvas.requestPointerLock();
        void Promise.resolve(request).catch(() => {
          // Pointer lock is unavailable in some embedded/headless contexts; focused input still works.
        });
      } catch {
        // Legacy implementations may throw synchronously; focused input still works.
      }
    }
  };

  attach(canvas: HTMLCanvasElement): void {
    this.detach();
    this.#canvas = canvas;
    canvas.addEventListener('click', this.#onCanvasClick);
    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('keyup', this.#onKeyUp);
    window.addEventListener('pointermove', this.#onPointerMove);
    window.addEventListener('blur', this.#clearPressed);
  }

  detach(): void {
    this.#canvas?.removeEventListener('click', this.#onCanvasClick);
    window.removeEventListener('keydown', this.#onKeyDown);
    window.removeEventListener('keyup', this.#onKeyUp);
    window.removeEventListener('pointermove', this.#onPointerMove);
    window.removeEventListener('blur', this.#clearPressed);
    this.#canvas = null;
    this.#clearPressed();
  }

  readonly #clearPressed = (): void => {
    this.#pressed.clear();
  };

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (!enabled) {
      this.#clearPressed();
      if (document.pointerLockElement === this.#canvas) document.exitPointerLock();
    }
  }

  setSensitivity(value: number): void {
    this.#sensitivity = clamp(value, 0.0006, 0.006);
  }

  setCamera(yaw: number, pitch: number): void {
    this.#yaw = normalizeYaw(yaw);
    this.#pitch = clamp(pitch, -1.15, 0.55);
  }

  get camera(): Readonly<{ yaw: number; pitch: number }> {
    return { yaw: this.#yaw, pitch: this.#pitch };
  }

  sample(sequence: number, intendedTick: number): InputFrame {
    const gamepad = navigator.getGamepads().find((candidate) => candidate?.connected);
    let moveX = Number(this.#pressed.has('KeyD')) - Number(this.#pressed.has('KeyA'));
    let moveZ = Number(this.#pressed.has('KeyW')) - Number(this.#pressed.has('KeyS'));
    let buttons = 0;

    if (this.#pressed.has('Space')) buttons |= InputButton.Jump;
    if (this.#pressed.has('ShiftLeft') || this.#pressed.has('ShiftRight')) {
      buttons |= InputButton.Sprint;
    }
    if (this.#pressed.has('KeyE')) buttons |= InputButton.Interact;
    if (this.#pressed.has('KeyR')) buttons |= InputButton.RecenterCamera;

    if (gamepad !== undefined && gamepad !== null) {
      const gamepadX = Math.abs(gamepad.axes[0] ?? 0) > 0.16 ? (gamepad.axes[0] ?? 0) : 0;
      const gamepadZ = Math.abs(gamepad.axes[1] ?? 0) > 0.16 ? -(gamepad.axes[1] ?? 0) : 0;
      if (Math.hypot(gamepadX, gamepadZ) > Math.hypot(moveX, moveZ)) {
        moveX = gamepadX;
        moveZ = gamepadZ;
      }
      if (gamepad.buttons[0]?.pressed === true) buttons |= InputButton.Jump;
      if (gamepad.buttons[2]?.pressed === true) buttons |= InputButton.Interact;
      if (gamepad.buttons[10]?.pressed === true) buttons |= InputButton.Sprint;

      const cameraX = gamepad.axes[2] ?? 0;
      const cameraY = gamepad.axes[3] ?? 0;
      if (Math.abs(cameraX) > 0.12) this.#yaw = normalizeYaw(this.#yaw - cameraX * 0.045);
      if (Math.abs(cameraY) > 0.12) {
        this.#pitch = clamp(this.#pitch - cameraY * 0.03, -1.15, 0.55);
      }
    }

    const magnitude = Math.hypot(moveX, moveZ);
    if (magnitude > 1) {
      moveX /= magnitude;
      moveZ /= magnitude;
    }

    return {
      sequence,
      intendedTick,
      moveX,
      moveZ,
      lookYaw: this.#yaw,
      lookPitch: this.#pitch,
      buttons,
    };
  }
}
