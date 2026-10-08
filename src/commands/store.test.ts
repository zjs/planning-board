import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { JIRA_EXPORT } from '../domain/__fixtures__/jira-export.ts';
import { blankPlan } from '../domain/builtins.ts';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { parseCsv } from '../domain/csv.ts';
import { columnGroups, defaultChoices, detectMapping, draftFromCsv } from '../domain/csvImport.ts';
import { LEVEL, SEQUENCE, SIZE, SYSTEM, TIME } from '../domain/model.ts';
import { parsePlanJson, planFileText, readPlanFile } from '../domain/planJson.ts';
import type { ViewSpec } from '../domain/view.ts';
import sample from '../seed/sample-plan.json';
import { isEmpty, readPlan } from '../store/schema.ts';
import {
  addDependency,
  addRelated,
  addValue,
  createChild,
  createItem,
  createProperty,
  deleteProperty,
  deleteValue,
  moveValue,
  renameLevel,
  renameProperty,
  removeDependencies,
  removeDependency,
  removeRelated,
  renameValue,
  reorderValue,
  createPlanStore,
  deleteItems,
  dropCard,
  dropCards,
  editCardValues,
  ensureBuiltIns,
  setDescription,
  groupItems,
  importPlan,
  loadPlan,
  moveToParent,
  NEW_GROUP_TITLE,
  ungroupItems,
  redo,
  renameItem,
  resetPlan,
  snapshotSource,
  undo,
  namePlan,
  planName,
  startPlan,
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

  it('starts a blank plan (Q51): a board with properties and no cards, and one undo brings the old board back', () => {
    const store = storeWith(item('a'));
    loadPlan(store, blankPlan());
    expect(readPlan(store.doc)).toEqual(blankPlan());
    expect(isEmpty(store.doc)).toBe(false);
    expect(ensureBuiltIns(store)).toBe(false);
    const id = createItem(store, seqBySystem, { x: null, y: null }, 'First idea');
    expect(readPlan(store.doc).items[id!]!.title).toBe('First idea');
    undo(store);
    undo(store);
    expect(Object.keys(readPlan(store.doc).items)).toEqual(['a']);
  });

  it('ranks each new card after the last, so ideas typed into one column keep their order (Q46)', () => {
    const store = storeWith();
    const spot = { x: null, y: null };
    const first = createItem(store, seqBySystem, spot, 'Zebra crossing')!;
    const second = createItem(store, seqBySystem, spot, 'Apple pie')!;
    const child = createChild(store, seqBySystem, first, 'Inside')!;
    const items = readPlan(store.doc).items;
    expect(items[first]!.rank! < items[second]!.rank!).toBe(true);
    expect(items[second]!.rank! < items[child]!.rank!).toBe(true);
    // A new group is made now too, so it ranks last. (First has a child, so it would be joined, not wrapped.)
    const third = createItem(store, seqBySystem, spot, 'Third')!;
    const { group, created } = groupItems(store, [second, third])!;
    expect(created).toBe(true);
    expect(readPlan(store.doc).items[group]!.rank! > readPlan(store.doc).items[third]!.rank!).toBe(true);
  });

  it('drops several cards in one undo step (Q48)', () => {
    const store = storeWith(
      item('a', { values: { [SYSTEM]: ['id'], [TIME]: ['q1'] } }),
      item('b', { values: { [SYSTEM]: ['pay'] } }),
    );
    expect(dropCards(store, timeBySystem, { itemId: 'a', x: 'q1', y: 'id' }, ['a', 'b'], { x: 'q2', y: 'id' })).toBe(2);
    const items = readPlan(store.doc).items;
    expect(items['a']!.values).toEqual({ [SYSTEM]: ['id'], [TIME]: ['q2'] });
    expect(items['b']!.values).toEqual({ [SYSTEM]: ['id', 'pay'], [TIME]: ['q2'] });
    undo(store);
    expect(readPlan(store.doc).items['b']!.values).toEqual({ [SYSTEM]: ['pay'] });
    expect(readPlan(store.doc).items['a']!.values[TIME]).toEqual(['q1']);
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

describe('moveToParent', () => {
  it('moves a card out of its group to another level, keeping its values, as one undo step', () => {
    const store = storeWith(
      item('epic'),
      item('story', { parent: 'epic' }),
      item('task', { parent: 'story', values: { [SYSTEM]: ['id'] } }),
    );
    expect(moveToParent(store, ['task'], 'epic')).toEqual(['task']);
    expect(readPlan(store.doc).items['task']).toMatchObject({ parent: 'epic', values: { [SYSTEM]: ['id'] } });
    expect(moveToParent(store, ['task'], null)).toEqual(['task']);
    undo(store);
    expect(readPlan(store.doc).items['task']!.parent).toBe('epic');
  });

  it('skips moves that change nothing or would create a cycle', () => {
    const store = storeWith(item('epic'), item('story', { parent: 'epic' }));
    expect(moveToParent(store, ['story'], 'epic')).toEqual([]);
    expect(moveToParent(store, ['epic'], 'story')).toEqual([]);
    expect(moveToParent(store, ['epic'], 'gone')).toEqual([]);
    expect(store.undoManager.canUndo()).toBe(false);
  });
});

describe('createChild', () => {
  it('adds a card inside another, with its values on the view axes only, as one undo step', () => {
    const store = storeWith(
      item('epic', { sequence: 'a3', values: { [SYSTEM]: ['id', 'pay'], [TIME]: ['q2'], [SIZE]: ['l'] } }),
    );
    const id = createChild(store, seqBySystem, 'epic', '  First story ')!;
    expect(readPlan(store.doc).items[id]).toMatchObject({
      title: 'First story',
      parent: 'epic',
      sequence: 'a3',
      values: { [SYSTEM]: ['id', 'pay'] },
    });
    const other = createChild(store, timeBySystem, 'epic', 'Second')!;
    expect(readPlan(store.doc).items[other]).toMatchObject({ sequence: null, values: { [SYSTEM]: ['id', 'pay'], [TIME]: ['q2'] } });
    undo(store);
    expect(readPlan(store.doc).items[other]).toBeUndefined();
  });

  it('needs a title and a parent that exists', () => {
    const store = storeWith(item('epic'));
    expect(createChild(store, seqBySystem, 'epic', '  ')).toBeNull();
    expect(createChild(store, seqBySystem, 'gone', 'Story')).toBeNull();
    expect(store.undoManager.canUndo()).toBe(false);
  });
});

describe('plan files', () => {
  it('a saved file opens to the same plan, in one undo step, after a round trip through storage', () => {
    const parsed = parsePlanJson(sample);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const store = createPlanStore();
    loadPlan(store, parsed.plan);
    const epic = Object.keys(parsed.plan.items)[0]!;
    renameItem(store, epic, 'Renamed before saving');
    const saved = planFileText(readPlan(store.doc));

    resetPlan(store);
    const opened = readPlanFile(saved);
    if (!opened.ok) throw new Error(opened.summary);
    loadPlan(store, opened.plan);
    expect(planFileText(readPlan(store.doc))).toBe(saved);

    // Reload: the stored document gives the same file.
    const reloaded = new Y.Doc();
    Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(store.doc));
    expect(planFileText(readPlan(reloaded))).toBe(saved);

    undo(store);
    expect(readPlan(store.doc).items).toEqual({});
  });

  it('keeps Jira keys in the document', () => {
    const store = createPlanStore();
    loadPlan(store, plan(item('a', { externalKey: 'PAY-7' }), item('b')));
    const items = readPlan(store.doc).items;
    expect(items['a']!.externalKey).toBe('PAY-7');
    expect('externalKey' in items['b']!).toBe(false);
  });
});

describe('custom properties', () => {
  it('creates a flat property that is empty, and one undo removes it', () => {
    const store = storeWith(item('a'));
    const id = createProperty(store, '  Team ', false)!;
    expect(readPlan(store.doc).properties[id]).toEqual({
      kind: 'select',
      id,
      name: 'Team',
      levels: ['Team'],
      multi: false,
      values: {},
    });
    undo(store);
    expect(readPlan(store.doc).properties[id]).toBeUndefined();
  });

  it('refuses a blank or taken name, in any case', () => {
    const store = storeWith();
    expect(createProperty(store, ' ', true)).toBeNull();
    expect(createProperty(store, 'system', true)).toBeNull();
    const id = createProperty(store, 'Team', true)!;
    expect(renameProperty(store, id, 'SIZE')).toBe(false);
    expect(renameProperty(store, id, 'Team')).toBe(false);
  });

  it('renames a property, and a flat one’s level with it', () => {
    const store = storeWith();
    const id = createProperty(store, 'Team', false)!;
    expect(renameProperty(store, id, 'Squad')).toBe(true);
    expect(readPlan(store.doc).properties[id]).toMatchObject({ name: 'Squad', levels: ['Squad'] });
    renameProperty(store, SYSTEM, 'Architecture');
    expect(readPlan(store.doc).properties[SYSTEM]).toMatchObject({ name: 'Architecture', levels: ['Area', 'Component'] });
  });

  it('adds values at the end of their siblings, under a parent if given', () => {
    const store = storeWith();
    const team = createProperty(store, 'Team', false)!;
    const a = addValue(store, team, 'Platform')!;
    const b = addValue(store, team, 'Growth')!;
    expect(addValue(store, team, 'growth')).toBeNull();
    const values = (readPlan(store.doc).properties[team] as { values: Record<string, { order: string }> }).values;
    expect(values[a]!.order < values[b]!.order).toBe(true);
    const sso2 = addValue(store, SYSTEM, 'SSO v2', 'id')!;
    expect(readPlan(store.doc).properties[SYSTEM]).toMatchObject({ values: { [sso2]: { label: 'SSO v2', parent: 'id' } } });
    expect(addValue(store, SYSTEM, 'Orphan', 'no-such-area')).toBeNull();
  });

  it('fills in by dragging: a drop on a custom axis writes its value', () => {
    const store = storeWith(item('a'));
    const team = createProperty(store, 'Team', false)!;
    const platform = addValue(store, team, 'Platform')!;
    const view: ViewSpec = { x: { property: team, level: 0 }, y: { property: SYSTEM, level: 0 } };
    dropCard(store, view, { itemId: 'a', x: null, y: null }, { x: platform, y: 'id' });
    expect(readPlan(store.doc).items['a']!.values[team]).toEqual([platform]);
  });

  it('deletes a custom property and its values on every card, in one undo step', () => {
    const store = storeWith(item('a'), item('b'));
    const team = createProperty(store, 'Team', true)!;
    const platform = addValue(store, team, 'Platform')!;
    const view: ViewSpec = { x: { property: team, level: 0 }, y: { property: SYSTEM, level: 0 } };
    dropCard(store, view, { itemId: 'a', x: null, y: null }, { x: platform, y: 'id' });
    expect(deleteProperty(store, team)).toBe(1);
    const after = readPlan(store.doc);
    expect(after.properties[team]).toBeUndefined();
    expect(after.items['a']!.values[team]).toBeUndefined();
    undo(store);
    expect(readPlan(store.doc).items['a']!.values[team]).toEqual([platform]);
  });

  it('never deletes a built-in property', () => {
    const store = storeWith(item('a'));
    for (const id of [SYSTEM, TIME, SEQUENCE, 'size']) expect(deleteProperty(store, id)).toBeNull();
    expect(Object.keys(readPlan(store.doc).properties).sort()).toEqual(['sequence', 'size', 'system', 'time']);
  });
});

describe('editing values (requirement 27)', () => {
  const values = (store: ReturnType<typeof storeWith>, property: string) => {
    const p = readPlan(store.doc).properties[property];
    return p?.kind === 'select' ? p.values : {};
  };

  it('renames a value; its cards keep it, and undo restores the label', () => {
    const store = storeWith(item('a', { values: { [SYSTEM]: ['id/sso'] } }));
    expect(renameValue(store, SYSTEM, 'id/sso', 'Single sign-on')).toBe(true);
    expect(values(store, SYSTEM)['id/sso']!.label).toBe('Single sign-on');
    expect(readPlan(store.doc).items['a']!.values[SYSTEM]).toEqual(['id/sso']);
    expect(renameValue(store, SYSTEM, 'id/sso', 'id/mfa')).toBe(false);
    undo(store);
    expect(values(store, SYSTEM)['id/sso']!.label).toBe('ID/SSO');
  });

  it('reorders values among their siblings', () => {
    const store = storeWith();
    expect(reorderValue(store, 'size', 'l', 'up')).toBe(true);
    const order = Object.values(values(store, 'size'))
      .sort((a, b) => (a.order < b.order ? -1 : 1))
      .map((n) => n.id);
    expect(order).toEqual(['s', 'l', 'm']);
    expect(reorderValue(store, 'size', 's', 'up')).toBe(false);
  });

  it('moves a component to another area with its cards, in one undo step', () => {
    const store = storeWith(item('a', { values: { [SYSTEM]: ['id/sso', 'pay'] } }));
    expect(moveValue(store, SYSTEM, 'id/sso', 'pay')).toBe(true);
    expect(values(store, SYSTEM)['id/sso']!.parent).toBe('pay');
    // It held Payments and SSO; SSO is now inside Payments, so only SSO is kept.
    expect(readPlan(store.doc).items['a']!.values[SYSTEM]).toEqual(['id/sso']);
    undo(store);
    expect(values(store, SYSTEM)['id/sso']!.parent).toBe('id');
    expect([...readPlan(store.doc).items['a']!.values[SYSTEM]!].sort()).toEqual(['id/sso', 'pay']);
  });

  it('deletes a release and moves its cards to the quarter (Q4), in one undo step', () => {
    const store = storeWith(
      item('a', { values: { [TIME]: ['q1/r1'] } }),
      item('b', { values: { [TIME]: ['q1/r1'] } }),
      item('c', { values: { [TIME]: ['q2'] } }),
    );
    expect(deleteValue(store, TIME, 'q1/r1')).toEqual({ cards: 2, parent: 'q1' });
    const after = readPlan(store.doc);
    expect(values(store, TIME)['q1/r1']).toBeUndefined();
    expect(after.items['a']!.values[TIME]).toEqual(['q1']);
    expect(after.items['c']!.values[TIME]).toEqual(['q2']);
    undo(store);
    expect(values(store, TIME)['q1/r1']).toBeDefined();
    expect(readPlan(store.doc).items['a']!.values[TIME]).toEqual(['q1/r1']);
  });

  it('deleting an area deletes its components, and its cards go to the holding lane', () => {
    const store = storeWith(item('a', { values: { [SYSTEM]: ['id/sso'] } }));
    expect(deleteValue(store, SYSTEM, 'id')).toEqual({ cards: 1, parent: null });
    expect(Object.keys(values(store, SYSTEM)).sort()).toEqual(['pay', 'pay/ledger']);
    // No values and an empty list mean the same (model.ts); schema 2 stores neither.
    expect(readPlan(store.doc).items['a']!.values[SYSTEM] ?? []).toEqual([]);
  });

  it('renames a level', () => {
    const store = storeWith();
    expect(renameLevel(store, SYSTEM, 1, 'Service')).toBe(true);
    expect(readPlan(store.doc).properties[SYSTEM]).toMatchObject({ levels: ['Area', 'Service'] });
    expect(renameLevel(store, SYSTEM, 1, 'area')).toBe(false);
    expect(renameLevel(store, SYSTEM, 5, 'Deep')).toBe(false);
  });
});

describe('importPlan', () => {
  it('replaces the board with the imported cards, keeping Jira keys, in one undo step', () => {
    const store = storeWith(item('a'));
    const table = parseCsv(JIRA_EXPORT);
    const draft = draftFromCsv(table, detectMapping(columnGroups(table.header)));
    const result = importPlan(store, draft, defaultChoices(draft), []);
    const after = readPlan(store.doc);
    expect(Object.keys(after.items)).toHaveLength(result.counts.cards);
    expect(Object.values(after.items).map((i) => i.externalKey).sort()).toEqual(['PAY-1', 'PAY-2', 'PAY-3', 'PAY-4', 'PAY-6']);
    expect(after.dependencies).toHaveLength(1);
    undo(store);
    expect(Object.keys(readPlan(store.doc).items)).toEqual(['a']);
  });
});

describe('dependencies', () => {
  it('links two cards in one undo step, and removing undoes too', () => {
    const store = storeWith(item('a'), item('b'));
    expect(addDependency(store, 'a', 'b')).toBeNull();
    expect(readPlan(store.doc).dependencies).toEqual([{ from: 'a', to: 'b' }]);
    expect(addDependency(store, 'a', 'b')).toBe('Those cards are already linked.');
    expect(removeDependency(store, 'a', 'b')).toBe(true);
    expect(readPlan(store.doc).dependencies).toEqual([]);
    expect(removeDependency(store, 'a', 'b')).toBe(false);
    undo(store);
    expect(readPlan(store.doc).dependencies).toEqual([{ from: 'a', to: 'b' }]);
    undo(store);
    expect(readPlan(store.doc).dependencies).toEqual([]);
  });

  it('allows a loop (Q37)', () => {
    const store = storeWith(item('a'), item('b'));
    addDependency(store, 'a', 'b');
    expect(addDependency(store, 'b', 'a')).toBeNull();
    expect(readPlan(store.doc).dependencies).toHaveLength(2);
  });

  it('survives a reload', () => {
    const store = storeWith(item('a'), item('b'));
    addDependency(store, 'a', 'b');
    const reloaded = new Y.Doc();
    Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(store.doc));
    expect(readPlan(reloaded).dependencies).toEqual([{ from: 'a', to: 'b' }]);
  });
});

describe('removeDependencies', () => {
  it('removes every link a line stands for in one undo step', () => {
    const store = storeWith(item('a'), item('b'), item('c'));
    addDependency(store, 'a', 'b');
    addDependency(store, 'a', 'c');
    expect(removeDependencies(store, [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'c', to: 'a' }])).toBe(2);
    expect(readPlan(store.doc).dependencies).toEqual([]);
    undo(store);
    expect(readPlan(store.doc).dependencies).toHaveLength(2);
  });
});

