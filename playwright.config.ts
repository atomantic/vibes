import { defineConfig, devices } from '@playwright/test';

const previewUrl = 'http://127.0.0.1:4173';
const useFirefoxXvfb = process.env.VIBES_FIREFOX_XVFB === '1';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  // WebGL browser processes contend for the same GPU when projects run in parallel.
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: previewUrl,
    locale: 'en-US',
    timezoneId: 'UTC',
    actionTimeout: 10_000,
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
    command: 'pnpm build && pnpm preview',
    url: previewUrl,
    // Never validate a stale Vibes bundle (or an unrelated process) that was
    // already listening on the preview port.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
