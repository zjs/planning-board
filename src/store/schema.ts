// How a Plan is laid out in a Yjs document: schema 2 (ADR 0016, amending
// ADR 0006). Only this module and src/commands/ know the layout; everything
// else reads plain Plan snapshots.
//
// Schema 2 is shaped by sprint 9's merge harness, so that two people's edits
// merge the way people expect:
// - Values are flat keys on the card. A single-valued property is one key
//   holding one value, so two drops leave exactly one; a multi-valued one is
//   a key per value, so concurrent adds all land. Nothing nested is created
//   on first use, so a card's first value merges like any other.
// - Deleting marks a card or a value `deleted` instead of removing it, so
//   edits made at the same time survive, and undo is a flip of the mark.
//   A card under a deleted group is hidden with it.
// - A value's label, parent and order are separate keys, so a rename and a
//   reorder made at once both stick.

import * as Y from 'yjs';
import type { Dependency, Item, Plan, Property, PropertyId, Related, ValueId, ValueNode } from '../domain/model.ts';
import { compareOrderKeys } from '../domain/model.ts';
import { isOrderKey } from '../domain/sequence.ts';

/** Bump when the layout changes incompatibly; persistence keys include it. */
export const SCHEMA_VERSION = 2;

export const root = (doc: Y.Doc) => ({
  /** `schema`: the layout version, 2. A document without it is empty, or version 1 (src/store/schemaV1.ts). */
  meta: doc.getMap<unknown>('meta'),
  properties: doc.getMap<Y.Map<unknown>>('properties'),
  items: doc.getMap<Y.Map<unknown>>('items'),
  dependencies: doc.getMap<Dependency>('dependencies'),
  /** Related links (Q44), keyed by `relatedKey`. */
  related: doc.getMap<Related>('related'),
});

/** Which layout a document holds: 0 when it holds nothing at all. */
export function schemaOf(doc: Y.Doc): 0 | 1 | 2 {
  const r = root(doc);
  if (r.meta.get('schema') === 2) return 2;
  return r.properties.size > 0 || r.items.size > 0 ? 1 : 0;
}

/** Whether the board has no properties and no cards, deleted ones aside. */
export function isEmpty(doc: Y.Doc): boolean {
  const r = root(doc);
  if (r.properties.size > 0) return false;
  for (const item of r.items.values()) if (item.get('deleted') !== true) return false;
  return true;
}

/** Replace the whole document's content with `plan`. Call inside a transaction. */
export function writePlan(doc: Y.Doc, plan: Plan): void {
  const r = root(doc);
  r.properties.clear();
  r.items.clear();
  r.dependencies.clear();
  r.related.clear();
  r.meta.set('schema', SCHEMA_VERSION);
  for (const property of Object.values(plan.properties)) r.properties.set(property.id, propertyToY(property));
  for (const item of Object.values(plan.items)) r.items.set(item.id, itemToY(item, plan));
  for (const dep of plan.dependencies) r.dependencies.set(dependencyKey(dep), { from: dep.from, to: dep.to });
  for (const link of plan.related) r.related.set(relatedKey(link), { a: link.a, b: link.b });
}

export const dependencyKey = (dep: Dependency) => `${dep.from}->${dep.to}`;
export const relatedKey = (link: Related) => `${link.a}~${link.b}`;

// Value keys on a card. The separator can't appear in an ID typed or imported by a person.
const SEP = '\u001f';
const singleKey = (property: PropertyId) => `v${SEP}${property}`;
const multiKey = (property: PropertyId, value: ValueId) => `v${SEP}${property}${SEP}${value}`;

/** A value key's property and, for a multi-valued property, its value. Null for any other key. */
function parseValueKey(key: string): { property: PropertyId; value: ValueId | null } | null {
  if (!key.startsWith(`v${SEP}`)) return null;
  const [, property, value] = key.split(SEP);
  if (property === undefined) return null;
  return { property, value: value ?? null };
}

export function valueNodeToY(node: Omit<ValueNode, 'id'>): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set('label', node.label);
  map.set('parent', node.parent);
  map.set('order', node.order);
  return map;
}

export function propertyToY(property: Property): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set('kind', property.kind);
  map.set('name', property.name);
  if (property.kind === 'select') {
    map.set('levels', [...property.levels]);
    map.set('multi', property.multi);
    const values = new Y.Map<Y.Map<unknown>>();
    for (const node of Object.values(property.values)) {
      values.set(node.id, valueNodeToY({ label: node.label, parent: node.parent, order: node.order }));
    }
    map.set('values', values);
  }
  return map;
}

/** Whether a property holds several values on a card. Unknown properties count as single. */
const isMulti = (plan: Pick<Plan, 'properties'>, property: PropertyId) => {
  const p = plan.properties[property];
  return p?.kind === 'select' && p.multi;
};

export function itemToY(item: Item, plan: Pick<Plan, 'properties'>): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set('title', item.title);
  map.set('description', item.description);
  map.set('parent', item.parent);
  map.set('sequence', item.sequence);
  if (item.rank !== undefined) map.set('rank', item.rank);
  if (item.externalKey !== undefined) map.set('externalKey', item.externalKey);
  for (const [property, ids] of Object.entries(item.values)) writeItemValues(map, property, isMulti(plan, property), ids);
  return map;
}

