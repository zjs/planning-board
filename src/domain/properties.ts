// Rules for editing properties and their values (requirements 25–27, ADR
// 0009), as pure functions over plan snapshots. The commands in
// src/commands/ apply them to the Yjs document.

import { generateKeyBetween } from 'fractional-indexing';
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
