import { expect, test as base, type Page, type TestInfo } from '@playwright/test';

interface VibesTestHook {
  readonly ready: boolean;
  readonly tick: number;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly frames: number;
  readonly contextLost: boolean;
  readonly paused: boolean;
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
      frames: hook.frames,
      contextLost: hook.contextLost,
      paused: hook.paused,
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

  const initial = await readTestHook(page);
  expect(initial.contextLost).toBe(false);
  expect(initial.frames).toBeGreaterThan(0);

  await page.keyboard.press('Enter');
  await page.locator("[data-testid='game-canvas']").click();
  await page.waitForFunction(() => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    return Boolean(hook && hook.tick >= 12);
  });
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

  await page.keyboard.up('w');

  const moved = await readTestHook(page);
  expect(moved.tick).toBeGreaterThan(settled.tick);
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
