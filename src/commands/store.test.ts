import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { SEQUENCE, SYSTEM, TIME } from '../domain/model.ts';
import { parsePlanJson } from '../domain/planJson.ts';
import type { ViewSpec } from '../domain/view.ts';
import sample from '../seed/sample-plan.json';
import { readPlan } from '../store/schema.ts';
import { createPlanStore, dropCard, loadPlan, redo, resetPlan, snapshotSource, undo } from './store.ts';

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
    expect(dropCard(store, timeBySystem, { itemId: 'a', x: null, y: null }, { kind: 'cell', x: 'q2', y: 'pay' })).toBe(
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
    dropCard(store, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { kind: 'cell', x: 'a0', y: 'pay' });
    dropCard(store, seqBySystem, { itemId: 'a', x: 'a0', y: 'pay' }, { kind: 'cell', x: 'a0', y: 'id' });
    undo(store);
    expect(readPlan(store.doc).items['a']!.values[SYSTEM]).toEqual(['pay']);
  });

  it('records nothing for a no-op drop', () => {
    const store = storeWith(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }));
    expect(dropCard(store, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { kind: 'cell', x: 'a0', y: 'id' })).toBe(
      false,
    );
    expect(store.undoManager.canUndo()).toBe(false);
  });

  it('clears a sequence position', () => {
    const store = storeWith(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }));
    dropCard(store, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { kind: 'clear', axis: 'x' });
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
    dropCard(a, seqBySystem, card, { kind: 'cell', x: 'a0', y: 'pay' }, 'add');
    dropCard(b, timeBySystem, { itemId: 'x', x: null, y: null }, { kind: 'cell', x: 'q1', y: 'id' });
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
    expect(readPlan(a.doc).items['x']!.values).toEqual({ [SYSTEM]: ['id', 'pay'], [TIME]: ['q1'] });
  });

  it('only notifies with a new snapshot when something changed', () => {
    const store = storeWith(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }));
    const source = snapshotSource(store);
    const first = source.getSnapshot();
    expect(source.getSnapshot()).toBe(first);
    let calls = 0;
    source.subscribe(() => calls++);
    dropCard(store, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { kind: 'cell', x: 'a0', y: 'pay' });
    expect(calls).toBeGreaterThan(0);
    expect(source.getSnapshot()).not.toBe(first);
    expect(source.getSnapshot().canUndo).toBe(true);
  });
});
