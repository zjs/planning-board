// Measurements for relay-and-sync.md: the real provider, in Node, against
// the real Go relay, on the sample plan. Run from the repo root:
//
//   node spikes/sync-client/bench.ts
//
// It builds and starts its own relay on a spare port, with a fresh data
// directory, and writes docs/research/collaboration/relay-measurements.md.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Y from 'yjs';
import { createPlanStore, dropCard, loadPlan, renameItem, type PlanStore } from '../../src/commands/store.ts';
import { parsePlanJson } from '../../src/domain/planJson.ts';
import { SYSTEM, TIME } from '../../src/domain/model.ts';
import { allCopies, layoutView, type ViewSpec } from '../../src/domain/view.ts';
import { readPlan } from '../../src/store/schema.ts';
import { fromBase64, newKey, newRoomId } from './crypto.ts';
import { EncryptedProvider } from './provider.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const OUT = join(repo, 'docs/research/collaboration/relay-measurements.md');
const PORT = 8791;
const URL_ = `ws://localhost:${PORT}`;
const roadmap: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };

const parsed = parsePlanJson(JSON.parse(readFileSync(join(repo, 'src/seed/sample-plan.json'), 'utf8')));
if (!parsed.ok) throw new Error('sample plan');
const sample = parsed;

const work = mkdtempSync(join(tmpdir(), 'relay-bench-'));
const binary = join(work, 'relay');
const data = join(work, 'data');
const build = spawnSync('go', ['build', '-o', binary, '.'], { cwd: join(repo, 'spikes/relay'), stdio: 'inherit' });
if (build.status !== 0) throw new Error('go build failed');

