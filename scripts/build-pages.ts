// The two small pages for the public build's old address (Q80 d, ADR 0025),
// each one self-contained HTML file like the app: move.html, which hands this
// address's plans to the new one, and stub.html, served in the app's place
// once it has moved. Built after the app, into dist/ beside it.

import { build } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

for (const page of ['move', 'stub']) {
  await build({
    configFile: false,
    base: './',
    logLevel: 'warn',
    plugins: [viteSingleFile()],
    build: { outDir: 'dist', emptyOutDir: false, rollupOptions: { input: `${page}.html` } },
  });
}
