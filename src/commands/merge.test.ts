// Two people editing one plan at once (ADR 0016). Sprint 9's merge harness
// (spikes/merge-scenarios) found where schema 1 merged into something nobody
// did. These are its scenarios as store tests, with schema 2's outcomes: each
// person has their own document, edits through the real commands, and then
// the two sync, as a relay or another tab would make them.

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { SIZE, SYSTEM, TIME, type Plan } from '../domain/model.ts';
import { topLevelItems } from '../domain/tree.ts';
import type { ViewSpec } from '../domain/view.ts';
import { readPlan } from '../store/schema.ts';
import {
  addDependency,
  addValue,
  createChild,
  createPlanStore,
  deleteItems,
  deleteValue,
  dropCard,
  editCardValues,
  loadPlan,
  moveToParent,
  renameItem,
  renameValue,
  reorderValue,
  undo,
  type PlanStore,
} from './store.ts';

const roadmap: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };

const base = () =>
  plan(
    item('epic', { title: 'Passwordless login', values: { [TIME]: ['q2'], [SYSTEM]: ['id'] } }),
    item('story', { title: 'Passkey enrolment', parent: 'epic', values: { [TIME]: ['q2'], [SYSTEM]: ['id/sso'] } }),
    item('invoices', { title: 'Invoice redesign', values: { [TIME]: ['q1'], [SYSTEM]: ['pay'] } }),
    item('tax', { title: 'Tax engine migration', values: { [TIME]: ['q1'], [SYSTEM]: ['pay'] } }),
    item('notes', { title: 'Release notes', values: { [TIME]: ['q2'] } }),
  );

/** Two people on the same plan. `aliceFirst` decides who has the lower Yjs client ID, which breaks ties. */
function pair(aliceFirst = true) {
  const seed = new Y.Doc();
  seed.clientID = 100;
  loadPlan(createPlanStore(seed), base());
  const start = Y.encodeStateAsUpdate(seed);
  const person = (clientID: number) => {
    const doc = new Y.Doc();
    doc.clientID = clientID;
    Y.applyUpdate(doc, start);
    return createPlanStore(doc);
  };
  return aliceFirst ? { alice: person(1), bob: person(2) } : { alice: person(2), bob: person(1) };
}

function sync({ alice, bob }: { alice: PlanStore; bob: PlanStore }) {
  const toBob = Y.encodeStateAsUpdate(alice.doc, Y.encodeStateVector(bob.doc));
  const toAlice = Y.encodeStateAsUpdate(bob.doc, Y.encodeStateVector(alice.doc));
  Y.applyUpdate(bob.doc, toBob);
  Y.applyUpdate(alice.doc, toAlice);
}

const p = (store: PlanStore): Plan => readPlan(store.doc);
const values = (store: PlanStore, id: string, property: string) => p(store).items[id]?.values[property] ?? [];

/** Both people see the same plan. */
function expectConverged(two: { alice: PlanStore; bob: PlanStore }) {
  expect(JSON.stringify(p(two.alice))).toEqual(JSON.stringify(p(two.bob)));
}

