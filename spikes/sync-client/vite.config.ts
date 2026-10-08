import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The real app, built with one module swapped: src/store/persistence.ts becomes
// this spike's, which syncs a shared room through the relay. Nothing else changes.
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('../..'),
  plugins: [react(), viteSingleFile()],
  base: './',
  resolve: {
    alias: [{ find: /^\.\.\/store\/persistence\.ts$/, replacement: here('./persistence.ts') }],
  },
  build: { outDir: here('./dist'), emptyOutDir: true },
});
