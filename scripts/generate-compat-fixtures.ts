// Generates the compatibility fixtures in src/domain/__fixtures__/compat/: what
// each earlier version of the app saved, written by that version's own code
// (ADR 0005, "Compatibility"). The tests in src/domain/compat.test.ts and
// src/commands/compat.test.ts check that this build still opens all of them.
//
// Each version is checked out into a temporary git worktree, which reuses this
// checkout's node_modules, and a small exporter runs against that version's
// source. Existing fixtures are never overwritten: a version's files are
// written once, when the version is added to VERSIONS.
//
// Run: npm run compat:fixtures

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The last commit of each released sprint, oldest first. Add each new release here. */
const VERSIONS: { name: string; commit: string }[] = [
  { name: 'sprint-0', commit: 'dc51147' },
  { name: 'sprint-1', commit: 'cd14611' },
  { name: 'sprint-2', commit: '8508a4a' },
  { name: 'sprint-3', commit: '64b422d' },
  { name: 'sprint-4', commit: '5827e07' },
  { name: 'sprint-5', commit: 'f330dfe' },
  { name: 'sprint-6', commit: '2895eb5' },
  // The last build before items gained a rank (sprint 7, slice 5; ADR 0005's amendment).
  { name: 'sprint-7-before-rank', commit: 'ccf5325' },
  { name: 'sprint-7', commit: '3d11656' },
  // The last build before related links (sprint 8, slice 2; ADR 0005's amendment).
  { name: 'sprint-8-before-related', commit: '641dadc' },
  { name: 'sprint-8', commit: '6b97747' },
  // Sprint 9 changed no app code. This is also the last build before schema 2 (sprint 10, slice 1; ADR 0016).
  { name: 'sprint-9', commit: 'a5bc057' },
  // The first schema 2 build, with several plans per browser (ADR 0016, ADR 0021).
  { name: 'sprint-10', commit: '1296bfe' },
  // The last build before cards record their moves, for loop repair (sprint 11, slice 2; ADR 0004).
  { name: 'sprint-11-before-loop-repair', commit: '6f0142d' },
  // The first build that can share: moves carry stamps (ADR 0004), and plans record their writer (meta.writer).
  { name: 'sprint-11', commit: 'd50c040' },
  // Presence, new links, and the first changes file (ADR 0022).
  { name: 'sprint-12', commit: '3043bc8' },
];

const repo = new URL('..', import.meta.url).pathname;
const out = join(repo, 'src/domain/__fixtures__/compat');
mkdirSync(out, { recursive: true });

// Runs inside the old worktree: its own parser, writer, store and importer.
const EXPORTER = `
import { readFileSync, writeFileSync } from 'node:fs';
import * as Y from 'yjs';
import * as planJson from './src/domain/planJson.ts';
import * as store from './src/commands/store.ts';

const [, , outDir, name] = process.argv;
const parsed = planJson.parsePlanJson(JSON.parse(readFileSync('src/seed/sample-plan.json', 'utf8')));
if (!parsed.ok) throw new Error(parsed.errors.join('\\n'));
const plan = parsed.plan;

// The plan file this version saves, or, before it could save one, the file it shipped as its sample.
const fileText = planJson.planFileText ? planJson.planFileText(plan) : readFileSync('src/seed/sample-plan.json', 'utf8');
writeFileSync(outDir + '/' + name + '.plan.json', fileText);

// The board as this version keeps it in the browser: the Yjs document, encoded.
const s = store.createPlanStore();
store.loadPlan(s, plan);
writeFileSync(outDir + '/' + name + '.board.yjs', Y.encodeStateAsUpdate(s.doc));

// From the versions with CSV import: an imported plan, with Jira keys, custom properties and descriptions.
try {
  const csvImport = await import('./src/domain/csvImport.ts');
  const { parseCsv } = await import('./src/domain/csv.ts');
  const { JIRA_EXPORT } = await import('./src/domain/__fixtures__/jira-export.ts');
  const table = parseCsv(JIRA_EXPORT);
  const draft = csvImport.draftFromCsv(table, csvImport.detectMapping(csvImport.columnGroups(table.header)));
  let n = 0;
  const imported = csvImport.planFromDraft(draft, csvImport.defaultChoices(draft), (prefix) => prefix + ++n).plan;
  writeFileSync(outDir + '/' + name + '.import.plan.json', planJson.planFileText(imported));
} catch (e) {
  if (!String(e).includes('Cannot find module') && !String(e).includes('ERR_MODULE_NOT_FOUND')) throw e;
}

// From the versions that share by file (ADR 0022): the board as a changes file, sealed with a fixed key the
// compatibility test knows (src/commands/compat.test.ts).
try {
  const changes = await import('./src/store/changesFile.ts');
  const keys = await import('./src/store/keys.ts');
  const secret = keys.toBase64Url(new Uint8Array(32).fill(7));
  writeFileSync(outDir + '/' + name + '.changes.pbchanges', changes.writeChangesFile(s.doc, 'compat_changes_room_0001', keys.viewKeyOf(secret)));
} catch (e) {
  if (!String(e).includes('Cannot find module') && !String(e).includes('ERR_MODULE_NOT_FOUND')) throw e;
}
`;

const work = mkdtempSync(join(tmpdir(), 'compat-'));
try {
  for (const { name, commit } of VERSIONS) {
    if (existsSync(join(out, `${name}.plan.json`))) {
      console.log(`${name}: already generated, kept as is`);
      continue;
    }
    const dir = join(work, name);
    execFileSync('git', ['worktree', 'add', '--detach', dir, commit], { cwd: repo, stdio: 'ignore' });
    try {
      symlinkSync(join(repo, 'node_modules'), join(dir, 'node_modules'));
      writeFileSync(join(dir, 'export-compat.ts'), EXPORTER);
      // Transform, not just strip, types: sprint 11's relay.ts used a parameter property, which stripping rejects.
      execFileSync('node', ['--experimental-transform-types', '--no-warnings', 'export-compat.ts', out, name], { cwd: dir, stdio: 'inherit' });
      console.log(`${name}: generated from ${commit}`);
    } finally {
      execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: repo, stdio: 'ignore' });
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
