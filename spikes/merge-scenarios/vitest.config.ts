import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Kept apart from the app's tests (vite.config.ts), so `npm test` never runs a spike.
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['spikes/merge-scenarios/**/*.test.ts'],
  },
});
