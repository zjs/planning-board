import { ancestorAtLevel } from './hierarchy.ts';
import type { Item, OrderKey, Plan, PropertyId, ValueId } from './model.ts';
import { itemValues } from './model.ts';
import type { AxisSpec, CardRef, ViewSpec } from './view.ts';

/** Where a dragged card copy was dropped. */
export type DropTarget =
  /** A board cell, by lane keys. */
  | { kind: 'cell'; x: string; y: string }
  /** The holding area's "remove this value" zone for one axis (questions.md Q11). */
  | { kind: 'clear'; axis: 'x' | 'y' };

/** `add` is the modifier-key drop: add a lane instead of moving out of the current one (requirement 3). */
export type DropMode = 'replace' | 'add';

/** The new state of each property a drop changes. Properties not listed are untouched. */
export interface ItemChange {
  sequence?: OrderKey | null;
  values: Record<PropertyId, ValueId[]>;
}

/**
 * What dropping one copy of a card does to the item, or null if nothing
 * changes. Pure, so every drag rule is unit-tested here and the command
 * layer only applies the result.
 *
 * Rules, per axis:
 * - Values more precise than the view level survive when the lane doesn't
 *   change: moving a Billing/Tax card along the time axis keeps Billing/Tax.
 * - Single-valued properties and sequence are replaced.
 * - Multi-valued: replacing moves this copy's lane only; `add` keeps it.
 *   A card coming from the holding area has no lane to move out of, so its
 *   existing values are kept (questions.md Q10).
 */
export function planDrop(
  plan: Plan,
  view: ViewSpec,
  card: CardRef,
  target: DropTarget,
  mode: DropMode = 'replace',
): ItemChange | null {
  const item = plan.items[card.itemId];
  if (!item) return null;
  const results: [AxisSpec, AxisResult][] = [];
  if (target.kind === 'cell') {
    results.push([view.x, moveOnAxis(plan, item, view.x, card.x, target.x, mode)]);
    results.push([view.y, moveOnAxis(plan, item, view.y, card.y, target.y, mode)]);
  } else {
    const axis = view[target.axis];
    const from = card[target.axis];
    if (from !== null) results.push([axis, clearOnAxis(plan, item, axis, from)]);
  }

  const change: ItemChange = { values: {} };
  let changed = false;
  for (const [axis, next] of results) {
    if (next === UNCHANGED) continue;
    changed = true;
    if ('sequence' in next) change.sequence = next.sequence;
    else change.values[axis.property] = next.values;
  }
  return changed ? change : null;
}

const UNCHANGED = Symbol('unchanged');
type AxisResult = typeof UNCHANGED | { sequence: OrderKey | null } | { values: ValueId[] };

function laneOf(plan: Plan, property: PropertyId, value: ValueId, level: number): ValueId | null {
  const p = plan.properties[property];
  return p?.kind === 'select' ? ancestorAtLevel(p, value, level) : null;
}

function moveOnAxis(
  plan: Plan,
  item: Item,
  axis: AxisSpec,
  from: string | null,
  to: string,
  mode: DropMode,
): AxisResult {
  const property = plan.properties[axis.property];
  if (!property) return UNCHANGED;
  if (property.kind === 'sequence') return item.sequence === to ? UNCHANGED : { sequence: to };

  const current = itemValues(item, property.id);
  const inLane = (lane: string) => (v: ValueId) => laneOf(plan, property.id, v, axis.level) === lane;
  const alreadyThere = current.some(inLane(to));

  if (!property.multi) {
    // Keep a more precise value (a release inside the target quarter) if it's already in the lane.
    return alreadyThere && current.length === 1 ? UNCHANGED : { values: [to] };
  }
  if (mode === 'add' || from === null) {
    return alreadyThere ? UNCHANGED : { values: [...current, to] };
  }
  if (from === to) return UNCHANGED;
  const kept = current.filter((v) => !inLane(from)(v));
  return { values: alreadyThere ? kept : [...kept, to] };
}

function clearOnAxis(plan: Plan, item: Item, axis: AxisSpec, from: string): AxisResult {
  const property = plan.properties[axis.property];
  if (!property) return UNCHANGED;
  if (property.kind === 'sequence') return item.sequence === null ? UNCHANGED : { sequence: null };
  const current = itemValues(item, property.id);
  const kept = current.filter((v) => laneOf(plan, property.id, v, axis.level) !== from);
  return kept.length === current.length ? UNCHANGED : { values: kept };
}
