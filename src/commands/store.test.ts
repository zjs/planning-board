import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { SEQUENCE, SYSTEM, TIME } from '../domain/model.ts';
import { parsePlanJson } from '../domain/planJson.ts';
import type { ViewSpec } from '../domain/view.ts';
import sample from '../seed/sample-plan.json';
import { readPlan } from '../store/schema.ts';
import {
  createItem,
  createPlanStore,
  deleteItems,
  dropCard,
  groupItems,
  NEW_GROUP_TITLE,
  ungroupItems,
  loadPlan,
  redo,
  renameItem,
  resetPlan,
  snapshotSource,
  undo,
} from './store.ts';

const timeBySystem: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };
const seqBySystem: ViewSpec = { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } };

function sortedValues(p: ReturnType<typeof readPlan>) {
  return Object.fromEntries(
    Object.values(p.items).map((i) => [
      i.id,
      Object.fromEntries(Object.entries(i.values).map(([k, v]) => [k, [...v].sort()])),
    ]),
  );
}

function storeWith(...items: Parameters<typeof plan>) {
  const store = createPlanStore();
  loadPlan(store, plan(...items));
  store.undoManager.clear();
  return store;
}

describe('plan store', () => {
  it('round-trips the sample plan through the Yjs document', () => {
    const parsed = parsePlanJson(sample);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const store = createPlanStore();
    loadPlan(store, parsed.plan);
    const back = readPlan(store.doc);
    expect(back.properties).toEqual(parsed.plan.properties);
    expect(sortedValues(back)).toEqual(sortedValues(parsed.plan));
    expect(Object.values(back.items).map(({ values, ...rest }) => rest)).toEqual(
      Object.values(parsed.plan.items).map(({ values, ...rest }) => rest),
    );
    expect(back.dependencies).toEqual(parsed.plan.dependencies);
  });

  it('applies a drop, and undo/redo treat it as one step', () => {
    const store = storeWith(item('a', { values: { [SYSTEM]: ['id/sso'] } }));
    expect(dropCard(store, timeBySystem, { itemId: 'a', x: null, y: 'id' }, { x: 'q2', y: 'pay' }, 'add')).toBe(
      true,
    );
    expect(readPlan(store.doc).items['a']!.values).toEqual({ [SYSTEM]: ['id/sso', 'pay'], [TIME]: ['q2'] });

    undo(store);
    expect(readPlan(store.doc).items['a']!.values).toEqual({ [SYSTEM]: ['id/sso'] });
    redo(store);
    expect(readPlan(store.doc).items['a']!.values[TIME]).toEqual(['q2']);
  });

  it('records one undo step per drop even when drops come in quick succession', () => {
    const store = storeWith(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }));
    dropCard(store, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { x: 'a0', y: 'pay' });
    dropCard(store, seqBySystem, { itemId: 'a', x: 'a0', y: 'pay' }, { x: 'a0', y: 'id' });
    undo(store);
    expect(readPlan(store.doc).items['a']!.values[SYSTEM]).toEqual(['pay']);
  });

  it('records nothing for a no-op drop', () => {
    const store = storeWith(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }));
    expect(dropCard(store, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { x: 'a0', y: 'id' })).toBe(
      false,
    );
    expect(store.undoManager.canUndo()).toBe(false);
  });

  it('clears a sequence position', () => {
    const store = storeWith(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }));
    dropCard(store, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { x: null, y: 'id' });
    expect(readPlan(store.doc).items['a']!.sequence).toBeNull();
  });

  it('makes load and reset undoable', () => {
    const store = storeWith(item('a'));
    resetPlan(store);
    expect(readPlan(store.doc).items).toEqual({});
    undo(store);
    expect(Object.keys(readPlan(store.doc).items)).toEqual(['a']);
  });

  it('keeps both concurrent adds to a multi-valued property', () => {
    const a = storeWith(item('x', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }));
    const b = createPlanStore();
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    const card = { itemId: 'x', x: 'a0', y: 'id' };
    dropCard(a, seqBySystem, card, { x: 'a0', y: 'pay' }, 'add');
    dropCard(b, timeBySystem, { itemId: 'x', x: null, y: 'id' }, { x: 'q1', y: 'id' });
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
    expect(readPlan(a.doc).items['x']!.values).toEqual({ [SYSTEM]: ['id', 'pay'], [TIME]: ['q1'] });
  });

  it('notifies once per command with a fresh snapshot, and stays stable otherwise', async () => {
    const store = storeWith(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }));
    const source = snapshotSource(store);
    let calls = 0;
    const unsubscribe = source.subscribe(() => calls++);
    const first = source.getSnapshot();
    expect(source.getSnapshot()).toBe(first);
    dropCard(store, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { x: 'a0', y: 'pay' });
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(source.getSnapshot()).not.toBe(first);
    expect(source.getSnapshot().canUndo).toBe(true);
    expect(source.getSnapshot().plan.items['a']!.values[SYSTEM]).toEqual(['pay']);
    unsubscribe();
  });

  it('catches up on changes made while nobody was subscribed', () => {
    const store = storeWith(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }));
    const source = snapshotSource(store);
    source.subscribe(() => undefined)();
    dropCard(store, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { x: 'a0', y: 'pay' });
    source.subscribe(() => undefined);
    expect(source.getSnapshot().plan.items['a']!.values[SYSTEM]).toEqual(['pay']);
  });
});

/** A snapshot with dependencies in a fixed order, so equal plans compare equal. */
function normalized(p: ReturnType<typeof readPlan>) {
  return { ...p, dependencies: [...p.dependencies].sort((a, b) => `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`)) };
}