describe('related links (Q44)', () => {
  it('relates two cards once, in either order, in one undo step; removing undoes too', () => {
    const store = storeWith(item('a'), item('b'));
    expect(addRelated(store, 'b', 'a')).toBeNull();
    expect(readPlan(store.doc).related).toEqual([{ a: 'a', b: 'b' }]);
    expect(addRelated(store, 'a', 'b')).toBe('Those cards are already related.');
    expect(addRelated(store, 'a', 'a')).toBe("A card can't be related to itself.");
    expect(removeRelated(store, 'b', 'a')).toBe(true);
    expect(readPlan(store.doc).related).toEqual([]);
    expect(removeRelated(store, 'a', 'b')).toBe(false);
    undo(store);
    expect(readPlan(store.doc).related).toEqual([{ a: 'a', b: 'b' }]);
  });

  it('never adds an order: no dependency appears, and the plan file keeps the pair', () => {
    const store = storeWith(item('a'), item('b'));
    addRelated(store, 'a', 'b');
    expect(readPlan(store.doc).dependencies).toEqual([]);
    const reread = readPlanFile(planFileText(readPlan(store.doc)));
    expect(reread.ok && reread.plan.related).toEqual([{ a: 'a', b: 'b' }]);
  });

  it('goes with a deleted card, and one undo brings it back', () => {
    const store = storeWith(item('a'), item('b'), item('c'));
    addRelated(store, 'a', 'b');
    addRelated(store, 'b', 'c');
    deleteItems(store, ['a']);
    expect(readPlan(store.doc).related).toEqual([{ a: 'b', b: 'c' }]);
    undo(store);
    expect(readPlan(store.doc).related).toHaveLength(2);
  });

  it('moves to each card inside a group that is ungrouped, as dependencies do (Q21)', () => {
    const store = storeWith(item('g'), item('x', { parent: 'g' }), item('y', { parent: 'g' }), item('other'));
    addRelated(store, 'g', 'other');
    ungroupItems(store, ['g']);
    expect(readPlan(store.doc).related).toEqual([
      { a: 'other', b: 'x' },
      { a: 'other', b: 'y' },
    ]);
    undo(store);
    expect(readPlan(store.doc).related).toEqual([{ a: 'g', b: 'other' }]);
  });
});

