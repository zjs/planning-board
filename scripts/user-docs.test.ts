import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The docs people outside the project read: someone trying the app, someone
// running a relay, someone reporting a problem (docs/housekeeping.md). Their
// readers don't know our sprints, questions or requirement numbers, and the
// relay's README also ships alone in its download.
const root = resolve(import.meta.dirname, '..');
const USER_DOCS = ['README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'relay/README.md', 'docs/hosting.md'];
const TEMPLATES = ['bug.yml', 'feedback.yml', 'import.yml', 'config.yml'].map((f) => `.github/ISSUE_TEMPLATE/${f}`);
/** Shipped beside the relay program, with none of the repo around it. */
const SHIPPED_ALONE = ['relay/README.md'];

const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** Markdown links outside code, as written: `[text](target)`. */
function links(markdown: string): string[] {
  const prose = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '``');
  return [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!);
}

/** GitHub's anchor for a heading. */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

function anchors(markdown: string): Set<string> {
  const prose = markdown.replace(/```[\s\S]*?```/g, '');
  return new Set([...prose.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1]!.replace(/`/g, ''))));
}

describe('user-facing docs', () => {
  for (const doc of USER_DOCS) {
    it(`${doc}: every link inside the repo resolves`, () => {
      const broken = links(read(doc))
        .filter((target) => !/^[a-z]+:/i.test(target))
        .filter((target) => {
          const [path, anchor] = target.split('#');
          const file = path ? join(dirname(doc), path) : doc;
          if (!existsSync(join(root, file))) return true;
          return anchor !== undefined && file.endsWith('.md') && !anchors(read(file)).has(anchor);
        });
      expect(broken).toEqual([]);
    });
  }

  for (const doc of SHIPPED_ALONE) {
    it(`${doc}: links are absolute, since it ships alone`, () => {
      expect(links(read(doc)).filter((target) => !/^(https?:|mailto:)/.test(target))).toEqual([]);
    });
  }

  for (const doc of [...USER_DOCS, ...TEMPLATES]) {
    it(`${doc}: no internal numbering a reader can't look up`, () => {
      // An ADR is fine as a link: it's a public page that explains itself.
      const jargon = read(doc).match(/\bsprint \d+|\bQ\d{1,3}\b|\brequirements? \d+/gi) ?? [];
      expect(jargon).toEqual([]);
    });
  }
});
