import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { noticesFor, packageDirOf } from './notices.ts';

const modules = resolve(import.meta.dirname, '..', 'node_modules');

describe('third-party notices', () => {
  it('finds the package a bundled module came from', () => {
    expect(packageDirOf('/repo/node_modules/yjs/dist/yjs.mjs')).toBe('/repo/node_modules/yjs');
    expect(packageDirOf('/repo/node_modules/@noble/hashes/esm/sha2.js')).toBe('/repo/node_modules/@noble/hashes');
    expect(packageDirOf('/repo/node_modules/a/node_modules/b/index.js')).toBe('/repo/node_modules/a/node_modules/b');
    expect(packageDirOf('\0/repo/node_modules/react/index.js?commonjs-module')).toBe('/repo/node_modules/react');
    expect(packageDirOf('C:\\repo\\node_modules\\react\\index.js')).toBe('C:/repo/node_modules/react');
    expect(packageDirOf('/repo/src/main.tsx')).toBeNull();
    expect(packageDirOf('\0commonjsHelpers.js')).toBeNull();
  });

  it("lists each package once, with its version, license and the license's own text", () => {
    const text = noticesFor([join(modules, 'yjs'), join(modules, 'react'), join(modules, 'yjs')]);
    expect(text.match(/^== yjs /gm)).toHaveLength(1);
    expect(text).toMatch(/^== react \d+\.\d+\.\d+ \(MIT\) ==$/m);
    expect(text).toContain('Permission is hereby granted, free of charge');
    expect(text.indexOf('== react ')).toBeLessThan(text.indexOf('== yjs '));
  });

  it('refuses a bundled package with no license text to include', () => {
    const dir = mkdtempSync(join(tmpdir(), 'notices-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'unlicensed', version: '1.0.0' }));
    expect(() => noticesFor([dir])).toThrow(/unlicensed 1.0.0 is bundled but has no license file/);
  });
});