describe('inspector edits (Q35)', () => {
  it('sets a value on several cards as one undo step, and skips a change that changes nothing', () => {
    const store = createPlanStore();
    loadPlan(store, plan(item('a', { values: { [SIZE]: ['s'] } }), item('b'), item('c', { values: { [SIZE]: ['m'] } })));
    expect(editCardValues(store, ['a', 'b', 'c'], SIZE, { kind: 'set', values: ['m'] })).toBe(2);
    const sizes = () => Object.values(readPlan(store.doc).items).map((i) => i.values[SIZE] ?? []);
    expect(sizes()).toEqual([['m'], ['m'], ['m']]);
    const steps = store.undoManager.undoStack.length;
    expect(editCardValues(store, ['a', 'b'], SIZE, { kind: 'set', values: ['m'] })).toBe(0);
    expect(store.undoManager.undoStack.length).toBe(steps);
    undo(store);
    expect(sizes()).toEqual([['s'], [], ['m']]);
  });

  it('adds and removes a component across a mixed selection', () => {
    const store = createPlanStore();
    loadPlan(store, plan(item('a', { values: { [SYSTEM]: ['id'] } }), item('b', { values: { [SYSTEM]: ['pay'] } })));
    editCardValues(store, ['a', 'b'], SYSTEM, { kind: 'add', value: 'id/sso' });
    expect(readPlan(store.doc).items['a']!.values[SYSTEM]).toEqual(['id/sso']);
    expect([...readPlan(store.doc).items['b']!.values[SYSTEM]!].sort()).toEqual(['id/sso', 'pay']);
    editCardValues(store, ['a', 'b'], SYSTEM, { kind: 'remove', value: 'pay' });
    expect(readPlan(store.doc).items['b']!.values[SYSTEM]).toEqual(['id/sso']);
  });

  it('edits a description, undoably, ignoring trailing whitespace', () => {
    const store = createPlanStore();
    loadPlan(store, plan(item('a', { description: 'Old' })));
    expect(setDescription(store, 'a', 'Old  \n')).toBe(false);
    expect(setDescription(store, 'a', 'New\nsecond line\n')).toBe(true);
    expect(readPlan(store.doc).items['a']!.description).toBe('New\nsecond line');
    undo(store);
    expect(readPlan(store.doc).items['a']!.description).toBe('Old');
    expect(setDescription(store, 'missing', 'x')).toBe(false);
  });
});

