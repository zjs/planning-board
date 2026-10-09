import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { SIZE, SYSTEM, TIME } from '../domain/model.ts';
import type { ViewSpec } from '../domain/view.ts';
import { readChangesFile } from '../store/changesFile.ts';
import { newRoom, toBase64Url, viewKeyOf } from '../store/keys.ts';
import { RELAY_ORIGIN } from '../store/relay.ts';
import { changesFileFor, mergeChanges, type ChangesFile } from './changesFile.ts';
import { readClocks, readEntries, recordClock, recordShared, watchHistory, type Author } from './history.ts';
import { readPlan } from '../store/schema.ts';
import { createPlanStore, deleteItems, dropCard, editCardValues, loadPlan, redo, renameItem, restoreItems, undo, type PlanStore } from './store.ts';

const roadmap: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };
const ada: Author = { by: 'ada-id', name: 'Ada' };

function setup() {
  const store = createPlanStore();
  loadPlan(
    store,
    plan(
      item('epic', { title: 'Passwordless login' }),
      item('story', { title: 'Passkey enrolment', parent: 'epic' }),
      item('tax', { title: 'Tax engine', values: { [TIME]: ['q1'], [SYSTEM]: ['pay'] } }),
    ),
  );
  store.undoManager.clear();
  const history = new Y.Doc();
  let clock = 1_000;
  const stop = watchHistory(store, history, () => ada, () => clock);
  return { store, history, stop, tick: (ms: number) => (clock += ms) };
}

const kinds = (history: Y.Doc) =>
  readEntries(history)
    .sort((a, b) => a.at - b.at)
    .map((e) => [e.via ?? 'command', ...e.changes.map((c) => c.kind)].join(' '));

describe('recording history (ADR 0020)', () => {
  it('records each command as one entry, by this person, with the time', () => {
    const { store, history, tick } = setup();
    dropCard(store, roadmap, { itemId: 'tax', x: 'q1', y: 'pay' }, { x: 'q2', y: 'pay' });
    tick(5000);
    renameItem(store, 'tax', 'Tax engine migration');
    const entries = readEntries(history).sort((a, b) => a.at - b.at);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ by: 'ada-id', name: 'Ada', at: 1000, changes: [{ kind: 'values', item: 'tax', property: TIME, from: ['q1'], to: ['q2'] }] });
    expect(entries[1]).toMatchObject({ at: 6000, changes: [{ kind: 'renamed', from: 'Tax engine', to: 'Tax engine migration' }] });
  });

  it('records undo and redo as entries of their own, and a deleted group as one change that restore brings back', () => {
    const { store, history } = setup();
    deleteItems(store, ['epic']);
    undo(store);
    redo(store);
    expect(kinds(history)).toEqual(['command deleted', 'undo restored', 'redo deleted']);
    expect(readEntries(history).find((e) => e.via === 'undo')!.changes).toEqual([{ kind: 'restored', item: 'epic', title: 'Passwordless login', with: ['story'] }]);
  });

  it('restores a deleted group, with everything inside it, as one undo step that history records', () => {
    const { store, history } = setup();
    deleteItems(store, ['epic']);
    const deleted = readEntries(history)[0]!.changes[0]!;
    expect(deleted).toMatchObject({ kind: 'deleted', item: 'epic', with: ['story'] });
    expect(restoreItems(store, ['epic', 'story'])).toBe(2);
    expect(Object.keys(readPlan(store.doc).items).sort()).toEqual(['epic', 'story', 'tax']);
    expect(kinds(history)).toEqual(['command deleted', 'command restored']);
    expect(restoreItems(store, ['epic'])).toBe(0);
    undo(store);
    expect(readPlan(store.doc).items.epic).toBeUndefined();
  });

  it('never records changes that came from someone else, and stops when asked', () => {
    const { store, history, stop } = setup();
    const other = createPlanStore();
    Y.applyUpdate(other.doc, Y.encodeStateAsUpdate(store.doc));
    editCardValues(other, ['tax'], SIZE, { kind: 'set', values: ['m'] });
    Y.applyUpdate(store.doc, Y.encodeStateAsUpdate(other.doc, Y.encodeStateVector(store.doc)), RELAY_ORIGIN);
    expect(readEntries(history)).toEqual([]);
    // The next change of this person's is diffed against the board with theirs in it.
    renameItem(store, 'tax', 'Tax engine 2');
    expect(kinds(history)).toEqual(['command renamed']);
    stop();
    renameItem(store, 'tax', 'Tax engine 3');
    expect(readEntries(history)).toHaveLength(1);
  });

  it('opens a shared history with one "shared the plan" entry', () => {
    const history = new Y.Doc();
    recordShared(history, ada, 5);
    recordShared(history, ada, 6);
    expect(readEntries(history)).toEqual([expect.objectContaining({ event: 'shared', at: 5, changes: [] })]);
  });

  it('records a clock correction only when it’s more than a minute out, or moves', () => {
    const history = new Y.Doc();
    recordClock(history, 'ada-id', 10_020, 10_000);
    expect(readClocks(history).size).toBe(0);
    recordClock(history, 'ada-id', 10_000 + 3_600_000, 10_000);
    expect(readClocks(history).get('ada-id')).toBe(3_600_000);
    recordClock(history, 'ada-id', 10_000 + 3_610_000, 10_000);
    expect(readClocks(history).get('ada-id')).toBe(3_600_000);
  });
});

describe('history in changes files (ADR 0022)', () => {
  it('travels with the board, and merges with it', () => {
    const { store, history } = setup();
    renameItem(store, 'tax', 'Tax engine migration');
    const { room, secret } = newRoom();
    const s = toBase64Url(secret);
    const shared = { room, secret: s, viewKey: viewKeyOf(s) };
    const file = readChangesFile(changesFileFor(store, shared, history)) as ChangesFile;
    const bo: PlanStore = createPlanStore();
    const boHistory = new Y.Doc();
    expect(mergeChanges(bo, shared, file, boHistory)).toMatchObject({ kind: 'merged' });
    expect(readEntries(boHistory)).toEqual(readEntries(history));
    // A file from before history (sprint 12) merges the board alone.
    const old = readChangesFile(changesFileFor(store, shared)) as ChangesFile;
    expect(old.history).toHaveLength(0);
    expect(mergeChanges(createPlanStore(), shared, old, new Y.Doc())).toMatchObject({ kind: 'merged' });
  });
});
