import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { isMoveBundle, type MoveBundle, type MovedDatabase } from '../move/addresses.ts';
import { applyMove, movablePlans, type MoveWriter } from './move.ts';
import {
  addPlan,
  allPlanEntries,
  historyDatabase,
  listPlans,
  markDeleted,
  planDatabase,
  renamePlan,
  setShared,
  syncDatabase,
  type KeyValue,
  type PlanEntry,
} from './plans.ts';
import { readPlan } from '../store/schema.ts';
import { createPlanStore, loadPlan } from './store.ts';

function memory(list?: PlanEntry[]): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  if (list) map.set('planning-board:plans', JSON.stringify(list));
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

/** A writer in memory. Boards named in `full` already have cards here. */
function writer(full: string[] = []) {
  const docs = new Map<string, Uint8Array[]>();
  const syncs = new Map<string, unknown>();
  const dropped: string[] = [];
  const w: MoveWriter = {
    mergeDoc: (name, updates) => {
      docs.set(name, [...(docs.get(name) ?? []), ...updates]);
      return Promise.resolve();
    },
    putSync: (name, record) => {
      if (!syncs.has(name)) syncs.set(name, record);
      return Promise.resolve();
    },
    boardIsEmpty: (name) => Promise.resolve(!full.includes(name) && !docs.has(name)),
    dropPlan: (id) => {
      dropped.push(id);
      return Promise.resolve();
    },
  };
  return { w, docs, syncs, dropped };
}

/** A board with one card, as y-indexeddb stores it: one update. */
function board(title = 'Passkey enrolment'): Uint8Array {
  const doc = new Y.Doc();
  loadPlan(createPlanStore(doc), plan(item('a', { title })));
  return Y.encodeStateAsUpdate(doc);
}

const db = (name: string, ...updates: Uint8Array[]): MovedDatabase => ({
  name,
  stores: [{ name: 'updates', records: updates.map((u, i) => ({ key: i + 1, value: u })) }],
});
const sync = (name: string, record: unknown): MovedDatabase => ({ name, stores: [{ name: 'sync', records: [{ key: 'record', value: record }] }] });

const entry = (id: string, name: string, extra: Partial<PlanEntry> = {}): PlanEntry => ({ id, name, created: 1, opened: 2, ...extra });
const room = 'r'.repeat(22);
const shared = { relay: 'https://plans.example.com', room, viewKey: 'v'.repeat(43), secret: 's'.repeat(43) };

function bundle(plans: PlanEntry[] | undefined, databases: MovedDatabase[], local: Record<string, string> = {}): MoveBundle {
  return { format: 'planning-board-move', version: 1, local: { ...(plans ? { 'planning-board:plans': JSON.stringify(plans) } : {}), ...local }, databases };
}

