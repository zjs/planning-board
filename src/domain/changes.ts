// How much differs between two versions of a plan, counted the way people
// think of it: the cards touched, not the edits made. Used for "7 changes not
// shared yet" (requirement 35, Q59), so typing a title one key at a time, or
// moving a card and moving it back, never inflates the count.

import type { ItemId, Plan } from './model.ts';

export interface PlanChanges {
  /** Cards added, removed or changed, including cards whose links changed. */
  cards: number;
  /** Properties added, removed or changed, such as a new area or a renamed size. */
  properties: number;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What differs between `before` and `after`. */
export function planChanges(before: Plan, after: Plan): PlanChanges {
  const cards = new Set<ItemId>();
  for (const id of new Set([...Object.keys(before.items), ...Object.keys(after.items)])) {
    if (!same(before.items[id], after.items[id])) cards.add(id);
  }
  const links = (plan: Plan) =>
    new Map([
      ...plan.dependencies.map((d) => [`d:${d.from}>${d.to}`, [d.from, d.to]] as const),
      ...plan.related.map((r) => [`r:${r.a}~${r.b}`, [r.a, r.b]] as const),
    ]);
  const was = links(before);
  const now = links(after);
  for (const [key, ends] of was) if (!now.has(key)) ends.forEach((id) => cards.add(id));
  for (const [key, ends] of now) if (!was.has(key)) ends.forEach((id) => cards.add(id));
  let properties = 0;
  for (const id of new Set([...Object.keys(before.properties), ...Object.keys(after.properties)])) {
    if (!same(before.properties[id], after.properties[id])) properties++;
  }
  return { cards: cards.size, properties };
}
