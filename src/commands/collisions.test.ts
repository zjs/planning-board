import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { classifyCollision } from '../domain/collisions.ts';
import { SYSTEM, TIME } from '../domain/model.ts';
import type { ViewSpec } from '../domain/view.ts';
import { RELAY_ORIGIN } from '../store/relay.ts';
import { readPlan } from '../store/schema.ts';
import { TAB_ORIGIN } from '../store/tabs.ts';
import { watchCollisions, type Collision } from './collisions.ts';
import { createPlanStore, dropCard, loadPlan, restoreCardState, undo, type PlanStore } from './store.ts';

const timeBySystem: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };

/** Two people's copies of one plan, and a way to pass changes between them. */
function twoPeople() {
  const ada = createPlanStore();
  loadPlan(ada, plan(item('card', { values: { [TIME]: ['q1'], [SYSTEM]: ['pay'] } }), item('other')));
  ada.undoManager.clear();
  const bo = createPlanStore();
  Y.applyUpdate(bo.doc, Y.encodeStateAsUpdate(ada.doc));
  const send = (from: PlanStore, to: PlanStore, origin: unknown = RELAY_ORIGIN) =>
    Y.applyUpdate(to.doc, Y.encodeStateAsUpdate(from.doc, Y.encodeStateVector(to.doc)), origin);
  return { ada, bo, send };
}

const values = (store: PlanStore, id: string) => readPlan(store.doc).items[id]!.values;

describe('two people moving one card (Q60)', () => {
  it('tells the person whose drop was replaced, and Put it back is a fresh change', () => {
    const { ada, bo, send } = twoPeople();
    const seen: Collision[] = [];
    let clock = 0;
    const watch = watchCollisions(ada, (c) => seen.push(c), () => clock);
    dropCard(ada, timeBySystem, { itemId: 'card', x: 'q1', y: 'pay' }, { x: 'q2', y: 'pay' });
    watch.remember(['card'], [TIME, SYSTEM]);
    send(ada, bo);
    // Bo moves it again, after Ada's drop reached him: the later drop wins.
    dropCard(bo, timeBySystem, { itemId: 'card', x: 'q2', y: 'pay' }, { x: 'q1', y: 'pay' });
    clock = 2000;
    send(bo, ada);
    expect(values(ada, 'card')[TIME]).toEqual(['q1']);
    expect(seen).toEqual([expect.objectContaining({ item: 'card', outcome: 'lost', property: TIME })]);
    // Undoing Ada's own drop can't bring back her value: it was replaced since.
    expect(restoreCardState(ada, 'card', seen[0]!.mine, seen[0]!.withSequence)).toBe(true);
    expect(values(ada, 'card')[TIME]).toEqual(['q2']);
    // Put it back is one undo step of its own.
    undo(ada);
    expect(values(ada, 'card')[TIME]).toEqual(['q1']);
    watch.stop();
  });

  it('says both drops landed on a property that holds several values', () => {
    const { ada, bo, send } = twoPeople();
    const seen: Collision[] = [];
    const watch = watchCollisions(ada, (c) => seen.push(c));
    // Both drag the card from Payments at the same moment: Ada to Identity, Bo to Identity's MFA. Each replaces
    // Payments with their own lane, so once both arrive the card is in two lanes.
    dropCard(ada, timeBySystem, { itemId: 'card', x: 'q1', y: 'pay' }, { x: 'q1', y: 'id' });
    watch.remember(['card'], [TIME, SYSTEM]);
    dropCard(bo, timeBySystem, { itemId: 'card', x: 'q1', y: 'pay' }, { x: 'q1', y: 'pay/ledger' });
    send(bo, ada);
    expect([...values(ada, 'card')[SYSTEM]!].sort()).toEqual(['id', 'pay/ledger']);
    expect(seen).toEqual([expect.objectContaining({ outcome: 'both', property: SYSTEM })]);
    // Keep only mine.
    restoreCardState(ada, 'card', seen[0]!.mine, seen[0]!.withSequence);
    expect(values(ada, 'card')[SYSTEM]).toEqual(['id']);
    watch.stop();
  });

  it('ignores changes to other cards, another tab of yours, and drops long past', () => {
    const { ada, bo, send } = twoPeople();
    const seen: Collision[] = [];
    let clock = 0;
    const watch = watchCollisions(ada, (c) => seen.push(c), () => clock);
    dropCard(ada, timeBySystem, { itemId: 'card', x: 'q1', y: 'pay' }, { x: 'q2', y: 'pay' });
    watch.remember(['card'], [TIME, SYSTEM]);
    send(ada, bo);
    dropCard(bo, timeBySystem, { itemId: 'other', x: null, y: null }, { x: 'q1', y: 'pay' });
    send(bo, ada);
    expect(seen).toEqual([]);
    // The same person in another tab.
    dropCard(bo, timeBySystem, { itemId: 'card', x: 'q2', y: 'pay' }, { x: 'q1', y: 'pay' });
    send(bo, ada, TAB_ORIGIN);
    expect(seen).toEqual([]);
    // Long after the drop, a later move is just a move.
    watch.remember(['card'], [TIME, SYSTEM]);
    clock = 60_000;
    dropCard(bo, timeBySystem, { itemId: 'card', x: 'q1', y: 'pay' }, { x: 'q2', y: 'pay' });
    send(bo, ada);
    expect(seen).toEqual([]);
    expect(watch.recentDrop('card')).toBeNull();
    watch.stop();
  });
});

describe('classifying a collision', () => {
  const multi = (p: string) => p === SYSTEM;
  it('compares what was written with what stands now', () => {
    const mine = { sequence: null, values: { [TIME]: ['q2'], [SYSTEM]: ['pay'] } };
    expect(classifyCollision(mine, mine, multi)).toBeNull();
    expect(classifyCollision(mine, { sequence: null, values: { [TIME]: ['q1'], [SYSTEM]: ['pay'] } }, multi)).toEqual({ outcome: 'lost', property: TIME });
    expect(classifyCollision(mine, { sequence: null, values: { [TIME]: ['q2'], [SYSTEM]: ['id', 'pay'] } }, multi)).toEqual({ outcome: 'both', property: SYSTEM });
    expect(classifyCollision(mine, { sequence: null, values: { [TIME]: ['q2'], [SYSTEM]: ['id'] } }, multi)).toEqual({ outcome: 'lost', property: SYSTEM });
    expect(classifyCollision({ sequence: 'a0', values: {} }, { sequence: 'a1', values: {} }, multi)).toEqual({ outcome: 'lost', property: 'sequence' });
    expect(classifyCollision(mine, null, multi)).toBeNull();
  });
});
