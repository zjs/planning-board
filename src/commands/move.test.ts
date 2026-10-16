import { describe, expect, it } from 'vitest';
import type { MoveBundle, MovedDatabase } from '../move/addresses.ts';
import { isMoveBundle } from '../move/addresses.ts';
import { applyMove, planMove, type MoveWriter } from './move.ts';
import { addPlan, historyDatabase, listPlans, planDatabase, setShared, syncDatabase, type KeyValue, type PlanEntry } from './plans.ts';

function memory(): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

function writer() {
  const docs = new Map<string, Uint8Array[]>();
  const syncs = new Map<string, unknown>();
  const w: MoveWriter = {
    mergeDoc: (name, updates) => {
      docs.set(name, [...(docs.get(name) ?? []), ...updates]);
      return Promise.resolve();
    },
    putSync: (name, record) => {
      if (!syncs.has(name)) syncs.set(name, record);
      return Promise.resolve();
    },
  };
  return { w, docs, syncs };
}

const doc = (name: string, ...updates: number[][]): MovedDatabase => ({
  name,
  stores: [{ name: 'updates', records: updates.map((u, i) => ({ key: i + 1, value: new Uint8Array(u) })) }],
});
const sync = (name: string, record: unknown): MovedDatabase => ({ name, stores: [{ name: 'sync', records: [{ key: 'record', value: record }] }] });

const entry = (id: string, name: string, extra: Partial<PlanEntry> = {}): PlanEntry => ({ id, name, created: 1, opened: 2, ...extra });
const room = 'r'.repeat(22);
const shared = { relay: 'https://plans.example.com', room, viewKey: 'v'.repeat(43), secret: 's'.repeat(43) };

function bundle(plans: PlanEntry[], databases: MovedDatabase[], local: Record<string, string> = {}): MoveBundle {
  return { format: 'planning-board-move', version: 1, local: { 'planning-board:plans': JSON.stringify(plans), ...local }, databases };
}

describe('bringing plans from the old address (Q80 d)', () => {
  it('recognizes a bundle, and nothing else', () => {
    expect(isMoveBundle(bundle([], []))).toBe(true);
    expect(isMoveBundle({ format: 'planning-board-move', version: 2, local: {}, databases: [] })).toBe(false);
    expect(isMoveBundle('planning-board-move')).toBe(false);
    expect(isMoveBundle(null)).toBe(false);
  });

  it('keeps each plan’s id, sharing, history, sync records and view, in a browser that has none of them', async () => {
    const here = memory();
    here.setItem('planning-board:plans', '[]');
    const b = bundle(
      [entry('p1', 'Q3 roadmap', { shared }), entry('p2', 'Old idea', { deletedAt: 5 })],
      [doc(planDatabase('p1'), [1], [2]), doc(historyDatabase('p1', 'shared'), [3]), sync(syncDatabase('p1'), { cursor: 4, epoch: 'e', shadow: new Uint8Array([1]) }), doc(planDatabase('p2'), [9])],
      { 'planning-board:view:p1': '{"x":"time"}', 'planning-board:me': 'Ada', 'planning-board:guide': 'running' },
    );
    const { w, docs, syncs } = writer();
    const moved = await applyMove(b, w, here);
    expect(moved.map((m) => [m.to, m.into])).toEqual([['p1', 'new']]);
    expect(listPlans(here)).toEqual([entry('p1', 'Q3 roadmap', { shared })]);
    expect(docs.get(planDatabase('p1'))).toEqual([new Uint8Array([1]), new Uint8Array([2])]);
    expect(docs.get(historyDatabase('p1', 'shared'))).toEqual([new Uint8Array([3])]);
    expect(syncs.get(syncDatabase('p1'))).toMatchObject({ cursor: 4 });
    // A deleted plan stays behind.
    expect(docs.has(planDatabase('p2'))).toBe(false);
    expect(here.getItem('planning-board:view:p1')).toBe('{"x":"time"}');
    expect(here.getItem('planning-board:me')).toBe('Ada');
    // The guide was about a plan at the old address.
    expect(here.getItem('planning-board:guide')).toBeNull();
  });

  it('gives a plan a new id when this browser uses its id, as the first plan’s often is', async () => {
    const here = memory();
    // No list yet: this browser has the first plan, `default`.
    const b = bundle([entry('default', 'My plan')], [doc(planDatabase('default'), [7])], { 'planning-board:view': '{"x":"size"}' });
    const { w, docs } = writer();
    const [move] = await applyMove(b, w, here);
    expect(move!.into).toBe('new');
    expect(move!.to).not.toBe('default');
    expect(docs.get(planDatabase(move!.to))).toEqual([new Uint8Array([7])]);
    expect(docs.has(planDatabase('default'))).toBe(false);
    expect(here.getItem(`planning-board:view:${move!.to}`)).toBe('{"x":"size"}');
    // This browser's own first plan and its view are untouched.
    expect(here.getItem('planning-board:view')).toBeNull();
    expect(listPlans(here).map((e) => e.id).sort()).toEqual(['default', move!.to].sort());
  });

  it('merges a shared plan this browser already holds, rather than adding it twice, and keeps its sync record', async () => {
    const here = memory();
    here.setItem('planning-board:plans', '[]');
    const mine = addPlan('Q3 roadmap', here);
    setShared(mine.id, { relay: shared.relay, room, viewKey: shared.viewKey }, here);
    const b = bundle([entry('p1', 'Q3 roadmap', { shared })], [doc(planDatabase('p1'), [5]), sync(syncDatabase('p1'), { cursor: 9 })]);
    const { w, docs, syncs } = writer();
    const [move] = await applyMove(b, w, here);
    expect(move).toMatchObject({ to: mine.id, into: 'existing' });
    expect(docs.get(planDatabase(mine.id))).toEqual([new Uint8Array([5])]);
    expect(syncs.size).toBe(0);
    expect(listPlans(here)).toHaveLength(1);
    // The Can view copy here takes the moved copy's edit key.
    expect(listPlans(here)[0]!.shared?.secret).toBe(shared.secret);
  });

  it('never overwrites a setting this browser already has', async () => {
    const here = memory();
    here.setItem('planning-board:plans', '[]');
    here.setItem('planning-board:me', 'Bo');
    await applyMove(bundle([], [], { 'planning-board:me': 'Ada', 'planning-board:relay': 'https://plans.example.com' }), writer().w, here);
    expect(here.getItem('planning-board:me')).toBe('Bo');
    expect(here.getItem('planning-board:relay')).toBe('https://plans.example.com');
  });

  it('brings a browser’s only board when it never kept a plan list', () => {
    const here = memory();
    here.setItem('planning-board:plans', '[]');
    const b: MoveBundle = { format: 'planning-board-move', version: 1, local: {}, databases: [doc(planDatabase('default'), [1])] };
    expect(planMove(b, here).map((m) => [m.entry.name, m.to])).toEqual([['My plan', 'default']]);
  });
});
