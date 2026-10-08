// Many random edits on each side, then one sync: do both boards converge,
// and how often does the merged document hold something a reader has to
// work around?

import * as Y from 'yjs';
import {
  addDependency,
  createItem,
  deleteItems,
  dropCard,
  editCardValues,
  moveToParent,
  renameItem,
} from '../../src/commands/store.ts';
import type { PlanStore } from '../../src/commands/store.ts';
import { SIZE, TIME } from '../../src/domain/model.ts';
import { topLevelItems } from '../../src/domain/tree.ts';
import { allCopies, layoutView } from '../../src/domain/view.ts';
import { basePlan, canonical, pair, plan, roadmap, sync } from './harness.ts';

/** A small seeded random number generator (mulberry32), so every run is the same. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomEdit(store: PlanStore, who: string, step: number, random: () => number): void {
  const p = plan(store);
  const ids = Object.values(p.items)
    .sort((a, b) => (a.title < b.title ? -1 : 1))
    .map((i) => i.id);
  if (ids.length === 0) return;
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)]!;
  const id = pick(ids);
  const roll = random();
  if (roll < 0.5) {
    // Every group expanded, so cards inside groups get dragged too.
    const view = { ...roadmap, expanded: ids };
    const layout = layoutView(p, view);
    const copies = allCopies(layout).filter((ref) => !ref.via && !ref.open);
    if (copies.length === 0) return;
    const copy = pick(copies);
    const x = pick(layout.columns).key;
    const y = pick(layout.rows).key;
    dropCard(store, view, copy, { x, y }, random() < 0.2 ? 'add' : 'replace');
  } else if (roll < 0.65) {
    renameItem(store, id, `${p.items[id]!.title.split(' ·')[0]} · ${who}${step}`);
  } else if (roll < 0.72) {
    moveToParent(store, [id], random() < 0.5 ? null : pick(ids));
  } else if (roll < 0.82) {
    createItem(store, roadmap, { x: pick(['q1', 'q2', 'q3']), y: pick(['billing', 'identity', 'platform']) }, `${who} card ${step}`);
  } else if (roll < 0.9) {
    addDependency(store, id, pick(ids));
  } else if (roll < 0.98) {
    editCardValues(store, [id], SIZE, { kind: 'set', values: [pick(['s', 'm', 'l'])] });
  } else {
    deleteItems(store, [id]);
  }
}

export interface FuzzResult {
  seeds: number;
  editsEach: number;
  converged: number;
  twoQuarters: number;
  twoSizes: number;
  orphans: number;
  cycles: number;
  danglingLinks: number;
  cards: number;
}

/** Cards whose raw document holds more than one value for a single-valued property. Schema 2: one key can hold only one. */
export function multiValued(store: PlanStore, property: string): number {
  let n = 0;
  store.doc.getMap<Y.Map<unknown>>('items').forEach((item) => {
    const keys = [...item.keys()].filter((k) => k === `v\u001f${property}` || k.startsWith(`v\u001f${property}\u001f`));
    if (keys.length > 1) n++;
  });
  return n;
}

export function fuzz(seeds: number, editsEach: number): FuzzResult {
  const result: FuzzResult = { seeds, editsEach, converged: 0, twoQuarters: 0, twoSizes: 0, orphans: 0, cycles: 0, danglingLinks: 0, cards: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    const random = rng(seed);
    const both = pair(basePlan(), true);
    for (let step = 0; step < editsEach; step++) {
      randomEdit(both.alice, 'A', step, random);
      randomEdit(both.bob, 'B', step, random);
    }
    sync(both);
    const p = plan(both.alice);
    if (canonical(p) === canonical(plan(both.bob))) result.converged++;
    result.twoQuarters += multiValued(both.alice, TIME);
    result.twoSizes += multiValued(both.alice, SIZE);
    const top = new Set(topLevelItems(p));
    for (const item of Object.values(p.items)) {
      if (item.parent !== null && !p.items[item.parent]) result.orphans++;
      else if (item.parent !== null && top.has(item.id)) result.cycles++;
    }
    both.alice.doc.getMap<{ from: string; to: string }>('dependencies').forEach((d) => {
      if (!p.items[d.from] || !p.items[d.to]) result.danglingLinks++;
    });
    result.cards += Object.keys(p.items).length;
  }
  return result;
}