describe('two people at once (ADR 0016)', () => {
  for (const aliceFirst of [true, false]) {
    describe(aliceFirst ? 'Alice has the lower client ID' : 'Bob has the lower client ID', () => {
      it('L1: both drop one card in different quarters, and it holds exactly one', () => {
        const two = pair(aliceFirst);
        const card = { itemId: 'invoices', x: 'q1', y: 'pay' };
        dropCard(two.alice, roadmap, card, { x: 'q2', y: 'pay' });
        dropCard(two.bob, roadmap, card, { x: 'q1/r1', y: 'pay' });
        sync(two);
        expect(values(two.alice, 'invoices', TIME)).toHaveLength(1);
        expectConverged(two);
      });

      it('L18: both give an untagged card its first area, and both land, as with any later value', () => {
        const two = pair(aliceFirst);
        const card = { itemId: 'notes', x: 'q2', y: null };
        dropCard(two.alice, roadmap, card, { x: 'q2', y: 'pay' });
        dropCard(two.bob, roadmap, card, { x: 'q2', y: 'id' });
        sync(two);
        expect(values(two.alice, 'notes', SYSTEM)).toEqual(['id', 'pay']);
        expectConverged(two);
      });

      it('L18: both size an unsized card, and it holds exactly one size', () => {
        const two = pair(aliceFirst);
        editCardValues(two.alice, ['notes'], SIZE, { kind: 'set', values: ['s'] });
        editCardValues(two.bob, ['notes'], SIZE, { kind: 'set', values: ['l'] });
        sync(two);
        expect(values(two.alice, 'notes', SIZE)).toHaveLength(1);
        expectConverged(two);
      });

      it('L16: one renames an area while the other reorders it, and both stick', () => {
        const two = pair(aliceFirst);
        renameValue(two.alice, SYSTEM, 'pay', 'Payments');
        reorderValue(two.bob, SYSTEM, 'pay', 'up');
        sync(two);
        const system = p(two.alice).properties[SYSTEM]!;
        if (system.kind !== 'select') throw new Error('System is a select property');
        expect(system.values['pay']!.label).toBe('Payments');
        expect(system.values['pay']!.order < system.values['id']!.order).toBe(true);
        expectConverged(two);
      });
    });
  }

  it('L9: a card added inside a group someone deletes hides with it, and comes back with it', () => {
    const two = pair();
    deleteItems(two.alice, ['epic']);
    const added = createChild(two.bob, roadmap, 'epic', 'WebAuthn fallback')!;
    sync(two);
    expect(p(two.bob).items[added]).toBeUndefined();
    expect(p(two.bob).items['epic']).toBeUndefined();
    undo(two.alice);
    sync(two);
    expect(p(two.bob).items[added]?.parent).toBe('epic');
    expect(p(two.bob).items['story']?.parent).toBe('epic');
    expectConverged(two);
  });

  it('L11, O4: edits made inside a group someone deletes are kept, and come back with it', () => {
    const two = pair();
    deleteItems(two.alice, ['epic']);
    renameItem(two.bob, 'story', 'Passkey enrolment and sync');
    dropCard(two.bob, roadmap, { itemId: 'story', x: 'q2', y: 'id' }, { x: 'q1', y: 'id' });
    sync(two);
    expect(p(two.alice).items['story']).toBeUndefined();
    undo(two.alice);
    sync(two);
    expect(p(two.alice).items['story']?.title).toBe('Passkey enrolment and sync');
    expect(values(two.alice, 'story', TIME)).toEqual(['q1']);
    expectConverged(two);
  });

  it('L12: a link to a card someone deletes is hidden, and comes back with the card', () => {
    const two = pair();
    addDependency(two.alice, 'tax', 'invoices');
    deleteItems(two.bob, ['invoices']);
    sync(two);
    expect(p(two.alice).dependencies).toEqual([]);
    undo(two.bob);
    sync(two);
    expect(p(two.alice).dependencies).toEqual([{ from: 'tax', to: 'invoices' }]);
  });

  it('L14: a card dropped into a quarter someone deletes reads as undated, and undo brings both back', () => {
    const two = pair();
    deleteValue(two.alice, TIME, 'q2');
    dropCard(two.bob, roadmap, { itemId: 'invoices', x: 'q1', y: 'pay' }, { x: 'q2', y: 'pay' });
    sync(two);
    expect(values(two.alice, 'invoices', TIME)).toEqual([]);
    undo(two.alice);
    sync(two);
    expect(values(two.alice, 'invoices', TIME)).toEqual(['q2']);
    expectConverged(two);
  });

  it('U1: undo reverses only my own edit', () => {
    const two = pair();
    dropCard(two.alice, roadmap, { itemId: 'tax', x: 'q1', y: 'pay' }, { x: 'q2', y: 'pay' });
    renameItem(two.bob, 'tax', 'Tax engine v2');
    sync(two);
    undo(two.alice);
    sync(two);
    expect(values(two.alice, 'tax', TIME)).toEqual(['q1']);
    expect(p(two.alice).items['tax']!.title).toBe('Tax engine v2');
  });

  it("U2: undoing a move someone has since moved on doesn't override them", () => {
    const two = pair();
    dropCard(two.alice, roadmap, { itemId: 'invoices', x: 'q1', y: 'pay' }, { x: 'q2', y: 'pay' });
    sync(two);
    dropCard(two.bob, roadmap, { itemId: 'invoices', x: 'q2', y: 'pay' }, { x: 'q1/r1', y: 'pay' });
    sync(two);
    undo(two.alice);
    sync(two);
    expect(values(two.alice, 'invoices', TIME)).toEqual(['q1/r1']);
    expectConverged(two);
  });

  it('L2: two moves of one copy to different areas both land (set semantics, accepted)', () => {
    const two = pair();
    const card = { itemId: 'invoices', x: 'q1', y: 'pay' };
    dropCard(two.alice, roadmap, card, { x: 'q1', y: 'id' });
    dropCard(two.bob, roadmap, card, { x: 'q1', y: null });
    addValue(two.bob, SYSTEM, 'Platform');
    sync(two);
    expect(values(two.alice, 'invoices', SYSTEM)).toEqual(['id']);
    expectConverged(two);
  });

  it('L8: nesting two cards inside each other leaves a loop that readers surface at the top level (repair: ADR 0004, sprint 11)', () => {
    const two = pair();
    moveToParent(two.alice, ['tax'], 'invoices');
    moveToParent(two.bob, ['invoices'], 'tax');
    sync(two);
    const top = topLevelItems(p(two.alice));
    expect(top).toContain('tax');
    expect(top).toContain('invoices');
    expectConverged(two);
  });

  it('random edits on both sides converge, and a single-valued property never holds two values', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let run = 0; run < 10; run++) {
      const two = pair();
      for (let step = 0; step < 60; step++) {
        for (const store of [two.alice, two.bob]) {
          const ids = Object.keys(p(store).items).sort();
          if (ids.length === 0) continue;
          const id = ids[Math.floor(random() * ids.length)]!;
          const roll = random();
          if (roll < 0.4) {
            const quarter = ['q1', 'q2', 'q1/r1', 'q1/r2'][Math.floor(random() * 4)]!;
            editCardValues(store, [id], TIME, { kind: 'set', values: [quarter] });
          } else if (roll < 0.6) {
            editCardValues(store, [id], SYSTEM, { kind: random() < 0.5 ? 'add' : 'remove', value: random() < 0.5 ? 'pay' : 'id/sso' });
          } else if (roll < 0.75) {
            editCardValues(store, [id], SIZE, { kind: 'set', values: [random() < 0.5 ? 's' : 'm'] });
          } else if (roll < 0.85) {
            moveToParent(store, [id], random() < 0.5 ? null : ids[Math.floor(random() * ids.length)]!);
          } else if (roll < 0.95) {
            renameItem(store, id, `card ${run}.${step}`);
          } else {
            deleteItems(store, [id]);
          }
        }
        if (random() < 0.1) sync(two);
      }
      sync(two);
      expectConverged(two);
      for (const card of Object.values(p(two.alice).items)) {
        expect((card.values[TIME] ?? []).length).toBeLessThanOrEqual(1);
        expect((card.values[SIZE] ?? []).length).toBeLessThanOrEqual(1);
      }
    }
  });
});
