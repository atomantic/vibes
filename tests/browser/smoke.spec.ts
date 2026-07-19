import { expect, test as base, type Page, type TestInfo } from '@playwright/test';

interface VibesTestHook {
  readonly ready: boolean;
  readonly tick: number;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly yaw: number;
  readonly camera: {
    readonly yaw: number;
    readonly pitch: number;
  };
  readonly setCamera?: (yaw: number, pitch: number) => void;
  readonly frames: number;
  readonly contextLost: boolean;
  readonly paused: boolean;
  readonly avatar: {
    readonly status: 'loading' | 'ready' | 'fallback';
    readonly kind: 'robot-expressive' | 'procedural';
    readonly animation: 'idle' | 'walk' | 'run' | 'jump';
    readonly activeClip: string | null;
    readonly clips: readonly string[];
  };
}

interface RuntimeFailureCapture {
  readonly failures: string[];
}

function isBrowserDriverDiagnostic(message: string): boolean {
  return (
    /GL Driver Message .*GPU stall due to ReadPixels/.test(message) ||
    /WebGL warning: .*Depth texture comparison requests/.test(message)
  );
}

const test = base.extend<RuntimeFailureCapture>({
  failures: [
    async ({ page }, use) => {
      const failures: string[] = [];

      page.on('console', (message) => {
        if (
          (message.type() === 'error' || message.type() === 'warning') &&
          !isBrowserDriverDiagnostic(message.text())
        ) {
          failures.push(`console.${message.type()}: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => {
        failures.push(`pageerror: ${error.message}`);
      });
      page.on('requestfailed', (request) => {
        const reason = request.failure()?.errorText ?? 'unknown failure';
        failures.push(`requestfailed: ${request.method()} ${request.url()} (${reason})`);
      });
      page.on('response', (response) => {
        if (response.status() >= 400) {
          failures.push(`response: ${response.status()} ${response.url()}`);
        }
      });

      await use(failures);

      expect(failures, 'The game emitted browser runtime failures').toEqual([]);
    },
    { auto: true },
  ],
});

async function openReadyWorld(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveTitle('Vibes — First Light at the Loom');
  await page.waitForFunction(() => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;

    return hook?.ready === true;
  });

  await expect(page.getByRole('main', { name: 'Vibes game' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('World ready');
  await expect(page.locator("[data-testid='game-canvas']")).toBeVisible();
}

async function readTestHook(page: Page): Promise<VibesTestHook> {
  return page.evaluate(() => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;

    if (!hook) {
      throw new Error('window.__VIBES_TEST__ is unavailable');
    }

    return {
      ready: hook.ready,
      tick: hook.tick,
      position: { ...hook.position },
      yaw: hook.yaw,
      camera: { ...hook.camera },
      frames: hook.frames,
      contextLost: hook.contextLost,
      paused: hook.paused,
      avatar: { ...hook.avatar, clips: [...hook.avatar.clips] },
    };
  });
}

async function attachHookOnFailure(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) {
    return;
  }

  const hook = await readTestHook(page).catch(() => undefined);
  if (hook) {
    await testInfo.attach('vibes-test-hook.json', {
      body: JSON.stringify(hook, null, 2),
      contentType: 'application/json',
    });
  }
}

test.afterEach(async ({ page }, testInfo) => {
  await attachHookOnFailure(page, testInfo);
});

test('loads the production world and advances the simulation', async ({ page }) => {
  await openReadyWorld(page);

  const canvas = page.locator("[data-testid='game-canvas']");
  await expect(canvas).toHaveAttribute('aria-describedby', 'game-control-instructions');
  await expect(page.locator('#game-control-instructions')).toContainText('W A S D to move');
  await page.waitForFunction(() => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    return Boolean(hook && hook.position.z > 100);
  });
  await page.waitForFunction(() => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    return hook?.avatar.status === 'ready';
  });
  await expect(page.locator('.save-status')).toBeEmpty();

  const initial = await readTestHook(page);
  expect(initial.contextLost).toBe(false);
  expect(initial.frames).toBeGreaterThan(0);
  expect(initial.avatar).toMatchObject({
    status: 'ready',
    kind: 'robot-expressive',
    animation: 'idle',
    activeClip: 'Idle',
  });
  expect(initial.avatar.clips).toEqual(
    expect.arrayContaining(['Idle', 'Walking', 'Running', 'Jump']),
  );

  await page.keyboard.press('Enter');
  await canvas.click();
  await page.waitForFunction(() => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    return Boolean(hook && hook.tick >= 12);
  });
  const beforeTurn = await readTestHook(page);
  await page.evaluate((yaw) => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    if (hook?.setCamera === undefined) throw new Error('Camera diagnostics are unavailable');
    hook.setCamera(yaw, hook.camera.pitch);
  }, -Math.PI / 2);
  await page.waitForFunction((beforeYaw) => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    return Boolean(hook && Math.abs(hook.camera.yaw - beforeYaw) > 0.35);
  }, beforeTurn.camera.yaw);

  const settled = await readTestHook(page);
  await page.keyboard.down('w');

  await page.waitForFunction((before) => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    if (!hook || hook.tick <= before.tick) {
      return false;
    }

    const horizontalMovement =
      Math.abs(hook.position.x - before.position.x) + Math.abs(hook.position.z - before.position.z);
    return horizontalMovement > 0.5;
  }, settled);

  await page.waitForFunction(() => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    return hook?.avatar.animation === 'run' && hook.avatar.activeClip === 'Running';
  });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    return hook?.avatar.animation === 'jump' && hook.avatar.activeClip === 'Jump';
  });

  await page.keyboard.up('w');

  const moved = await readTestHook(page);
  const displacementX = moved.position.x - settled.position.x;
  const displacementZ = moved.position.z - settled.position.z;
  const displacement = Math.hypot(displacementX, displacementZ);
  const cameraForwardX = -Math.sin(settled.camera.yaw);
  const cameraForwardZ = -Math.cos(settled.camera.yaw);
  const facingX = -Math.sin(moved.yaw);
  const facingZ = -Math.cos(moved.yaw);

  expect(moved.tick).toBeGreaterThan(settled.tick);
  expect(
    (displacementX * cameraForwardX + displacementZ * cameraForwardZ) / displacement,
  ).toBeGreaterThan(0.85);
  expect((displacementX * facingX + displacementZ * facingZ) / displacement).toBeGreaterThan(0.85);
  expect(moved.contextLost).toBe(false);
});

test('pauses simulation ticks while rendering remains responsive', async ({ page }) => {
  await openReadyWorld(page);
  await page.keyboard.press('Enter');
  await page.locator("[data-testid='game-canvas']").click();
  await page.keyboard.press('Escape');

  await page.waitForFunction(() => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    return hook?.paused === true;
  });

  const paused = await readTestHook(page);
  await page.waitForTimeout(350);

  const afterPauseWindow = await readTestHook(page);
  expect(afterPauseWindow.tick).toBe(paused.tick);

  await page.waitForFunction((before) => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    return Boolean(hook && hook.frames > before.frames);
  }, paused);

  const afterFrames = await readTestHook(page);
  expect(afterFrames.frames).toBeGreaterThan(paused.frames);
  expect(afterFrames.tick).toBe(paused.tick);
  expect(afterFrames.contextLost).toBe(false);

  const resumeButton = page.getByRole('button', { name: /Resume journey/ });
  const restartButton = page.getByRole('button', { name: 'Restart journey' });
  await expect(resumeButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(restartButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(resumeButton).toBeFocused();

  await page.getByRole('checkbox', { name: /Reduced motion/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  const pauseAnimationDurationMs = await page.locator('.pause-panel').evaluate((panel) => {
    const duration = globalThis.getComputedStyle(panel).animationDuration;
    return Number.parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1_000);
  });
  expect(pauseAnimationDurationMs).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 700, height: 320 });
  const pausePanelScroll = await page.locator('.pause-panel').evaluate((panel) => ({
    clientHeight: panel.clientHeight,
    overflowY: globalThis.getComputedStyle(panel).overflowY,
    scrollHeight: panel.scrollHeight,
  }));
  expect(pausePanelScroll.overflowY).toBe('auto');
  expect(pausePanelScroll.scrollHeight).toBeGreaterThan(pausePanelScroll.clientHeight);

  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-panel')).toBeHidden();
  await expect(page.locator("[data-testid='game-canvas']")).toBeFocused();
});

test('pauses and releases held movement when the browser loses focus', async ({ page }) => {
  await openReadyWorld(page);
  await page.keyboard.press('Enter');

  const beforeMovement = await readTestHook(page);
  await page.keyboard.down('w');
  await page.waitForFunction((before) => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    if (hook === undefined) return false;
    return (
      Math.hypot(hook.position.x - before.position.x, hook.position.z - before.position.z) > 0.5
    );
  }, beforeMovement);

  await page.evaluate(() => {
    globalThis.dispatchEvent(new Event('blur'));
  });
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  const paused = await readTestHook(page);
  await page.waitForTimeout(350);
  const frozen = await readTestHook(page);
  expect(frozen.tick).toBe(paused.tick);

  await page.getByRole('button', { name: /Resume journey/ }).click();
  await page.waitForFunction(() => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    return hook?.paused === false;
  });
  const resumed = await readTestHook(page);
  await page.waitForTimeout(250);
  const settled = await readTestHook(page);
  await page.keyboard.up('w');

  expect(
    Math.hypot(settled.position.x - resumed.position.x, settled.position.z - resumed.position.z),
  ).toBeLessThan(0.05);
});

test('keeps the Loom announcement when its checkpoint is recorded in the same tick', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = globalThis.Worker;
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: new Proxy(NativeWorker, {
        construct(target, argumentsList) {
          const worker = Reflect.construct(target, argumentsList) as Worker;
          Object.defineProperty(globalThis, '__VIBES_AUTHORITY_WORKER__', {
            configurable: true,
            value: worker,
          });
          return worker;
        },
      }),
    });
  });
  await openReadyWorld(page);

  await page.evaluate(() => {
    const worker = (
      globalThis as typeof globalThis & {
        __VIBES_AUTHORITY_WORKER__?: Worker;
      }
    ).__VIBES_AUTHORITY_WORKER__;
    if (worker === undefined) throw new Error('The local authority worker was not captured');

    worker.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'durable-event',
          tick: 42,
          eventId: 'test:loom-awakened',
          eventType: 'loom-awakened',
          entityId: 'landmark.loom',
          payload: { loomAwakened: true },
        },
      }),
    );
    worker.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'durable-event',
          tick: 42,
          eventId: 'test:checkpoint-reached',
          eventType: 'checkpoint-reached',
          entityId: 'landmark.loom',
          payload: { checkpoint: 'loom' },
        },
      }),
    );
  });

  await expect(page.locator('.announcement')).toHaveText(
    'The Loom wakes. Three empty Shard sockets call across the Reach.',
  );
});

test('honors reduced motion without losing the accessible shell', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openReadyWorld(page);

  await expect(page.getByRole('main', { name: 'Vibes game' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('World ready');
  expect(
    await page.evaluate(() => globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches),
  ).toBe(true);
});
