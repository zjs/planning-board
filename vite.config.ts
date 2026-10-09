import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { defineConfig } from 'vitest/config';
import { thirdPartyNotices } from './scripts/notices.ts';

// The build is one self-contained index.html that works opened from disk,
// carrying the notices of the packages inside it
// (docs/decisions/0001-frontend-and-build.md).
export default defineConfig({
  plugins: [react(), thirdPartyNotices(), viteSingleFile()],
  base: './',
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