describe('bringing plans from the old address (Q80 d)', () => {
  it('recognizes a bundle, and nothing else', () => {
    expect(isMoveBundle(bundle([], []))).toBe(true);
    expect(isMoveBundle({ format: 'planning-board-move', version: 2, local: {}, databases: [] })).toBe(false);
    expect(isMoveBundle('planning-board-move')).toBe(false);
    expect(isMoveBundle(null)).toBe(false);
  });

  it('keeps each plan’s id, sharing, history, sync records and view, in a browser that has none of them', async () => {
    const here = memory([]);
    const b = bundle(
      [entry('p1', 'Q3 roadmap', { shared }), entry('p2', 'Old idea', { deletedAt: 5 })],
      [db(planDatabase('p1'), board()), db(historyDatabase('p1', 'shared'), new Uint8Array([3])), sync(syncDatabase('p1'), { cursor: 4, epoch: 'e', shadow: new Uint8Array([1]) }), db(planDatabase('p2'), board())],
      { 'planning-board:view:p1': '{"x":"time"}', 'planning-board:me': 'Ada', 'planning-board:guide': 'running' },
    );
    const { w, docs, syncs } = writer();
    const moved = await applyMove(b, w, here);
    expect(moved.map((m) => [m.to, m.into])).toEqual([['p1', 'new']]);
    expect(listPlans(here)).toEqual([entry('p1', 'Q3 roadmap', { shared, movedFrom: 'p1' })]);
    expect(docs.get(planDatabase('p1'))).toHaveLength(1);
    expect(docs.get(historyDatabase('p1', 'shared'))).toEqual([new Uint8Array([3])]);
    expect(syncs.get(syncDatabase('p1'))).toMatchObject({ cursor: 4 });
    // A deleted plan stays behind.
    expect(docs.has(planDatabase('p2'))).toBe(false);
    expect(here.getItem('planning-board:view:p1')).toBe('{"x":"time"}');
    expect(here.getItem('planning-board:me')).toBe('Ada');
    // The guide was about a plan at the old address.
    expect(here.getItem('planning-board:guide')).toBeNull();
  });

  it('leaves behind an empty board nobody named or shared, such as the first plan made by looking once', () => {
    const empty = Y.encodeStateAsUpdate(new Y.Doc());
    const b = bundle(
      [entry('default', 'My plan', { created: 0 }), entry('p2', 'Untitled plan'), entry('p3', 'Named, empty', { named: true }), entry('p4', 'Shared, empty', { shared })],
      [db(planDatabase('default'), empty), db(planDatabase('p2'))],
    );
    expect(movablePlans(b).map((e) => e.id)).toEqual(['p3', 'p4']);
    // A browser from before the plan list, with only the first plan's board.
    expect(movablePlans(bundle(undefined, [db(planDatabase('default'), board())])).map((e) => e.name)).toEqual(['My plan']);
    expect(movablePlans(bundle(undefined, [db(planDatabase('default'), empty)]))).toEqual([]);
  });

  it('puts the moved first plan in place of this browser’s untouched empty one, rather than beside it', async () => {
    // A browser that has only looked at the new address: its first plan is implicit, empty and unnamed.
    const here = memory([{ id: 'default', name: 'My plan', created: 0, opened: 0 }]);
    const b = bundle([entry('default', 'My plan', { created: 0 })], [db(planDatabase('default'), board())]);
    const { w, docs } = writer();
    const [move] = await applyMove(b, w, here);
    expect(move).toMatchObject({ to: 'default', into: 'new' });
    expect(docs.has(planDatabase('default'))).toBe(true);
    expect(listPlans(here).map((e) => [e.id, e.name])).toEqual([['default', 'My plan']]);
  });

  it('keeps this browser’s first plan when it has cards, and gives the moved one a new id', async () => {
    const here = memory([{ id: 'default', name: 'My plan', created: 0, opened: 0 }]);
    const b = bundle([entry('default', 'My plan', { created: 0 })], [db(planDatabase('default'), board())], { 'planning-board:view': '{"x":"size"}' });
    const { w, docs } = writer([planDatabase('default')]);
    const [move] = await applyMove(b, w, here);
    expect(move!.to).not.toBe('default');
    expect(docs.has(planDatabase('default'))).toBe(false);
    expect(here.getItem(`planning-board:view:${move!.to}`)).toBe('{"x":"size"}');
    expect(here.getItem('planning-board:view')).toBeNull();
    expect(listPlans(here).map((e) => e.id).sort()).toEqual(['default', move!.to].sort());
  });

  it('drops this browser’s untouched empty first plan once others are moved in', async () => {
    const here = memory([{ id: 'default', name: 'My plan', created: 0, opened: 0 }]);
    const { w } = writer();
    await applyMove(bundle([entry('p1', 'Q3 roadmap')], [db(planDatabase('p1'), board())]), w, here);
    expect(listPlans(here).map((e) => e.id)).toEqual(['p1']);
  });

  it('adds nothing twice when the same plans are brought again', async () => {
    const here = memory([{ id: 'default', name: 'My plan', created: 0, opened: 0 }]);
    const b = bundle([entry('default', 'My plan', { created: 0 }), entry('p1', 'Idea')], [db(planDatabase('default'), board()), db(planDatabase('p1'), board('Other'))]);
    const { w } = writer();
    await applyMove(b, w, here);
    const first = allPlanEntries(here).map((e) => e.id).sort();
    const again = await applyMove(b, w, here);
    expect(again.map((m) => m.into)).toEqual(['existing', 'existing']);
    expect(allPlanEntries(here).map((e) => e.id).sort()).toEqual(first);
    // Renamed here since: still the same plan.
    renamePlan('p1', 'Idea, refined', {}, here);
    expect((await applyMove(b, w, here)).map((m) => m.to).sort()).toEqual(first);
  });

  it('merges a shared plan this browser already holds, deleted or not, keeping its own sync record', async () => {
    const here = memory([]);
    const mine = addPlan('Q3 roadmap', here);
    setShared(mine.id, { relay: shared.relay, room, viewKey: shared.viewKey }, here);
    markDeleted(mine.id, here);
    const b = bundle([entry('p1', 'Q3 roadmap', { shared })], [db(planDatabase('p1'), board()), sync(syncDatabase('p1'), { cursor: 9 })]);
    const { w, docs, syncs } = writer();
    const [move] = await applyMove(b, w, here);
    expect(move).toMatchObject({ to: mine.id, into: 'existing' });
    expect(docs.get(planDatabase(mine.id))).toHaveLength(1);
    expect(syncs.size).toBe(0);
    expect(allPlanEntries(here)).toHaveLength(1);
    // Brought back from its Undo, and the Can view copy here takes the moved copy's edit key.
    expect(listPlans(here)[0]!.shared?.secret).toBe(shared.secret);
  });

  it('never overwrites a setting this browser has, and leaves the relay last used for Share behind', async () => {
    const here = memory([]);
    here.setItem('planning-board:me', 'Bo');
    await applyMove(bundle([], [], { 'planning-board:me': 'Ada', 'planning-board:me-id': 'ada-1', 'planning-board:relay': 'https://plans.example.com' }), writer().w, here);
    expect(here.getItem('planning-board:me')).toBe('Bo');
    expect(here.getItem('planning-board:me-id')).toBe('ada-1');
    expect(here.getItem('planning-board:relay')).toBeNull();
  });
});

