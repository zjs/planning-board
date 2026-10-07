import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Tests run against the built single file opened from disk, exactly as the
// PM and testers use it. Run `npm run build` first.
const localChromium = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    // Pivots animate (ADR 0015); tests measure cards where they settle. motion.spec.ts turns it back on.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        ...(!process.env.CI && existsSync(localChromium) ? { launchOptions: { executablePath: localChromium } } : {}),
      },
    },
  ],
});