let relay: ChildProcess;
async function startRelay() {
  relay = spawn(binary, ['-addr', `localhost:${PORT}`, '-data', data], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(50);
  }
  throw new Error('relay did not start');
}
const stopRelay = () => new Promise<void>((resolve) => { relay.once('exit', () => resolve()); relay.kill(); });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(what: string, test: () => boolean, ms = 20_000) {
  const start = Date.now();
  while (!test()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
  return Date.now() - start;
}

const canonical = (store: PlanStore) => {
  const p = readPlan(store.doc);
  return JSON.stringify(Object.values(p.items).map((i) => [i.id, i.title, i.parent, i.sequence, Object.entries(i.values).sort()]).sort());
};

/** A random edit through the app's commands: a drop to another cell, or a rename. */
function edit(store: PlanStore, n: number) {
  const plan = readPlan(store.doc);
  const layout = layoutView(plan, roadmap);
  const copies = allCopies(layout).filter((r) => !r.via && !r.open);
  const copy = copies[(n * 7919) % copies.length]!;
  if (n % 3 === 0) {
    renameItem(store, copy.itemId, `${plan.items[copy.itemId]!.title.split(' #')[0]} #${n}`);
  } else {
    const x = layout.columns[(n * 31) % layout.columns.length]!.key;
    const y = layout.rows[(n * 17) % layout.rows.length]!.key;
    dropCard(store, roadmap, copy, { x, y });
  }
}

function person(key: CryptoKey, room: string, snapshotEvery = Infinity) {
  const store = createPlanStore();
  const provider = new EncryptedProvider(store.doc, URL_, room, key, undefined, snapshotEvery);
  return { store, provider };
}

const rows: [string, string][] = [];
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

await startRelay();
const room = newRoomId();
const { key } = await newKey();

// 1. Share the sample plan.
const alice = person(key, room);
loadPlan(alice.store, sample.plan);
const fullState = Y.encodeStateAsUpdate(alice.store.doc).length;
await alice.provider.whenSynced;
await until('the upload to be acknowledged', () => alice.provider.waiting === 0);
rows.push(['Sample plan as one Yjs update', `${Object.keys(sample.plan.items).length} cards, ${kb(fullState)}`]);
rows.push(['Uploading it, encrypted', `${kb(alice.provider.stats.sentWireBytes)} on the wire (base64 in JSON)`]);

// 2. A thousand live edits.
const before = { ...alice.provider.stats };
const editStart = Date.now();
for (let n = 1; n <= 1000; n++) edit(alice.store, n);
const localMs = Date.now() - editStart;
await until('1,000 edits to be acknowledged', () => alice.provider.waiting === 0, 60_000);
const editMs = Date.now() - editStart;
const sent = alice.provider.stats.sentUpdates - before.sentUpdates;
const plain = alice.provider.stats.sentPlainBytes - before.sentPlainBytes;
const wire = alice.provider.stats.sentWireBytes - before.sentWireBytes;
rows.push(['One edit (a drop or a rename)', `${Math.round(plain / sent)} bytes of Yjs update, ${Math.round(wire / sent)} bytes on the wire`]);
rows.push([
  `1,000 edits in a row (${sent} of them changed something)`,
  `the relay had acknowledged them all ${editMs - localMs} ms after the last was made, writing each to disk first`,
]);

// 3. Someone opens the link: catch up from the start, by replaying the log.
const bob = person(key, room);
await bob.provider.whenSynced;
const replay = bob.provider.stats;
rows.push([
  `Opening the link: replay the whole log (${bob.provider.head} updates)`,
  `${replay.catchUpMs} ms, ${replay.catchUpMessages} messages, ${kb(replay.catchUpBytes)}`,
]);
const same1 = canonical(alice.store) === canonical(bob.store);

// 4. With a snapshot: Alice uploads one, and the next person starts from it.
await alice.provider.uploadSnapshot();
await sleep(200);
const carol = person(key, room);
await carol.provider.whenSynced;
rows.push([
  'Opening the link: a snapshot, then nothing after it',
  `${carol.provider.stats.catchUpMs} ms, ${carol.provider.stats.catchUpMessages} messages, ${kb(carol.provider.stats.catchUpBytes)}; the plan after those edits is ${kb(Y.encodeStateAsUpdate(alice.store.doc).length)} as one update`,
]);
const logLines = readFileSync(join(data, room, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).length;
rows.push(['The relay\'s log after the snapshot', `${logLines} updates left: it dropped everything the snapshot covers`]);
carol.provider.destroy();

// 5. Bob goes offline. Both keep editing, some of it on the same cards.
bob.provider.goOffline();
const headBefore = alice.provider.head;
for (let n = 2001; n <= 2050; n++) edit(alice.store, n);
for (let n = 3001; n <= 3020; n++) edit(bob.store, n);
await until('Alice\'s edits to be acknowledged', () => alice.provider.waiting === 0);
const reconnect = Date.now();
bob.provider.goOnline();
await bob.provider.whenLive();
await until('both boards to converge', () => canonical(alice.store) === canonical(bob.store));
rows.push([
  `Reconnecting after ${alice.provider.head - headBefore - 1} updates by others and 20 edits of one's own`,
  `converged in ${Date.now() - reconnect} ms; ${bob.provider.stats.catchUpMessages} messages in, and one update out holding all 20 edits`,
]);

// 6. The relay restarts while Alice is editing.
await stopRelay();
for (let n = 4001; n <= 4010; n++) edit(alice.store, n);
await sleep(300);
const restart = Date.now();
await startRelay();
await alice.provider.whenLive();
await bob.provider.whenLive();
await until('both boards to converge after the restart', () => canonical(alice.store) === canonical(bob.store));
rows.push(['The relay restarts while someone edits', `both converged ${Date.now() - restart} ms after it came back, with nothing lost`]);

// 7. The wrong key: a client with another key can connect, but reads nothing, and what it writes is unreadable.
const { key: wrong } = await newKey();
const mallory = person(wrong, room);
const errors: unknown[] = [];
const originalError = console.error;
console.error = (...args: unknown[]) => void errors.push(args);
await Promise.race([mallory.provider.whenSynced, sleep(2000)]);
const malloryRead = errors.length;
const headBeforeJunk = alice.provider.head;
loadPlan(mallory.store, { ...sample.plan, items: {} });
await until('the relay to accept the unreadable update', () => alice.provider.head > headBeforeJunk);
await sleep(200);
console.error = originalError;
rows.push([
  'Someone with the wrong key',
  `reads ${Object.keys(readPlan(mallory.store.doc).items).length} cards: all ${malloryRead} messages failed to decrypt. ` +
    `The relay still accepted their update (number ${alice.provider.head}), since it can't tell; the others dropped it as unreadable (${errors.length - malloryRead} failures), and their boards are unchanged`,
]);
mallory.provider.destroy();
const unchanged = canonical(alice.store) === canonical(bob.store) && Object.keys(readPlan(alice.store.doc).items).length > 0;

// 8. Nothing the relay stores is readable.
const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
};
walk(data);
const stored = files.map((f) => readFileSync(f, 'utf8')).join('\n');
const payloads = [...stored.matchAll(/"data":"([^"]+)"/g)].map((m) => new TextDecoder('latin1').decode(fromBase64(m[1]!)));
const titles = Object.values(sample.plan.items).map((i) => i.title).filter((t) => t.length >= 8);
const leaked = titles.filter((t) => stored.includes(t) || payloads.some((p) => p.includes(t)));
rows.push([
  'Plan text in the relay\'s storage',
  `${leaked.length} of ${titles.length} card titles found, in ${files.length} files (${kb(stored.length)}), raw or base64-decoded`,
]);

alice.provider.destroy();
bob.provider.destroy();
await stopRelay();

// 9. What each way of recording who changed what costs in document size, for the same 1,000 edits.
const { recordHistory } = await import('./history.ts');
function createPlanStoreWith(plan: typeof sample.plan) {
  const store = createPlanStore();
  loadPlan(store, plan);
  return store;
}
function sized(setup: (store: PlanStore) => void, gc = true) {
  const store = createPlanStore(new Y.Doc({ gc }));
  loadPlan(store, sample.plan);
  setup(store);
  for (let n = 1; n <= 1000; n++) edit(store, n);
  return store;
}
const plainDoc = sized(() => {});
const withLog = sized((store) => void recordHistory(store.doc, () => ({ name: 'Alice', color: '#d9480f' })));
await sleep(50); // history entries are written a microtask after each command
const noGc = sized(() => {}, false);
const withPud = sized((store) => new Y.PermanentUserData(store.doc).setUserMapping(store.doc, store.doc.clientID, 'Alice'));
// Measured as the board would be stored after a reload. During a session the undo history keeps deleted
// content alive, whatever the setting, so the in-memory document is the same size either way.
const size = (store: PlanStore) => {
  const reloaded = new Y.Doc({ gc: store.doc.gc });
  Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(store.doc));
  return Y.encodeStateAsUpdate(reloaded).length;
};
const attribution: [string, string][] = [
  ['The plan after 1,000 edits, as stored today', kb(size(plainDoc))],
  ['The same plan, newly made (no history of edits at all)', kb(Y.encodeStateAsUpdate(createPlanStoreWith(sample.plan).doc).length)],
  ['Plus a history line per change, in the document (option 2)', `${kb(size(withLog))}, ${withLog.doc.getArray('history').length} entries`],
  ['Plus Yjs\'s own attribution, PermanentUserData (option 1)', kb(size(withPud))],
  ['Keeping every deleted value, which Yjs snapshots need for version history (option 3)', kb(size(noGc))],
];

const lines = [
  '# Relay and sync: measurements',
  '',
  `_Generated by \`node spikes/sync-client/bench.ts\` on ${new Date().toISOString().slice(0, 10)}, in the cloud development container. Timings are from one machine, with the relay and both clients on localhost, so they show proportions rather than what a real network adds. The reading is in [\`relay-and-sync.md\`](relay-and-sync.md)._`,
  '',
  '| What | Result |',
  '|---|---|',
  ...rows.map(([a, b]) => `| ${a} | ${b} |`),
  '',
  `Both boards matched after catching up: ${same1 ? 'yes' : 'NO'}. They were still identical, and not empty, after the unreadable update: ${unchanged ? 'yes' : 'NO'}.`,
  '',
  '## Recording who changed what: the cost',
  '',
  'The sample plan, then the same 1,000 edits, with nothing else recorded, then with each way of recording who did them (`presence-and-history.md`).',
  '',
  '| Document | Size as one update |',
  '|---|---|',
  ...attribution.map(([a, b]) => `| ${a} | ${b} |`),
  '',
];
writeFileSync(OUT, lines.join('\n'));
console.log(lines.join('\n'));
if (!same1 || !unchanged || leaked.length > 0) process.exit(1);
process.exit(0);
