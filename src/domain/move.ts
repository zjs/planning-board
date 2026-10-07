import { withoutAncestors } from './hierarchy.ts';
import type { Item, ItemId, OrderKey, Plan, PropertyId, ValueId } from './model.ts';
import { itemValues } from './model.ts';
import { laneKeyOf, type AxisSpec, type CardRef, type ViewSpec } from './view.ts';

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
 *   that one, whatever the mode. On a nested axis, a parent's own lane
 *   means "the parent, nothing more precise" (questions.md Q22).
 * - Refining replaces: a new value drops any of its ancestors, so Identity
 *   becomes Identity/SSO rather than keeping both.
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
    if (from === null) return UNCHANGED;
    return clearOnAxis(plan, item, axis, from);
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

/**
 * Dropping a selection of cards together (questions.md Q48 a): every card
 * gets the drop's values on both axes, in one change.
 *
 * The dragged copy moves as it would alone. Every other card moves as if
 * its own copy in the dragged copy's lanes had been dragged:
 * - on an axis that holds several values, its value in the dragged copy's
 *   lane is replaced, or, with nothing in that lane, the target is added;
 * - on a single-valued axis or sequence, its value is replaced, and a
 *   holding lane clears it.
 * Returns each card that changes, with its change.
 */
export function planDrops(
  plan: Plan,
  view: ViewSpec,
  dragged: CardRef,
  ids: Iterable<ItemId>,
  target: DropTarget,
  mode: DropMode = 'replace',
): [ItemId, ItemChange][] {
  const out: [ItemId, ItemChange][] = [];
  for (const id of new Set([dragged.itemId, ...ids])) {
    const card = id === dragged.itemId ? dragged : copyLike(plan, view, dragged, id);
    const change = card && planDrop(plan, view, card, target, mode);
    if (change) out.push([id, change]);
  }
  return out;
}

/** Another card's stand-in for the dragged copy: its own lane on each axis, as the rules above choose. */
function copyLike(plan: Plan, view: ViewSpec, dragged: CardRef, id: ItemId): CardRef | null {
  const item = plan.items[id];
  if (!item) return null;
  const from = (axis: AxisSpec, lane: string | null): string | null => {
    const property = plan.properties[axis.property];
    if (property?.kind === 'sequence') return item.sequence;
    if (property?.kind !== 'select') return null;
    const lanes = itemValues(item, property.id).map((v) => laneKeyOf(property, v, axis));
    if (!property.multi) return lanes.find((l) => l !== null) ?? null;
    return lane !== null && lanes.includes(lane) ? lane : null;
  };
  return { itemId: id, x: from(view.x, dragged.x), y: from(view.y, dragged.y) };
}

const UNCHANGED = Symbol('unchanged');
type AxisResult = typeof UNCHANGED | { sequence: OrderKey | null } | { values: ValueId[] };

/** The lane a value is in on this axis, nested and collapsed lanes included (ADR 0012). */
function laneOf(plan: Plan, axis: AxisSpec, value: ValueId): ValueId | null {
  const p = plan.properties[axis.property];
  return p?.kind === 'select' ? laneKeyOf(p, value, axis) : null;
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
  const inLane = (lane: string) => (v: ValueId) => laneOf(plan, axis, v) === lane;
  const alreadyThere = current.some(inLane(to));

  if (!property.multi) {
    // Keep a more precise value (a release inside the target quarter) if it's already in the lane.
    return alreadyThere && current.length === 1 ? UNCHANGED : { values: [to] };
  }
  // A copy with no lane on this axis has nothing to move out of.
  if (mode === 'add' || from === null) {
    return alreadyThere ? UNCHANGED : { values: withoutAncestors(property, [...current, to]) };
  }
  if (from === to) return UNCHANGED;
  const kept = current.filter((v) => !inLane(from)(v));
  return { values: withoutAncestors(property, alreadyThere ? kept : [...kept, to]) };
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
  const kept = current.filter((v) => laneOf(plan, axis, v) !== from);
  return kept.length === current.length ? UNCHANGED : { values: kept };
}
