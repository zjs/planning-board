// Plain snapshot types for a plan. No UI or Yjs imports: everything in
// src/domain/ is pure functions over these values.

export type ItemId = string;
export type ValueId = string;
export type PropertyId = string;

/** Fractional ordering key. Compare with `<`, never `localeCompare`. */
export type OrderKey = string;

/** Built-in property IDs. Custom properties use any other ID. */
export const SEQUENCE = 'sequence';
export const SYSTEM = 'system';
export const SIZE = 'size';
export const TIME = 'time';

/** One node in a property's value hierarchy, e.g. an area, a component, a quarter. */
export interface ValueNode {
  id: ValueId;
  label: string;
  /** null for top-level values. Depth in the tree is the node's level. */
  parent: ValueId | null;
  /** Position among siblings. */
  order: OrderKey;
}

/**
 * A select-style property: a hierarchy of values of any depth.
 * System, size, time, and custom properties are all select properties.
 */
export interface SelectProperty {
  kind: 'select';
  id: PropertyId;
  name: string;
  /** Level names from the top down, e.g. ["Area", "Component"]. */
  levels: string[];
  /** Whether an item can hold several values, like system components. */
  multi: boolean;
  values: Record<ValueId, ValueNode>;
}

/**
 * The sequence property has no value list: each item holds an OrderKey,
 * and items sharing a key share a column.
 */
export interface SequenceProperty {
  kind: 'sequence';
  id: typeof SEQUENCE;
  name: string;
}

export type Property = SelectProperty | SequenceProperty;

export interface Item {
  id: ItemId;
  title: string;
  description: string;
  /** Parent group, or null for a top-level item. */
  parent: ItemId | null;
  sequence: OrderKey | null;
  /**
   * Values per select property. Each value may sit at any level of the
   * property's hierarchy (a quarter, or a release inside it). A missing key
   * and an empty array both mean "no value".
   */
  values: Record<PropertyId, ValueId[]>;
}

/** `from` must come before `to`. */
export interface Dependency {
  from: ItemId;
  to: ItemId;
}

export interface Plan {
  properties: Record<PropertyId, Property>;
  items: Record<ItemId, Item>;
  dependencies: Dependency[];
}

/** Byte-order comparison, which is what fractional order keys are designed for. */
export function compareOrderKeys(a: OrderKey, b: OrderKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function itemValues(item: Item, property: PropertyId): readonly ValueId[] {
  return item.values[property] ?? [];
}
