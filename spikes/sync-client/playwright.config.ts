import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// Two browsers on one encrypted link, through the Go relay, on the real
// board. Build the spike app first:
//   npx vite build --config spikes/sync-client/vite.config.ts
//   npx playwright test --config spikes/sync-client/playwright.config.ts
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const localChromium = '/opt/pw-browsers/chromium';
export const PORT = 8789;
export const DATA = join(tmpdir(), 'spike-relay-e2e');
rmSync(DATA, { recursive: true, force: true });

export default defineConfig({
  testDir: here('.'),
  testMatch: '*.spec.ts',
  retries: 0,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, reducedMotion: 'reduce', trace: 'retain-on-failure' },
  webServer: {
    command: `go run . -addr localhost:${PORT} -data ${DATA} -static ${here('./dist')}`,
    cwd: here('../relay'),
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        ...(existsSync(localChromium) ? { launchOptions: { executablePath: localChromium } } : {}),
      },
    },
  ],
});
