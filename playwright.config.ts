import { defineConfig, devices } from '@playwright/test';

const previewUrl = 'http://127.0.0.1:4173';
const useFirefoxXvfb = process.env.VIBES_FIREFOX_XVFB === '1';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // Strict in CI; one local retry absorbs software-GL timing variance.
  retries: process.env.CI ? 0 : 1,
  // WebGL browser processes contend for the same GPU when projects run in parallel.
  workers: 1,
  // Software-GL machines spend tens of seconds compiling shaders on first
  // boot and render single-digit FPS afterwards, so the infrastructure
  // budgets below tolerate slow hardware even though warm CI runs finish fast.
  timeout: 180_000,
  expect: {
    timeout: 20_000,
  },
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: previewUrl,
    locale: 'en-US',
    timezoneId: 'UTC',
    actionTimeout: 20_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // GitHub's GPU-less Linux runners block WebGL2 unless Firefox is
        // allowed to use its software renderer.
        launchOptions: {
          headless: !useFirefoxXvfb,
          firefoxUserPrefs: {
            'webgl.force-enabled': true,
          },
        },
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'pnpm --filter @vibes/web run build --mode e2e && pnpm preview',
    url: previewUrl,
    // Never validate a stale Vibes bundle (or an unrelated process) that was
    // already listening on the preview port.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
