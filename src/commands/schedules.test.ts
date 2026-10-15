// Random schedules against the real code (ADR 0024, sprint 14, slice 4): the
// bridge between formal/tla/Sync.tla and Tree.tla, which prove a design, and
// the code that's meant to follow it. Three people edit one plan through the
// real commands and the real relay provider, over the fake relay in
// src/store/fakeRelay.ts. A seeded schedule mixes edits and nesting with going
// offline, connections dropped part-way through a catch-up, tabs crashing
// between saves, the relay dropping everyone, and restores from a backup.
// Afterwards, with everyone online, the models' properties must hold of what
// actually happened: every copy is the same plan, no card it ever had is
// missing, and grouping has no loop. A failing seed is in the test's name, so
// it can be run again alone (`npx vitest run -t "seed 123"`).

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { SYSTEM, TIME } from '../domain/model.ts';
import { loopRepairs } from '../domain/tree.ts';
import type { ViewSpec } from '../domain/view.ts';
import { FakeRelay, settle, timers, type FakeSocket } from '../store/fakeRelay.ts';
import { newRoom, toBase64Url, viewKeyOf } from '../store/keys.ts';
import { RelayProvider, type RelaySocket, type SyncRecord, type SyncStore } from '../store/relay.ts';
import { readPlan, readTree } from '../store/schema.ts';
import { createItem, createPlanStore, loadPlan, moveToParent, renameItem, watchLoops, type PlanStore } from './store.ts';

// 200 in `npm run check`, a few seconds; the Formal CI job runs more (SCHEDULE_SEEDS).
const SEEDS = Number(process.env.SCHEDULE_SEEDS ?? 200);
const STEPS = 40;

/** A small, fast generator with a seed (mulberry32). */
function random(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]! };
}

const roadmap: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };

const start = () =>
  plan(
    item('epic', { title: 'Passwordless login', values: { [TIME]: ['q2'], [SYSTEM]: ['id'] } }),
    item('story', { title: 'Passkey enrolment', parent: 'epic', values: { [TIME]: ['q2'], [SYSTEM]: ['id/sso'] } }),
    item('tax', { title: 'Tax engine migration', values: { [TIME]: ['q1'], [SYSTEM]: ['pay'] } }),
  );

/**
 * One person's browser. A crash ends this incarnation: its provider can save
 * nothing more, and the next one starts from what was saved, the plan's
 * document (saved with each of its own changes, others' some time later) and
 * the sync record (saved by the provider).
 */
interface Person {
  name: string;
  online: boolean;
  store: PlanStore;
  provider: RelayProvider;
  saved: Uint8Array;
  record: { value: SyncRecord | null };
  alive: { value: boolean };
  sockets: Set<FakeSocket>;
  stopLoops: () => void;
}

