import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Tests run against the built single file opened from disk, exactly as the
// PM and testers use it. Run `npm run build` first.
const localChromium = '/opt/pw-browsers/chromium';
const chromium = !process.env.CI && existsSync(localChromium) ? { launchOptions: { executablePath: localChromium } } : {};

// Sharing tests (e2e/relay/) run against a real relay serving dist/, started here. CI must run them; locally
// they're skipped on a computer without Go.
function hasGo(): boolean {
  try {
    execSync('go version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
export const RELAY_PORT = 18787;
const withRelay = !!process.env.CI || hasGo();
// Set once, in the main process, and inherited by the workers, so tests can look at what the relay stored.
process.env.RELAY_E2E_DATA ??= join(mkdtempSync(join(tmpdir(), 'relay-e2e-')), 'data');

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // In CI, also a JSON report for the run's summary (scripts/ci-summary.ts).
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'reports/e2e.json' }]]
    : 'list',
  use: {
    // Pivots animate (ADR 0015); tests measure cards where they settle. motion.spec.ts turns it back on.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: 'relay/**',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, ...chromium },
    },
    ...(withRelay
      ? [
          {
            name: 'relay',
            testDir: 'e2e/relay',
            use: {
              ...devices['Desktop Chrome'],
              viewport: { width: 1440, height: 900 },
              baseURL: `http://127.0.0.1:${RELAY_PORT}`,
              ...chromium,
            },
          },
        ]
      : []),
  ],
  ...(withRelay
    ? {
        webServer: {
          // A fresh, empty relay for every run, serving the app just built.
          command: `go run . -addr 127.0.0.1:${RELAY_PORT} -public-url http://127.0.0.1:${RELAY_PORT} -static ../dist -data ${process.env.RELAY_E2E_DATA} -announce=false`,
          cwd: 'relay',
          url: `http://127.0.0.1:${RELAY_PORT}/config`,
          timeout: 180_000,
          reuseExistingServer: false,
        },
      }
    : {}),
});
