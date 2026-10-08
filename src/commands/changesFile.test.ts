import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { SYSTEM, TIME } from '../domain/model.ts';
import type { ViewSpec } from '../domain/view.ts';
import { readChangesFile, writeChangesFile } from '../store/changesFile.ts';
import { newRoom, toBase64Url, viewKeyOf } from '../store/keys.ts';
import { readPlan } from '../store/schema.ts';
import { changesFileFor, changesTarget, describeMerge, mergeChanges, type ChangesFile } from './changesFile.ts';
import { addPlan, findPlan, markDeleted, type SharedPlan } from './plans.ts';
import { joinFromLink, startSharingByFile } from './sharing.ts';
import { createPlanStore, dropCard, loadPlan, renameItem, undo, type PlanStore } from './store.ts';

const roadmap: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };

function aShare(): SharedPlan & { secret: string } {
  const { room, secret } = newRoom();
  const s = toBase64Url(secret);
  return { room, secret: s, viewKey: viewKeyOf(s) };
}

/** Ada's plan, shared by file, and Bo's empty copy from the link. */
function twoPeople() {
  const shared = aShare();
  const ada = createPlanStore();
  loadPlan(ada, plan(item('card', { title: 'Tax engine', values: { [TIME]: ['q1'], [SYSTEM]: ['pay'] } }), item('other', { title: 'Invoices' })));
  ada.undoManager.clear();
  const bo = createPlanStore();
  return { shared, ada, bo };
}

const send = (from: PlanStore, shared: SharedPlan): ChangesFile => {
  const file = readChangesFile(changesFileFor(from, shared));
  if (typeof file === 'string') throw new Error(file);
  return file;
};
const titles = (store: PlanStore) => Object.fromEntries(Object.values(readPlan(store.doc).items).map((i) => [i.id, i.title]));

describe('changes by file (ADR 0022)', () => {
  it('carries the whole board, sealed: no title, name or key in the file', () => {
    const { shared, ada } = twoPeople();
    const bytes = changesFileFor(ada, shared);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('PBCH')).toBe(true);
    expect(text).toContain(shared.room);
    expect(text).not.toContain('Tax engine');
    expect(text).not.toContain(shared.viewKey);
    expect(text).not.toContain(shared.secret);
  });

  it('merges both ways, in any order and any number of times, outside undo', () => {
    const { shared, ada, bo } = twoPeople();
    expect(mergeChanges(bo, shared, send(ada, shared))).toEqual({ kind: 'merged', cards: 2, properties: expect.any(Number) as number });
    expect(titles(bo)).toEqual({ card: 'Tax engine', other: 'Invoices' });
    // Undo doesn't reach a merge: it would take Ada's plan away from Bo.
    undo(bo);
    expect(titles(bo)).toEqual({ card: 'Tax engine', other: 'Invoices' });

    // Both change it apart, and send files that cross.
    renameItem(bo, 'card', 'Tax engine migration');
    dropCard(ada, roadmap, { itemId: 'other', x: null, y: null }, { x: 'q2', y: 'pay' });
    const fromBo = send(bo, shared);
    const fromAda = send(ada, shared);
    expect(mergeChanges(ada, shared, fromBo)).toMatchObject({ kind: 'merged', cards: 1 });
    expect(mergeChanges(bo, shared, fromAda)).toMatchObject({ kind: 'merged', cards: 1 });
    expect(readPlan(ada.doc)).toEqual(readPlan(bo.doc));
    // An old file, or the same one again, changes nothing.
    expect(mergeChanges(ada, shared, fromBo)).toEqual({ kind: 'merged', cards: 0, properties: 0 });
    expect(mergeChanges(bo, shared, fromAda)).toEqual({ kind: 'merged', cards: 0, properties: 0 });
  });

  it('refuses a file sealed with another key, and a plan only viewed', () => {
    const { shared, ada, bo } = twoPeople();
    const other = { ...aShare(), room: shared.room };
    const forged = readChangesFile(writeChangesFile(ada.doc, shared.room, other.viewKey));
    expect(mergeChanges(bo, shared, forged as ChangesFile)).toEqual({ kind: 'wrong-key' });
    expect(titles(bo)).toEqual({});
    bo.readOnly = true;
    expect(mergeChanges(bo, shared, send(ada, shared))).toEqual({ kind: 'read-only' });
  });

  it('says what isn’t a changes file, and what comes from a newer version', () => {
    expect(readChangesFile(new TextEncoder().encode('{"format":"planning-board"}'))).toBe('not-a-changes-file');
    expect(readChangesFile(new Uint8Array([0x50, 0x42, 0x43, 0x48, 2, 0]))).toBe('newer-version');
    expect(readChangesFile(new Uint8Array([0x50, 0x42, 0x43, 0x48, 1, 9]))).toBe('not-a-changes-file');
  });

  it('finds the plan a file is for, by its room', () => {
    const entry = addPlan('Billing revamp');
    const shared = startSharingByFile(entry.id);
    const doc = new Y.Doc();
    const bytes = writeChangesFile(doc, shared.room, shared.viewKey);
    expect(changesTarget(bytes)).toMatchObject({ kind: 'plan', entry: { id: entry.id } });
    expect(changesTarget(writeChangesFile(doc, aShare().room, shared.viewKey))).toEqual({ kind: 'no-plan' });
    markDeleted(entry.id);
    expect(changesTarget(bytes)).toEqual({ kind: 'no-plan' });
  });

  it('a file link opens a plan with no relay, and opening it again finds the same plan', () => {
    const shared = aShare();
    const link = { room: shared.room, secret: shared.secret, viewKey: shared.viewKey, file: true as const };
    const first = joinFromLink(link, 'http://relay.test:8787');
    expect(first.kind).toBe('new');
    expect(findPlan(first.entry.id)?.shared?.relay).toBeUndefined();
    expect(joinFromLink(link, null)).toMatchObject({ kind: 'existing', entry: { id: first.entry.id } });
  });

  it('describes a merge in words', () => {
    expect(describeMerge({ cards: 0, properties: 0 })).toBe('Merged: nothing new in that file.');
    expect(describeMerge({ cards: 1, properties: 0 })).toBe('Merged: 1 card changed.');
    expect(describeMerge({ cards: 4, properties: 2 })).toBe('Merged: 4 cards and 2 properties changed.');
  });
});
