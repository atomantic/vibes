import { expect, test as base, type Page } from '@playwright/test';

interface VibesTestHook {
  readonly ready: boolean;
  readonly tick: number;
}

interface RuntimeErrorCapture {
  readonly pageErrors: string[];
}

const SETTINGS_KEY = 'vibes.player-settings.v1';
const ARRIVAL_SAVE_KEY = 'vibes.arrival-slice.save.v1';

const test = base.extend<RuntimeErrorCapture>({
  pageErrors: [
    async ({ page }, use) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
      });

      await use(pageErrors);

      expect(pageErrors, 'The game emitted an uncaught page error').toEqual([]);
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

  await expect(page.getByRole('status')).toHaveText('World ready');
  await expect(page.locator("[data-testid='game-canvas']")).toBeVisible();
}

async function expectFatalInitialization(page: Page, message: string): Promise<void> {
  await expect(page.getByRole('status')).toHaveText('World unavailable');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Resonance interrupted');
  await expect(alert).toContainText(message);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused();
  await expect(page.locator("[data-testid='game-canvas']")).toHaveCount(0);
}

async function rejectStorageWrites(page: Page, rejectedKey: string): Promise<void> {
  await page.addInitScript((keyToReject) => {
    const nativeSetItem = Storage.prototype.setItem;
    const rejectedWrites: string[] = [];
    Object.defineProperty(globalThis, '__VIBES_REJECTED_STORAGE_WRITES__', {
      configurable: true,
      value: rejectedWrites,
    });
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      value: function setItem(this: Storage, key: string, value: string): void {
        if (key === keyToReject) {
          rejectedWrites.push(key);
          throw new DOMException('Storage write rejected for resilience test', 'SecurityError');
        }
        nativeSetItem.call(this, key, value);
      },
    });
  }, rejectedKey);
}

async function rejectedWriteCount(page: Page, key: string): Promise<number> {
  return page.evaluate((targetKey) => {
    const writes = (
      globalThis as typeof globalThis & {
        __VIBES_REJECTED_STORAGE_WRITES__?: string[];
      }
    ).__VIBES_REJECTED_STORAGE_WRITES__;
    return writes?.filter((candidate) => candidate === targetKey).length ?? 0;
  }, key);
}

async function waitForRejectedWrite(page: Page, key: string, previousCount = 0): Promise<void> {
  await page.waitForFunction(
    ({ targetKey, count }) => {
      const writes = (
        globalThis as typeof globalThis & {
          __VIBES_REJECTED_STORAGE_WRITES__?: string[];
        }
      ).__VIBES_REJECTED_STORAGE_WRITES__;
      return (writes?.filter((candidate) => candidate === targetKey).length ?? 0) > count;
    },
    { targetKey: key, count: previousCount },
  );
}

test('shows the fatal UI and removes the canvas when Worker construction fails', async ({
  page,
}) => {
  const failureMessage = 'Local authority Worker construction failed for resilience test';
  await page.addInitScript((message) => {
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: class FailingWorker {
        constructor() {
          throw new Error(message);
        }
      },
    });
  }, failureMessage);

  await page.goto('/');

  await expectFatalInitialization(page, failureMessage);
});

test('shows the fatal UI and removes a partially initialized renderer canvas', async ({ page }) => {
  const failureMessage = 'ResizeObserver construction failed for resilience test';
  await page.addInitScript((message) => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class FailingResizeObserver {
        constructor() {
          throw new Error(message);
        }
      },
    });
  }, failureMessage);

  await page.goto('/');

  await expectFatalInitialization(page, failureMessage);
});

test('reaches World ready when settings persistence is unavailable', async ({ page }) => {
  await rejectStorageWrites(page, SETTINGS_KEY);

  await openReadyWorld(page);
  await waitForRejectedWrite(page, SETTINGS_KEY);

  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('World ready');
  await expect(page.locator('.save-status')).toHaveText('Settings kept for this session');

  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Restart journey' }).click();
  await page.waitForTimeout(1_800);
  await expect(page.locator('.save-status')).toHaveText('Settings kept for this session');
});

test('keeps the world playable without claiming a rejected journey save succeeded', async ({
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
  await rejectStorageWrites(page, ARRIVAL_SAVE_KEY);
  await openReadyWorld(page);
  await waitForRejectedWrite(page, ARRIVAL_SAVE_KEY);

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    return Boolean(hook && hook.tick >= 3);
  });

  const beforeSyntheticSave = await page.evaluate(() => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    if (hook === undefined) throw new Error('Vibes diagnostics are unavailable');
    return hook.tick;
  });
  const rejectedWritesBefore = await rejectedWriteCount(page, ARRIVAL_SAVE_KEY);

  await page.evaluate((tick) => {
    const worker = (
      globalThis as typeof globalThis & {
        __VIBES_AUTHORITY_WORKER__?: Worker;
      }
    ).__VIBES_AUTHORITY_WORKER__;
    if (worker === undefined) throw new Error('The local authority Worker was not captured');

    worker.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'simulation-snapshot',
          tick,
          acknowledgedInputSequence: 0,
          entities: [],
          objective: {
            arrivalChimeActivated: true,
            crossingRaised: true,
            loomAwakened: false,
            optionalVistaFound: false,
            checkpoint: 'ridge',
          },
        },
      }),
    );
  }, beforeSyntheticSave);

  await waitForRejectedWrite(page, ARRIVAL_SAVE_KEY, rejectedWritesBefore);
  await expect(page.locator('.save-status')).toHaveText('Progress kept for this session');
  await expect(page.locator('.save-status')).not.toHaveText('Journey saved');
  await page.waitForFunction((previousTick) => {
    const hook = (
      globalThis as typeof globalThis & {
        __VIBES_TEST__?: VibesTestHook;
      }
    ).__VIBES_TEST__;
    return Boolean(hook && hook.tick > previousTick);
  }, beforeSyntheticSave);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
