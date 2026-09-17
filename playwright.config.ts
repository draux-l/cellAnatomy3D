import { defineConfig } from '@playwright/test';

/**
 * The verification harness configuration.
 *
 * The browser build is pinned by the installed `@playwright/test` version, the viewport and
 * pixel ratio are pinned here so a screenshot is the same size everywhere, and the suite runs
 * against `vite preview` of a *built* bundle — never the dev server, which would not exercise
 * the artifact that ships.
 *
 * `channel: 'chromium'` selects Playwright's full Chromium build rather than the headless shell.
 * Measured on the reference machine: the shell falls back to SwiftShader and needs ~5 s per
 * capture plus ~30 s for the first one, while the full build picks up the available GPU and
 * captures in under a second. Where no GPU exists both are software, and the assertions are
 * metric-based precisely so the rasteriser does not matter.
 */
export default defineConfig({
  testDir: './verify/specs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', channel: 'chromium' },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
  },
});
