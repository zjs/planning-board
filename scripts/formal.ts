// Run the formal models (ADR 0024, docs/security/threat-model.md): `npm run formal`.
//
// Each model's results must match the ones recorded beside it, true and false
// alike. Each broken variant, a small edit to the model that removes the thing
// a result depends on, must change that result: a model too weak to notice its
// own broken variant proves nothing. ProVerif is pinned by URL and SHA-256,
// installed into formal/.tools on first use, and built from source, which
// needs OCaml (`ocaml-nox` on Ubuntu). TLC runs from the jar in formal/tools, on Java.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tools = join(root, 'formal', '.tools');

// TLA+ publishes its tools only as builds that are replaced in place, so one is kept in the repository (ADR 0024):
// the nightly 2026.10.15.145915, from https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar.
const TLC = {
  jar: join(root, 'formal', 'tools', 'tla2tools.jar'),
  sha256: '15d103b7e5617780bcc904c0af12f1ad242e2b345c0301136c5be4588f17edac',
};

const PROVERIF = {
  version: '2.05',
  url: 'https://bblanche.gitlabpages.inria.fr/proverif/proverif2.05.tar.gz',
  sha256: '4871f53c32ab4a04669a060c4886ba5d9080496963fb980a9a62d2c429ceabc4',
};

/** A file, downloaded once and checked against its pinned hash. */
function fetchPinned(url: string, sha256: string, to: string): void {
  if (!existsSync(to)) {
    mkdirSync(dirname(to), { recursive: true });
    // curl rather than fetch: it honours the proxy settings of CI and of development containers.
    execFileSync('curl', ['-sSfL', '--retry', '3', '-o', to, url], { stdio: 'inherit' });
  }
  const actual = createHash('sha256').update(readFileSync(to)).digest('hex');
  if (actual !== sha256) {
    throw new Error(
      `${url} has SHA-256 ${actual}, not the pinned ${sha256}. If upstream rebuilt it, check the new build gives the same results, then update the pin in scripts/formal.ts and ADR 0024.`,
    );
  }
}

function proverif(): string {
  const dir = join(tools, `proverif${PROVERIF.version}`);
  const binary = join(dir, 'proverif');
  if (existsSync(binary)) return binary;
  const tarball = join(tools, `proverif${PROVERIF.version}.tar.gz`);
  fetchPinned(PROVERIF.url, PROVERIF.sha256, tarball);
  execFileSync('tar', ['xzf', tarball, '-C', tools]);
  execFileSync('./build', ['-nointeract'], { cwd: dir, stdio: 'ignore' });
  return binary;
}

function tlc(): string {
  const actual = createHash('sha256').update(readFileSync(TLC.jar)).digest('hex');
  if (actual !== TLC.sha256) throw new Error(`${TLC.jar} has SHA-256 ${actual}, not ${TLC.sha256}. A new TLA+ build is a change of its own: update both, and ADR 0024.`);
  return TLC.jar;
}

