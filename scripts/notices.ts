import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { NOTICES_ID } from '../src/notices.ts';

// Third-party notices (ADR 0001, amended). The licenses of what's bundled ask
// for their copyright and permission notices to travel with every copy, and
// the minified build drops the comments that carried them. So the build lists
// every package that ends up in it, with its license text, inside the page:
// the cheat sheet shows it, and the relay prints it with -licenses.

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;

/** The package directory a bundled module came from, or null for our own code. */
export function packageDirOf(moduleId: string): string | null {
  // A virtual module ("\0…?commonjs-exports") stands for a real one in the same package.
  const path = moduleId.replace(/^\0/, '').replace(/\\/g, '/').replace(/[?#].*$/, '');
  const at = path.lastIndexOf('/node_modules/');
  if (at < 0) return null;
  const parts = path.slice(at + '/node_modules/'.length).split('/');
  const name = parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  return name ? path.slice(0, at + '/node_modules/'.length) + name : null;
}

/** The notices for these package directories: each one's name, version, license, and license text. */
export function noticesFor(packageDirs: Iterable<string>): string {
  const entries = new Map<string, string>();
  for (const dir of packageDirs) {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string; version: string; license?: string };
    const file = existsSync(dir) ? readdirSync(dir).find((f) => LICENSE_FILE.test(f)) : undefined;
    if (!file) throw new Error(`${pkg.name} ${pkg.version} is bundled but has no license file to include (${dir})`);
    const text = readFileSync(join(dir, file), 'utf8').trim();
    entries.set(`${pkg.name}@${pkg.version}`, `== ${pkg.name} ${pkg.version} (${pkg.license ?? 'see below'}) ==\n\n${text}\n`);
  }
  const body = [...entries.keys()].sort().map((key) => entries.get(key));
  return [
    'Planning Board is licensed under the Apache License 2.0. It includes the following open-source software, under the licenses below.',
    '',
    ...body,
  ].join('\n');
}

/** A Vite plugin that puts the notices for every bundled package into the built page. */
export function thirdPartyNotices(): Plugin {
  return {
    name: 'third-party-notices',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const dirs = new Set<string>();
        for (const output of Object.values(ctx.bundle ?? {})) {
          if (output.type !== 'chunk') continue;
          for (const id of output.moduleIds) {
            const dir = packageDirOf(id);
            if (dir) dirs.add(dir);
          }
        }
        if (dirs.size === 0) throw new Error('No bundled packages found for the third-party notices');
        const text = noticesFor(dirs);
        // The notices sit in a script element as plain text, which ends only at "</script".
        if (/<\/script/i.test(text)) throw new Error('A license text contains "</script"');
        return html.replace('</body>', `<script type="text/plain" id="${NOTICES_ID}">\n${text}</script>\n</body>`);
      },
    },
  };
}
