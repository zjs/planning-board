// Two people moving one card at once (requirement 31, Q60). Nothing is
// locked: the later drop wins, and both people are told, each with a way
// back. These functions say what a drop left behind once someone else's
// change arrived.

import { itemValues, SEQUENCE, type ItemId, type OrderKey, type Plan, type PropertyId, type ValueId } from './model.ts';

/** What a drop wrote to a card: its place in the sequence, and its values on the axes it was dropped on. */
export interface CardState {
  sequence: OrderKey | null;
  values: Record<PropertyId, ValueId[]>;
}

/** A card's state on the given axes, or null if it's gone. */
export function cardState(plan: Plan, id: ItemId, properties: readonly PropertyId[]): CardState | null {
  const item = plan.items[id];
  if (!item) return null;
  const values: Record<PropertyId, ValueId[]> = {};
  for (const property of properties) if (property !== SEQUENCE) values[property] = [...itemValues(item, property)].sort();
  return { sequence: properties.includes(SEQUENCE) ? item.sequence : null, values };
}

/**
 * What someone else's change did to a drop of mine:
 * - `lost`: they moved the card after me, and their value replaced mine;
 * - `both`: on a property that holds several values, both drops landed, so the card is in both lanes;
 * - null: mine still stands.
 */
export type CollisionOutcome = { outcome: 'lost' | 'both'; property: PropertyId } | null;

export function classifyCollision(mine: CardState, now: CardState | null, isMulti: (p: PropertyId) => boolean): CollisionOutcome {
  if (!now) return null;
  if (mine.sequence !== now.sequence) return { outcome: 'lost', property: SEQUENCE };
  let both: PropertyId | null = null;
  for (const [property, values] of Object.entries(mine.values)) {
    const current = now.values[property] ?? [];
    if (values.length === current.length && values.every((v) => current.includes(v))) continue;
    if (isMulti(property) && values.every((v) => current.includes(v))) {
      both ??= property;
      continue;
    }
    return { outcome: 'lost', property };
  }
  return both === null ? null : { outcome: 'both', property: both };
}
