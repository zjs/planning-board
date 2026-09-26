import { ancestorAtLevel } from './hierarchy.ts';
import type { Item, OrderKey, Plan, PropertyId, ValueId } from './model.ts';
import { itemValues } from './model.ts';
import type { AxisSpec, CardRef, ViewSpec } from './view.ts';

/**
 * Where a dragged card copy was dropped, by lane key on each axis. Null is
 * that axis's holding lane: a cell is { x, y }, the holding lane at the end
 * of a row is { x: null, y }, the one under a column is { x, y: null }, and
 * the corner is both null (questions.md Q10, Q11).
 */
export interface DropTarget {
  x: string | null;
  y: string | null;
}

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
 * The copy ends up with the target's values. Rules, per axis:
 * - Values more precise than the view level survive when the lane doesn't
 *   change: moving a Billing/Tax card along the time axis keeps Billing/Tax.
 * - Single-valued properties and sequence are replaced.
 * - Multi-valued: replacing moves this copy's lane only; `add` keeps it.
 * - A holding lane (null) removes this copy's value on that axis, and only
 *   that one, whatever the mode.
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
  const onAxis = (axis: AxisSpec, from: string | null, to: string | null): AxisResult => {
    if (to !== null) return moveOnAxis(plan, item, axis, from, to, mode);
    return from === null ? UNCHANGED : clearOnAxis(plan, item, axis, from);
  };
  const results: [AxisSpec, AxisResult][] = [
    [view.x, onAxis(view.x, card.x, target.x)],
    [view.y, onAxis(view.y, card.y, target.y)],
  ];

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
  if (property.kind === 'sequence') {
    return item.sequence === to || sameSequencePlace(plan, item, to) ? UNCHANGED : { sequence: to };
  }

  const current = itemValues(item, property.id);
  const inLane = (lane: string) => (v: ValueId) => laneOf(plan, property.id, v, axis.level) === lane;
  const alreadyThere = current.some(inLane(to));

  if (!property.multi) {
    // Keep a more precise value (a release inside the target quarter) if it's already in the lane.
    return alreadyThere && current.length === 1 ? UNCHANGED : { values: [to] };
  }
  // A copy with no lane on this axis has nothing to move out of.
  if (mode === 'add' || from === null) {
    return alreadyThere ? UNCHANGED : { values: [...current, to] };
  }
  if (from === to) return UNCHANGED;
  const kept = current.filter((v) => !inLane(from)(v));
  return { values: alreadyThere ? kept : [...kept, to] };
}

/**
 * Moving an item that has its column to itself into an adjacent gap would
 * change its key but not its place: no other item sits between the old key
 * and the new one. Treat that as no change, so it records no undo step.
 */
function sameSequencePlace(plan: Plan, item: Item, to: OrderKey): boolean {
  const from = item.sequence;
  if (from === null) return false;
  const [lo, hi] = from < to ? [from, to] : [to, from];
  return !Object.values(plan.items).some(
    (other) => other.id !== item.id && other.sequence !== null && other.sequence >= lo && other.sequence <= hi,
  );
}

function clearOnAxis(plan: Plan, item: Item, axis: AxisSpec, from: string): AxisResult {
  const property = plan.properties[axis.property];
  if (!property) return UNCHANGED;
  if (property.kind === 'sequence') return item.sequence === null ? UNCHANGED : { sequence: null };
  const current = itemValues(item, property.id);
  const kept = current.filter((v) => laneOf(plan, property.id, v, axis.level) !== from);
  return kept.length === current.length ? UNCHANGED : { values: kept };
}