/**
 * Set one property's values on a card, writing only what changed, so an
 * edit made at the same time to another value survives. Call inside a
 * transaction (or on a map not yet in a document).
 */
export function writeItemValues(item: Y.Map<unknown>, property: PropertyId, multi: boolean, next: readonly ValueId[]): void {
  if (!multi) {
    const value = next[0];
    if (value === undefined) {
      if (item.has(singleKey(property))) item.delete(singleKey(property));
    } else if (item.get(singleKey(property)) !== value) {
      item.set(singleKey(property), value);
    }
    return;
  }
  const wanted = new Set(next);
  for (const key of [...item.keys()]) {
    const parsed = parseValueKey(key);
    if (parsed?.property === property && parsed.value !== null && !wanted.has(parsed.value)) item.delete(key);
  }
  for (const value of wanted) if (!item.has(multiKey(property, value))) item.set(multiKey(property, value), true);
}

/** Remove every value a card holds for a property, single or multi. */
export function clearItemValues(item: Y.Map<unknown>, property: PropertyId): void {
  for (const key of [...item.keys()]) if (parseValueKey(key)?.property === property) item.delete(key);
}

const str = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);
const strOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
/** A malformed key (a bug, or a bad peer in M2) reads as "no position" rather than breaking layout. */
const orderKeyOrNull = (value: unknown): string | null => (typeof value === 'string' && isOrderKey(value) ? value : null);

/**
 * The cards a reader shows: not deleted, and not under a deleted group.
 * Cycle-safe: a loop of parents (ADR 0004) stops the walk.
 */
function visibleItems(items: Y.Map<Y.Map<unknown>>): Set<string> {
  const hidden = new Map<string, boolean>();
  const isHidden = (id: string, seen: Set<string>): boolean => {
    const known = hidden.get(id);
    if (known !== undefined) return known;
    const item = items.get(id);
    if (!item) return false; // a missing parent hides nothing; the card shows at the top level
    if (item.get('deleted') === true) return true;
    const parent = strOrNull(item.get('parent'));
    if (parent === null || seen.has(parent)) return false;
    seen.add(id);
    const result = isHidden(parent, seen);
    hidden.set(id, result);
    return result;
  };
  const visible = new Set<string>();
  items.forEach((item, id) => {
    if (item.get('deleted') !== true && !isHidden(id, new Set())) visible.add(id);
  });
  return visible;
}

/** Plain snapshot of the document: deleted cards and values, and links to them, left out. */
export function readPlan(doc: Y.Doc): Plan {
  const r = root(doc);
  const properties: Record<string, Property> = {};
  r.properties.forEach((map, id) => {
    const name = str(map.get('name'), id);
    if (map.get('kind') === 'sequence') {
      properties[id] = { kind: 'sequence', id: 'sequence', name };
      return;
    }
    const values: Record<string, ValueNode> = {};
    (map.get('values') as Y.Map<Y.Map<unknown>> | undefined)?.forEach((node, valueId) => {
      if (!(node instanceof Y.Map) || node.get('deleted') === true) return;
      values[valueId] = {
        id: valueId,
        label: str(node.get('label'), valueId),
        parent: strOrNull(node.get('parent')),
        order: str(node.get('order'), 'a0'),
      };
    });
    properties[id] = {
      kind: 'select',
      id,
      name,
      levels: (map.get('levels') as string[] | undefined) ?? [],
      multi: map.get('multi') === true,
      values,
    };
  });
  // A deleted value's parent may be gone too; a live value under a deleted parent is still shown.

  const visible = visibleItems(r.items);
  const items: Record<string, Item> = {};
  r.items.forEach((map, id) => {
    if (!visible.has(id)) return;
    const values: Record<string, string[]> = {};
    for (const [key, raw] of map.entries()) {
      const parsed = parseValueKey(key);
      if (!parsed) continue;
      const p = properties[parsed.property];
      if (p?.kind !== 'select') continue;
      const value = parsed.value ?? (typeof raw === 'string' ? raw : null);
      // A value deleted while someone used it reads as no value (ADR 0016).
      if (value === null || !p.values[value]) continue;
      // A key written as the other kind (by a bug or a bad peer) is read only if it fits the property.
      if (p.multi !== (parsed.value !== null)) continue;
      (values[parsed.property] ??= []).push(value);
    }
    for (const ids of Object.values(values)) ids.sort(compareOrderKeys);
    items[id] = {
      id,
      title: str(map.get('title'), ''),
      description: str(map.get('description'), ''),
      parent: strOrNull(map.get('parent')),
      sequence: orderKeyOrNull(map.get('sequence')),
      values,
    };
    const externalKey = strOrNull(map.get('externalKey'));
    if (externalKey !== null) items[id].externalKey = externalKey;
    const rank = orderKeyOrNull(map.get('rank'));
    if (rank !== null) items[id].rank = rank;
  });

  const dependencies = [...r.dependencies.values()].filter((d) => items[d.from] && items[d.to]);
  const related = [...r.related.values()].filter((l) => items[l.a] && items[l.b] && l.a !== l.b);
  return { properties, items, dependencies, related };
}