describe('card commands', () => {
  it('creates a card with the values of the cell it was made in, as one undo step', () => {
    const store = storeWith();
    const id = createItem(store, timeBySystem, { x: 'q2', y: 'pay' }, '  Invoice  export ');
    expect(id).not.toBeNull();
    const created = readPlan(store.doc).items[id!]!;
    expect(created).toMatchObject({ title: 'Invoice export', parent: null, sequence: null });
    expect(created.values).toEqual({ [TIME]: ['q2'], [SYSTEM]: ['pay'] });
    undo(store);
    expect(readPlan(store.doc).items[id!]).toBeUndefined();
  });

  it('creates nothing for a blank title, and gives every card a fresh ID', () => {
    const store = storeWith();
    expect(createItem(store, timeBySystem, { x: null, y: null }, '   ')).toBeNull();
    expect(store.undoManager.canUndo()).toBe(false);
    const a = createItem(store, timeBySystem, { x: null, y: null }, 'A');
    const b = createItem(store, timeBySystem, { x: null, y: null }, 'B');
    expect(a).not.toBe(b);
  });

  it('renames a card, and ignores blank or unchanged titles', () => {
    const store = storeWith(item('a', { title: 'Old' }));
    expect(renameItem(store, 'a', 'Old')).toBe(false);
    expect(renameItem(store, 'a', ' ')).toBe(false);
    expect(renameItem(store, 'a', 'New')).toBe(true);
    expect(readPlan(store.doc).items['a']!.title).toBe('New');
    undo(store);
    expect(readPlan(store.doc).items['a']!.title).toBe('Old');
  });

  it('deletes a nested group, and one undo restores all of it exactly, even after a reload (Q17)', () => {
    const store = createPlanStore();
    loadPlan(store, {
      ...plan(
        item('epic', { sequence: 'a0', values: { [SYSTEM]: ['id'], [TIME]: ['q1'] } }),
        item('story', { parent: 'epic', values: { [SYSTEM]: ['id/sso', 'pay/ledger'] } }),
        item('task', { parent: 'story', sequence: 'a1', values: { [TIME]: ['q1/r2'] } }),
        item('other', { values: { [SYSTEM]: ['pay'] } }),
      ),
      dependencies: [
        { from: 'task', to: 'other' },
        { from: 'other', to: 'epic' },
      ],
    });
    store.undoManager.clear();
    const before = normalized(readPlan(store.doc));

    expect(deleteItems(store, ['epic'])).toBe(3);
    const after = readPlan(store.doc);
    expect(Object.keys(after.items)).toEqual(['other']);
    expect(after.dependencies).toEqual([]);

    undo(store);
    expect(normalized(readPlan(store.doc))).toEqual(before);
    const reloaded = createPlanStore();
    Y.applyUpdate(reloaded.doc, Y.encodeStateAsUpdate(store.doc));
    expect(normalized(readPlan(reloaded.doc))).toEqual(before);

    redo(store);
    expect(Object.keys(readPlan(store.doc).items)).toEqual(['other']);
    expect(store.undoManager.undoStack.length).toBe(1);
  });

  it('deletes nothing, and records nothing, for unknown IDs', () => {
    const store = storeWith(item('a'));
    expect(deleteItems(store, ['zz'])).toBe(0);
    expect(store.undoManager.canUndo()).toBe(false);
  });
});

describe('group commands', () => {
  it('groups cards under a new card with their shared values, as one undo step', () => {
    const store = storeWith(
      item('a', { sequence: 'a1', values: { [SYSTEM]: ['id/sso'], [TIME]: ['q1/r1'] } }),
      item('b', { sequence: 'a0', values: { [SYSTEM]: ['id/mfa'], [TIME]: ['q1'] } }),
    );
    const result = groupItems(store, ['a', 'b'])!;
    expect(result.created).toBe(true);
    const p = readPlan(store.doc);
    expect(p.items[result.group]).toMatchObject({
      title: NEW_GROUP_TITLE,
      parent: null,
      sequence: 'a0',
      values: { [SYSTEM]: ['id'], [TIME]: ['q1'] },
    });
    expect(p.items['a']!.parent).toBe(result.group);
    expect(p.items['b']!.parent).toBe(result.group);

    undo(store);
    const back = readPlan(store.doc);
    expect(back.items[result.group]).toBeUndefined();
    expect(back.items['a']!.parent).toBeNull();
  });

  it('adds cards to the one group in the selection', () => {
    const store = storeWith(item('epic'), item('story', { parent: 'epic' }), item('a'));
    expect(groupItems(store, ['a', 'epic'])).toEqual({ group: 'epic', created: false });
    expect(readPlan(store.doc).items['a']!.parent).toBe('epic');
  });

  it('ungroups: children move up, the group goes, its links move to the children, and undo restores it all', () => {
    const store = createPlanStore();
    loadPlan(store, {
      ...plan(
        item('epic', { values: { [SYSTEM]: ['id'] } }),
        item('a', { parent: 'epic', values: { [SYSTEM]: ['id/sso'] } }),
        item('b', { parent: 'epic' }),
        item('x'),
      ),
      dependencies: [{ from: 'x', to: 'epic' }],
    });
    store.undoManager.clear();
    const before = normalized(readPlan(store.doc));

    expect(ungroupItems(store, ['epic', 'x']).sort()).toEqual(['a', 'b']);
    const after = readPlan(store.doc);
    expect(after.items['epic']).toBeUndefined();
    expect(after.items['a']).toMatchObject({ parent: null, values: { [SYSTEM]: ['id/sso'] } });
    expect(normalized(after).dependencies).toEqual([
      { from: 'x', to: 'a' },
      { from: 'x', to: 'b' },
    ]);

    undo(store);
    expect(normalized(readPlan(store.doc))).toEqual(before);
    expect(ungroupItems(store, ['x'])).toEqual([]);
  });
});
