// Selecting many cards at once (questions.md Q47): every card on the board
// with a value, every card in a lane, or every card. Pure queries over a
// view's layout, so they select only what's on screen.

import { isWithin } from './hierarchy.ts';
import { itemValues, type ItemId, type Plan, type PropertyId, type ValueId } from './model.ts';
import { unwrap, type CardRef, type ViewLayout } from './view.ts';

/**
 * The cards a copy stands for: itself, or for a faded group copy, the real
 * cards framed inside it. A faded copy is the group in a lane it doesn't
 * hold itself, so it isn't selected with that lane.
 */
const real = (ref: CardRef): CardRef[] => (ref.via ? (ref.inner ?? []) : [ref]);

const unique = (refs: CardRef[]): ItemId[] => [...new Set(unwrap(refs).flatMap(real).map((r) => r.itemId))];

/** Every card on the board, each once, in board order (⌘A). */
export function cardsOnBoard(layout: ViewLayout): ItemId[] {
  return unique([
    ...layout.cells.flat(2),
    ...layout.holding.rows.flat(),
    ...layout.holding.columns.flat(),
    ...layout.holding.corner,
  ]);
}

/**
 * Every card on the board holding `value` or a value below it, such as
 * every initiative, or everything in Identity. Works whatever the axes are.
 */
export function matchingCards(plan: Plan, layout: ViewLayout, property: PropertyId, value: ValueId): ItemId[] {
  const prop = plan.properties[property];
  if (prop?.kind !== 'select') return [];
  return cardsOnBoard(layout).filter((id) => {
    const item = plan.items[id];
    return item !== undefined && itemValues(item, property).some((v) => v === value || isWithin(prop, v, value));
  });
}

/**
 * Every card in lanes `start` up to `end` of one axis: a lane, or all the
 * lanes under a band. Includes the lanes' holding cells.
 */
export function laneCards(layout: ViewLayout, which: 'x' | 'y', start: number, end: number): ItemId[] {
  const refs: CardRef[] = [];
  for (let i = start; i < end; i++) {
    if (which === 'y') refs.push(...(layout.cells[i] ?? []).flat(), ...(layout.holding.rows[i] ?? []));
    else refs.push(...layout.cells.flatMap((row) => row[i] ?? []), ...(layout.holding.columns[i] ?? []));
  }
  return unique(refs);
}
