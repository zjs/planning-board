// Rules for editing properties and their values (requirements 25–27, ADR
// 0009), as pure functions over plan snapshots. The commands in
// src/commands/ apply them to the Yjs document.

import { generateKeyBetween } from 'fractional-indexing';
import { depthOf, isWithin, valuesAtLevel, withoutAncestors } from './hierarchy.ts';
import { cleanTitle } from './items.ts';
import type { ItemId, OrderKey, Plan, Property, PropertyId, SelectProperty, ValueId, ValueNode } from './model.ts';
import { compareOrderKeys, itemValues, SEQUENCE, SIZE, SYSTEM, TIME } from './model.ts';

const BUILT_IN = new Set<PropertyId>([SEQUENCE, SYSTEM, SIZE, TIME]);

/** Built-in properties carry special logic and are in every plan (requirement 25), so they can't be deleted. */
export const isBuiltIn = (id: PropertyId) => BUILT_IN.has(id);

/** Built-ins first (sequence, system, size, time), then custom properties by name. The order of the axis picker and the Properties panel. */
export function propertiesInOrder(plan: Plan): Property[] {
  const order = [SEQUENCE, SYSTEM, SIZE, TIME];
  const rank = (p: Property) => {
    const i = order.indexOf(p.id);
    return i < 0 ? order.length : i;
  };
  return Object.values(plan.properties).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Why `name` can't name a property, or null if it can. `except` is the property being renamed. */
export function propertyNameProblem(plan: Plan, name: string, except?: PropertyId): string | null {
  const clean = cleanTitle(name);
  if (clean === null) return 'A property needs a name.';
  const taken = Object.values(plan.properties).some(
    (p) => p.id !== except && p.name.toLocaleLowerCase() === clean.toLocaleLowerCase(),
  );
  return taken ? `There's already a property called “${clean}”.` : null;
}

/** A value's siblings, in display order. */
export function siblingsOf(property: SelectProperty, parent: ValueId | null): ValueNode[] {
  return Object.values(property.values)
    .filter((node) => node.parent === parent)
    .sort((a, b) => compareOrderKeys(a.order, b.order) || compareOrderKeys(a.id, b.id));
}

/** Why `label` can't name a value under `parent`, or null if it can. `except` is the value being renamed. */
export function valueLabelProblem(
  property: SelectProperty,
  label: string,
  parent: ValueId | null,
  except?: ValueId,
): string | null {
  const clean = cleanTitle(label);
  if (clean === null) return 'A value needs a name.';
  const taken = siblingsOf(property, parent).some(
    (node) => node.id !== except && node.label.toLocaleLowerCase() === clean.toLocaleLowerCase(),
  );
  return taken ? `“${clean}” is already here.` : null;
}

/** An order key that puts a new value after its last sibling. */
export function orderAtEnd(property: SelectProperty, parent: ValueId | null): OrderKey {
  return generateKeyBetween(siblingsOf(property, parent).at(-1)?.order ?? null, null);
}

/** Cards holding any value of this property. */
export function cardsWithProperty(plan: Plan, property: PropertyId): ItemId[] {
  return Object.values(plan.items)
    .filter((item) => itemValues(item, property).length > 0)
    .map((item) => item.id);
}

/** A card's new values for one property, after a value edit. */
export interface CardValueChange {
  item: ItemId;
  values: ValueId[];
}

/** What deleting a value does (questions.md Q4). */
export interface ValueDeletion {
  /** The value and everything below it. */
  removed: ValueId[];
  /** Where its cards go: the deleted value's parent, or nowhere. */
  parent: ValueId | null;
  cards: CardValueChange[];
}

/**
 * Delete a value and everything below it. Cards holding any of them move to
 * the deleted value's parent (a deleted release's cards stay in its
 * quarter), or lose the value when it has no parent (Q4).
 */
export function planValueDelete(plan: Plan, propertyId: PropertyId, valueId: ValueId): ValueDeletion | null {
  const property = plan.properties[propertyId];
  if (property?.kind !== 'select' || !property.values[valueId]) return null;
  const removed = Object.values(property.values)
    .filter((node) => isWithin(property, node.id, valueId))
    .map((node) => node.id);
  const gone = new Set(removed);
  const parent = property.values[valueId].parent;
  const cards: CardValueChange[] = [];
  for (const item of Object.values(plan.items)) {
    const held = itemValues(item, propertyId);
    if (!held.some((v) => gone.has(v))) continue;
    const kept = held.filter((v) => !gone.has(v));
    const next = parent === null ? kept : withoutAncestors(property, [...new Set([...kept, parent])]);
    cards.push({ item: item.id, values: property.multi ? next : next.slice(0, 1) });
  }
  return { removed, parent, cards };
}

/** Where a value can move: any value one level up, other than its current parent. */
export function moveTargets(property: SelectProperty, valueId: ValueId): ValueNode[] {
  const node = property.values[valueId];
  const depth = depthOf(property, valueId);
  if (!node || depth <= 0) return [];
  return valuesAtLevel(property, depth - 1).filter((target) => target.id !== node.parent);
}

/** What moving a value under another parent does. */
export interface ValueMove {
  order: OrderKey;
  /** Cards that held both the value and its new parent keep only the more precise one. */
  cards: CardValueChange[];
}

/**
 * Move a value under another parent at the same level (a component to
 * another area, a release to another quarter). It keeps its ID, so its
 * cards come with it (ADR 0009). Null when the move isn't allowed:
 * another level, the same parent, or a clashing label.
 */
export function planValueMove(plan: Plan, propertyId: PropertyId, valueId: ValueId, parent: ValueId): ValueMove | null {
  const property = plan.properties[propertyId];
  if (property?.kind !== 'select') return null;
  const node = property.values[valueId];
  if (!node || !moveTargets(property, valueId).some((t) => t.id === parent)) return null;
  if (valueLabelProblem(property, node.label, parent) !== null) return null;
  const order = orderAtEnd(property, parent);
  const moved: SelectProperty = { ...property, values: { ...property.values, [valueId]: { ...node, parent, order } } };
  const cards: CardValueChange[] = [];
  for (const item of Object.values(plan.items)) {
    const held = itemValues(item, propertyId);
    if (!held.some((v) => isWithin(moved, v, valueId))) continue;
    const next = withoutAncestors(moved, held);
    if (next.length !== held.length) cards.push({ item: item.id, values: next });
  }
  return { order, cards };
}

/** An order key that moves a value one place up or down among its siblings, or null at the end. */
export function reorderKey(property: SelectProperty, valueId: ValueId, direction: 'up' | 'down'): OrderKey | null {
  const node = property.values[valueId];
  if (!node) return null;
  const siblings = siblingsOf(property, node.parent);
  const at = siblings.findIndex((s) => s.id === valueId);
  if (direction === 'up') {
    if (at <= 0) return null;
    return keyBetween(siblings[at - 2]?.order ?? null, siblings[at - 1]!.order);
  }
  if (at < 0 || at >= siblings.length - 1) return null;
  return keyBetween(siblings[at + 1]!.order, siblings[at + 2]?.order ?? null);
}

function keyBetween(a: OrderKey | null, b: OrderKey | null): OrderKey {
  // Two siblings can share a key after concurrent edits; nudge past the tie.
  if (a !== null && b !== null && a >= b) return generateKeyBetween(a, null);
  return generateKeyBetween(a, b);
}

/** Why `name` can't name level `index` of a property, or null if it can. */
export function levelNameProblem(property: SelectProperty, index: number, name: string): string | null {
  const clean = cleanTitle(name);
  if (clean === null) return 'A level needs a name.';
  const taken = property.levels.some((level, i) => i !== index && level.toLocaleLowerCase() === clean.toLocaleLowerCase());
  return taken ? `${property.name} already has a level called “${clean}”.` : null;
}