describe('bringing plans: the edges the second review found', () => {
  it('moves a plan with structure but no cards, and one with only a history left', () => {
    const doc = new Y.Doc();
    loadPlan(createPlanStore(doc), plan());
    const structure = Y.encodeStateAsUpdate(doc);
    const b = bundle(
      [entry('p1', 'Untitled plan'), entry('p2', 'Untitled plan')],
      [db(planDatabase('p1'), structure), db(historyDatabase('p2', 'local'), new Uint8Array([1]))],
    );
    expect(movablePlans(b).map((e) => e.id)).toEqual(['p1', 'p2']);
  });

  it('moves a board a browser kept only from before schema 2, migrated as the app would', async () => {
    const v1 = new Uint8Array(readFileSync(new URL('../domain/__fixtures__/compat/sprint-9.board.yjs', import.meta.url)));
    const b = bundle(undefined, [db('planning-board:v1:default', v1)]);
    expect(movablePlans(b).map((e) => e.name)).toEqual(['My plan']);
    const here = memory([]);
    const { w, docs } = writer();
    const [move] = await applyMove(b, w, here);
    const moved = new Y.Doc();
    Y.applyUpdate(moved, Y.mergeUpdates(docs.get(planDatabase(move!.to))!));
    expect(Object.keys(readPlan(moved).items).length).toBeGreaterThan(0);
  });

  it('takes sharing a plan gained at the old address after it was first moved', async () => {
    const here = memory([]);
    const { w, syncs } = writer();
    await applyMove(bundle([entry('p1', 'Idea')], [db(planDatabase('p1'), board())]), w, here);
    const [again] = await applyMove(bundle([entry('p1', 'Idea', { shared })], [db(planDatabase('p1'), board()), sync(syncDatabase('p1'), { cursor: 2 })]), w, here);
    expect(again).toMatchObject({ to: 'p1', into: 'existing', sharing: 'adopted' });
    expect(listPlans(here)[0]!.shared?.room).toBe(room);
    expect(syncs.get(syncDatabase('p1'))).toMatchObject({ cursor: 2 });
    // Shared through another room here: it keeps its own, and the dialog says so.
    const other = { ...shared, room: 'o'.repeat(22) };
    const [third] = await applyMove(bundle([entry('p1', 'Idea', { shared: other })], [db(planDatabase('p1'), board())]), w, here);
    expect(third!.sharing).toBe('differs');
    expect(listPlans(here)[0]!.shared?.room).toBe(room);
  });

  it('says a plan deleted here comes back', async () => {
    const here = memory([]);
    const { w } = writer();
    const b = bundle([entry('p1', 'Idea')], [db(planDatabase('p1'), board())]);
    await applyMove(b, w, here);
    markDeleted('p1', here);
    const [move] = await applyMove(b, w, here);
    expect(move).toMatchObject({ into: 'existing', restored: true });
    expect(listPlans(here).map((e) => e.id)).toEqual(['p1']);
  });

  it('drops the untouched empty first plan’s databases, and finishes a move cut short into it without adding it twice', async () => {
    const here = memory([{ id: 'default', name: 'My plan', created: 0, opened: 0 }]);
    const { w, dropped } = writer();
    await applyMove(bundle([entry('p1', 'Idea')], [db(planDatabase('p1'), board())]), w, here);
    expect(dropped).toEqual(['default']);

    const there = memory([{ id: 'default', name: 'My plan', created: 0, opened: 0 }]);
    const b = bundle([entry('default', 'My plan', { created: 0 })], [db(planDatabase('default'), board()), db(historyDatabase('default', 'local'), new Uint8Array([1]))]);
    const flaky = writer();
    let fail = true;
    const cut: MoveWriter = {
      ...flaky.w,
      mergeDoc: (name, updates) => (fail && name === historyDatabase('default', 'local') ? Promise.reject(new Error('cut short')) : flaky.w.mergeDoc(name, updates)),
    };
    await expect(applyMove(b, cut, there)).rejects.toThrow('cut short');
    fail = false;
    await applyMove(b, cut, there);
    expect(allPlanEntries(there).map((e) => e.id)).toEqual(['default']);
  });
});