describe('ensureBuiltIns', () => {
  it('adds Level to a board saved before it existed, outside the undo history; an empty board stays empty', () => {
    const store = createPlanStore();
    expect(ensureBuiltIns(store)).toBe(false);
    loadPlan(store, plan(item('a')));
    store.undoManager.clear();
    expect(ensureBuiltIns(store)).toBe(true);
    expect(readPlan(store.doc).properties[LEVEL]).toMatchObject({ name: 'Level' });
    expect(store.undoManager.canUndo()).toBe(false);
    expect(ensureBuiltIns(store)).toBe(false);
  });
});

describe('a read-only plan (sprint 11)', () => {
  it('refuses every kind of write, and still takes changes from elsewhere', () => {
    const store = createPlanStore();
    loadPlan(store, plan(item('a', { title: 'Alpha', values: { [TIME]: ['q1'], [SYSTEM]: ['pay'] } }), item('b', { title: 'Beta' })));
    const before = JSON.stringify(readPlan(store.doc));
    store.readOnly = true;
    createItem(store, timeBySystem, { x: 'q1', y: 'pay' }, 'Gamma');
    dropCard(store, timeBySystem, { itemId: 'a', x: 'q1', y: 'pay' }, { x: 'q2', y: 'pay' });
    renameItem(store, 'a', 'Renamed');
    deleteItems(store, ['b']);
    moveToParent(store, ['b'], 'a');
    loadPlan(store, blankPlan());
    resetPlan(store);
    startPlan(store, blankPlan());
    undo(store);
    redo(store);
    namePlan(store, 'Taken over');
    expect(JSON.stringify(readPlan(store.doc))).toBe(before);
    expect(planName(store)).toBeNull();

    // Someone with the edit link changes it, and the change shows here.
    const writer = createPlanStore();
    Y.applyUpdate(writer.doc, Y.encodeStateAsUpdate(store.doc));
    renameItem(writer, 'a', 'Alpha, renamed elsewhere');
    Y.applyUpdate(store.doc, Y.encodeStateAsUpdate(writer.doc, Y.encodeStateVector(store.doc)));
    expect(readPlan(store.doc).items['a']?.title).toBe('Alpha, renamed elsewhere');
  });
});
