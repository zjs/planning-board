import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { defineConfig } from 'vitest/config';

// The build is one self-contained index.html that works opened from disk
// (docs/decisions/0001-frontend-and-build.md).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