/** A ProVerif model's results, one line per query, in the tool's own words. */
function runProverif(file: string): string[] {
  const run = spawnSync(proverif(), [file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`proverif ${file} failed:\n${run.stdout}\n${run.stderr}`);
  return run.stdout.split('\n').filter((line) => line.startsWith('RESULT '));
}

/** Check a TLA+ spec with TLC, in a folder of its own so its trace files stay out of the repository. */
function runTlc(spec: string, config: string): { ok: boolean; violated: string | null; states: string; output: string } {
  const dir = mkdtempSync(join(scratch, 'tlc-'));
  const name = spec.replace(/^.*\//, '').replace(/\.tla$/, '');
  writeFileSync(join(dir, `${name}.tla`), readFileSync(spec, 'utf8'));
  writeFileSync(join(dir, `${name}.cfg`), config);
  const run = spawnSync('java', ['-XX:+UseParallelGC', '-cp', tlc(), 'tlc2.TLC', '-workers', 'auto', '-metadir', join(dir, 'states'), `${name}.tla`], {
    cwd: dir,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const output = `${run.stdout}${run.stderr}`;
  const violated = /Error: (Invariant \w+ is violated|Temporal properties were violated)/.exec(output)?.[1] ?? null;
  const states = /([\d,]+) distinct states found, 0 states left on queue/.exec(output)?.[1] ?? '?';
  return { ok: output.includes('Model checking completed. No error has been found.'), violated, states, output };
}

/**
 * A broken variant: textual edits to the model or its config, and what must
 * then fail. For ProVerif, the start of a result line that must no longer
 * hold; for TLC, any invariant or property.
 */
interface Broken {
  name: string;
  edits: [string, string][];
  config?: [string, string][];
  breaks?: string;
}

interface Model {
  tool: 'proverif' | 'tlc';
  file: string;
  /** ProVerif: the results recorded beside the model. TLC: the config to check with. */
  expected: string;
  broken: Broken[];
}

const scratch = mkdtempSync(join(tmpdir(), 'formal-'));

const MODELS: Model[] = [
  {
    tool: 'proverif',
    file: 'formal/proverif/relay.pv',
    expected: 'formal/proverif/relay.expected',
    broken: [
      {
        // Without the room in the additional data, the board and its history room, which share a key, can't be told apart.
        name: 'the room left out of the additional data',
        edits: [
          ['aead(kdfEnc(s), n, ad(room, kind, upto), m)', 'aead(kdfEnc(s), n, ad(noUpto, kind, upto), m)'],
          ['aeadOpen(k, n, ad(room, kind, upto), x)', 'aeadOpen(k, n, ad(noUpto, kind, upto), x)'],
        ],
        breaks: 'RESULT event(Accepted(roomA[]',
      },
      {
        // Without the kind, presence could be passed off as a change.
        name: 'the kind left out of the additional data',
        edits: [
          ['aead(kdfEnc(s), n, ad(room, kind, upto), m)', 'aead(kdfEnc(s), n, ad(room, noUpto, upto), m)'],
          ['aeadOpen(k, n, ad(room, kind, upto), x)', 'aeadOpen(k, n, ad(room, noUpto, upto), x)'],
        ],
        breaks: 'RESULT event(Accepted(roomA[]',
      },
    ],
  },
  {
    tool: 'tlc',
    file: 'formal/tla/Sync.tla',
    expected: 'formal/tla/Sync.cfg',
    broken: [
      {
        // As built before the fix for F10: a cursor with no epoch was trusted after a restore.
        name: 'a cursor with no epoch trusted (F10)',
        edits: [['\\/ (seen[c] = None /\\ cursor[c] > 0) ', '']],
      },
      {
        name: 'a backup restored without -restored',
        edits: [],
        config: [['RestoreBumpsEpoch = TRUE', 'RestoreBumpsEpoch = FALSE']],
      },
    ],
  },
];

function applyEdits(text: string, edits: [string, string][], name: string): string {
  let out = text;
  for (const [from, to] of edits) {
    if (!out.includes(from)) throw new Error(`Broken variant "${name}": the model no longer contains ${JSON.stringify(from)}. Update scripts/formal.ts.`);
    out = out.split(from).join(to);
  }
  return out;
}

const summary: string[] = ['### Formal models', '', '| Model | Check | Result |', '|---|---|---|'];
const failures: string[] = [];
const fail = (message: string) => {
  failures.push(message);
  console.error(message);
};

for (const model of MODELS) {
  const source = readFileSync(join(root, model.file), 'utf8');
  if (model.tool === 'proverif') {
    const results = runProverif(join(root, model.file));
    const expected = readFileSync(join(root, model.expected), 'utf8').split('\n').filter((line) => line.startsWith('RESULT '));
    const same = results.length === expected.length && results.every((line, i) => line === expected[i]);
    if (!same) fail(`${model.file}: results differ from ${model.expected}.\nExpected:\n${expected.join('\n')}\nGot:\n${results.join('\n')}`);
    const holds = results.filter((line) => line.endsWith(' is true.')).length;
    const attacks = results.length - holds;
    summary.push(
      `| \`${model.file}\` | ${results.length} results as recorded (${holds} hold; ${attacks} ${attacks === 1 ? 'is an expected attack' : 'are expected attacks'}) | ${same ? '✅' : '❌'} |`,
    );
    model.broken.forEach((broken, i) => {
      const file = join(scratch, `broken-${i}.pv`);
      writeFileSync(file, applyEdits(source, broken.edits, broken.name));
      const caught = runProverif(file).some((line) => line.startsWith(broken.breaks!) && !line.endsWith(' is true.'));
      if (!caught) fail(`${model.file}: the broken variant "${broken.name}" still passes, so the model can't tell it apart.`);
      summary.push(`| \`${model.file}\` | Broken variant: ${broken.name} | ${caught ? '✅ caught' : '❌ not caught'} |`);
    });
  } else {
    const config = readFileSync(join(root, model.expected), 'utf8');
    const run = runTlc(join(root, model.file), config);
    if (!run.ok) fail(`${model.file}: TLC found a problem.\n${run.output}`);
    summary.push(`| \`${model.file}\` | Every invariant, ${run.states} distinct states | ${run.ok ? '✅' : `❌ ${run.violated ?? 'see the log'}`} |`);
    model.broken.forEach((broken, i) => {
      const dir = mkdtempSync(join(scratch, `broken-${i}-`));
      const spec = join(dir, model.file.replace(/^.*\//, ''));
      writeFileSync(spec, applyEdits(source, broken.edits, broken.name));
      const caught = runTlc(spec, applyEdits(config, broken.config ?? [], broken.name)).violated;
      if (!caught) fail(`${model.file}: the broken variant "${broken.name}" still passes, so the model can't tell it apart.`);
      summary.push(`| \`${model.file}\` | Broken variant: ${broken.name} | ${caught ? `✅ caught: ${caught}` : '❌ not caught'} |`);
    });
  }
}

const text = summary.join('\n');
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
process.exit(failures.length > 0 ? 1 : 0);
