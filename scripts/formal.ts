// Run the formal models (ADR 0024, docs/security/threat-model.md): `npm run formal`.
//
// Each model's results must match the ones recorded beside it, true and false
// alike. Each broken variant, a small edit to the model that removes the thing
// a result depends on, must change that result: a model too weak to notice its
// own broken variant proves nothing. The tools are pinned by URL and SHA-256,
// and installed into formal/.tools on first use. ProVerif is built from source,
// which needs OCaml (`ocaml-nox` on Ubuntu).

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tools = join(root, 'formal', '.tools');

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

/** A model's results, one line per query, in the tool's own words. */
function runProverif(file: string): string[] {
  const run = spawnSync(proverif(), [file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`proverif ${file} failed:\n${run.stdout}\n${run.stderr}`);
  return run.stdout.split('\n').filter((line) => line.startsWith('RESULT '));
}

/** A broken variant: a textual edit to the model, and the result it must turn false. */
interface Broken {
  name: string;
  edits: [string, string][];
  /** The start of the result line that must no longer say "is true". */
  breaks: string;
}

interface Model {
  file: string;
  expected: string;
  broken: Broken[];
}

const MODELS: Model[] = [
  {
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
let failed = false;
const scratch = mkdtempSync(join(tmpdir(), 'formal-'));

for (const model of MODELS) {
  const results = runProverif(join(root, model.file));
  const expected = readFileSync(join(root, model.expected), 'utf8').split('\n').filter((line) => line.startsWith('RESULT '));
  const same = results.length === expected.length && results.every((line, i) => line === expected[i]);
  if (!same) {
    failed = true;
    console.error(`${model.file}: results differ from ${model.expected}.\nExpected:\n${expected.join('\n')}\nGot:\n${results.join('\n')}`);
  }
  const holds = results.filter((line) => line.endsWith(' is true.')).length;
  summary.push(`| \`${model.file}\` | ${results.length} results as recorded (${holds} hold; ${results.length - holds} ${results.length - holds === 1 ? 'is an expected attack' : 'are expected attacks'}) | ${same ? '✅' : '❌'} |`);

  for (const broken of model.broken) {
    const file = join(scratch, `broken-${model.broken.indexOf(broken)}.pv`);
    writeFileSync(file, applyEdits(readFileSync(join(root, model.file), 'utf8'), broken.edits, broken.name));
    const caught = runProverif(file).some((line) => line.startsWith(broken.breaks) && !line.endsWith(' is true.'));
    if (!caught) {
      failed = true;
      console.error(`${model.file}: the broken variant "${broken.name}" still passes, so the model can't tell it apart.`);
    }
    summary.push(`| \`${model.file}\` | Broken variant: ${broken.name} | ${caught ? '✅ caught' : '❌ not caught'} |`);
  }
}

const text = summary.join('\n');
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
process.exit(failed ? 1 : 0);