function run(seed: number) {
  const rng = random(seed);
  const relay = new FakeRelay();
  // A flaky network: now and then a connection drops after its catch-up's updates and before synced.
  relay.cutCatchUp = () => rng.next() < 0.3;
  const clock = timers();
  const { room, secret } = newRoom();
  const s = toBase64Url(secret);
  const seedDoc = new Y.Doc();
  loadPlan(createPlanStore(seedDoc), start());
  const initial = Y.encodeStateAsUpdate(seedDoc);
  // Every card any copy ever had, and every title anyone gave it.
  const made = new Set(Object.keys(readPlan(seedDoc).items));
  const titles = new Map([...made].map((id) => [id, new Set([readPlan(seedDoc).items[id]!.title])]));
  const backups: ReturnType<FakeRelay['backup']>[] = [];
  const log: string[] = [];

  const open = (person: () => Person) => (url: string): RelaySocket => {
    const socket = relay.open(url) as FakeSocket;
    person().sockets.add(socket);
    if (!person().online) queueMicrotask(() => socket.drop());
    return socket;
  };

  const incarnate = (name: string, saved: Uint8Array, record: { value: SyncRecord | null }, create: boolean): Person => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, saved);
    const store = createPlanStore(doc);
    const alive = { value: true };
    const sync: SyncStore = {
      load: () => Promise.resolve(record.value),
      save: (r) => {
        if (alive.value) record.value = r;
        return Promise.resolve();
      },
    };
    const person: Person = {
      name,
      online: true,
      store,
      provider: undefined as unknown as RelayProvider,
      saved,
      record,
      alive,
      sockets: new Set(),
      stopLoops: watchLoops(store),
    };
    person.provider = new RelayProvider({
      doc,
      relay: 'http://relay.test:8787',
      room,
      viewKey: viewKeyOf(s),
      secret: s,
      ...(create ? { create: true } : {}),
      sync,
      open: open(() => person),
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    return person;
  };

  // Ada shares the plan. As in the app, her share stays pending, asking the relay to create the room, until the
  // relay has it; only then do the others get the link.
  const shares = () => !relay.rooms.has(room);
  const people: Person[] = [incarnate('Ada', initial, { value: null }, true)];
  const remember = (p: Person) => {
    p.saved = Y.encodeStateAsUpdate(p.store.doc);
  };
  const ids = () => [...made];

  const steps: (() => Promise<void> | void)[] = [
    // Someone adds a card.
    () => {
      const p = rng.pick(people);
      const title = `Card ${made.size + 1} by ${p.name}`;
      const id = createItem(p.store, roadmap, { x: 'q1', y: 'pay' }, title);
      if (id) {
        made.add(id);
        titles.set(id, new Set([title]));
        remember(p);
        log.push(`${p.name} adds ${id}`);
      }
    },
    // Someone renames a card.
    () => {
      const p = rng.pick(people);
      const id = rng.pick(ids());
      if (!readPlan(p.store.doc).items[id]) return;
      const title = `Renamed by ${p.name} ${Math.floor(rng.next() * 1000)}`;
      if (renameItem(p.store, id, title)) {
        titles.get(id)!.add(title);
        remember(p);
        log.push(`${p.name} renames ${id}`);
      }
    },
    // Someone nests a card inside another, or moves it out: what loop repair settles when two people do it at once.
    () => {
      const p = rng.pick(people);
      const id = rng.pick(ids());
      const into = rng.next() < 0.25 ? null : rng.pick(ids());
      if (!readPlan(p.store.doc).items[id] || (into && !readPlan(p.store.doc).items[into])) return;
      if (moveToParent(p.store, [id], into).length > 0) {
        remember(p);
        log.push(`${p.name} puts ${id} in ${into ?? 'the top level'}`);
      }
    },
    // Someone goes offline, or comes back.
    () => {
      const p = rng.pick(people);
      p.online = !p.online;
      if (!p.online) for (const socket of p.sockets) socket.drop();
      log.push(`${p.name} goes ${p.online ? 'online' : 'offline'}`);
    },
    // The browser saves what others changed, some time after it arrived.
    () => {
      const p = rng.pick(people);
      remember(p);
    },
    // A tab crashes: whatever wasn't saved is gone, and it opens again from what was.
    () => {
      const i = Math.floor(rng.next() * people.length);
      const p = people[i]!;
      p.alive.value = false;
      p.stopLoops();
      p.provider.destroy();
      for (const socket of p.sockets) socket.drop();
      const again = incarnate(p.name, p.saved, p.record, p.name === 'Ada' && shares());
      again.online = p.online;
      people[i] = again;
      log.push(`${p.name}'s tab crashes and reopens`);
    },
    // Someone new opens the link, with nothing of the plan yet: a first catch-up, which may be cut short.
    () => {
      if (people.length >= 5) return;
      const name = ['Di', 'Ed'][people.length - 3]!;
      people.push(incarnate(name, Y.encodeStateAsUpdate(new Y.Doc()), { value: null }, false));
      log.push(`${name} opens the link`);
    },
    // The relay drops everyone, as when it restarts.
    () => {
      relay.cut();
      log.push('the relay restarts');
    },
    // Whoever runs the relay backs it up, or restores the backup, starting once with -restored.
    () => {
      if (!relay.rooms.has(room)) return;
      if (backups.length > 0 && rng.next() < 0.5) {
        // Any backup, not only the latest: an older one is further behind everyone's cursors.
        const i = Math.floor(rng.next() * backups.length);
        relay.restore(room, backups[i]!);
        log.push(`the relay is restored from backup ${i + 1}`);
      } else {
        backups.push(relay.backup(room));
        log.push(`the relay is backed up (backup ${backups.length})`);
      }
    },
  ];

  // Restores, and people arriving, are where sync goes wrong, so they come up three times as often as anything else.
  const restore = steps[steps.length - 1]!;
  const join = steps[steps.length - 3]!;
  steps.push(restore, restore, join, join);

  return {
    async play() {
      await settle(clock);
      people.push(incarnate('Bo', initial, { value: null }, false), incarnate('Cy', initial, { value: null }, false));
      for (let i = 0; i < STEPS; i++) {
        await rng.pick(steps)();
        // Let some frames through, but not always all of them: a connection can drop in the middle of a catch-up.
        const rounds = Math.floor(rng.next() * 6);
        for (let r = 0; r < rounds; r++) await Promise.resolve();
        if (rng.next() < 0.3) clock.run();
      }
      // Everyone comes back, and the relay stays up.
      for (const p of people) p.online = true;
      relay.cutCatchUp = () => false;
      relay.cut();
      for (let i = 0; i < 4; i++) await settle(clock);
      return { people, made, titles, log };
    },
  };
}

describe('random schedules against the real code (formal/tla/Sync.tla, Tree.tla)', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    it(`seed ${seed}: every copy converges to one plan, nothing is lost, and grouping has no loop`, async () => {
      const { people, made, titles, log } = await run(seed).play();
      const why = `\nSchedule:\n  ${log.join('\n  ')}`;
      const plans = people.map((p) => readPlan(p.store.doc));
      for (const p of people) expect(p.provider.status, `${p.name} is live${why}`).toBe('live');
      for (const other of plans.slice(1)) expect(other, `every copy is the same plan${why}`).toEqual(plans[0]);
      const items = plans[0]!.items;
      for (const id of made) {
        expect(items[id], `${id} is still in the plan${why}`).toBeDefined();
        expect(titles.get(id)!.has(items[id]!.title), `${id}'s title is one someone gave it${why}`).toBe(true);
      }
      expect([...loopRepairs(readTree(people[0]!.store.doc)).keys()], `no loop is left${why}`).toEqual([]);
    });
  }
});
