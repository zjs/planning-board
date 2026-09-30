// How a Plan is laid out in a Yjs document (docs/decisions/0006-crdt.md).
// Only this module and src/commands/ know the layout; everything else reads
// plain Plan snapshots.

import * as Y from 'yjs';
import type { Dependency, Item, Plan, Property, ValueNode } from '../domain/model.ts';
import { compareOrderKeys } from '../domain/model.ts';
import { isOrderKey } from '../domain/sequence.ts';

/** Bump when the layout changes incompatibly; persistence keys include it. */
export const SCHEMA_VERSION = 1;

type ValueSet = Y.Map<true>;

export const root = (doc: Y.Doc) => ({
  properties: doc.getMap<Y.Map<unknown>>('properties'),
  items: doc.getMap<Y.Map<unknown>>('items'),
  dependencies: doc.getMap<Dependency>('dependencies'),
});

export function isEmpty(doc: Y.Doc): boolean {
  const r = root(doc);
  return r.properties.size === 0 && r.items.size === 0;
}

/** Replace the whole document's content with `plan`. Call inside a transaction. */
export function writePlan(doc: Y.Doc, plan: Plan): void {
  const r = root(doc);
  r.properties.clear();
  r.items.clear();
  r.dependencies.clear();
  for (const property of Object.values(plan.properties)) r.properties.set(property.id, propertyToY(property));
  for (const item of Object.values(plan.items)) r.items.set(item.id, itemToY(item));
  for (const dep of plan.dependencies) r.dependencies.set(dependencyKey(dep), { from: dep.from, to: dep.to });
}

export const dependencyKey = (dep: Dependency) => `${dep.from}->${dep.to}`;

function propertyToY(property: Property): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set('kind', property.kind);
  map.set('name', property.name);
  if (property.kind === 'select') {
    map.set('levels', [...property.levels]);
    map.set('multi', property.multi);
    const values = new Y.Map<Omit<ValueNode, 'id'>>();
    for (const node of Object.values(property.values)) {
      values.set(node.id, { label: node.label, parent: node.parent, order: node.order });
    }
    map.set('values', values);
  }
  return map;
}

export function itemToY(item: Item): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set('title', item.title);
  map.set('description', item.description);
  map.set('parent', item.parent);
  map.set('sequence', item.sequence);
  if (item.externalKey !== undefined) map.set('externalKey', item.externalKey);
  const values = new Y.Map<ValueSet>();
  for (const [property, ids] of Object.entries(item.values)) values.set(property, valueSet(ids));
  map.set('values', values);
  return map;
}

/** Multi-valued properties are sets (map keys), so concurrent adds merge instead of duplicating. */
export function valueSet(ids: readonly string[]): ValueSet {
  const set = new Y.Map<true>();
  for (const id of ids) set.set(id, true);
  return set;
}

const str = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);
const strOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
/** A malformed key (a bug, or a bad peer in M2) reads as "no position" rather than breaking layout. */
const orderKeyOrNull = (value: unknown): string | null => (typeof value === 'string' && isOrderKey(value) ? value : null);

/** Plain snapshot of the document. */
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
    (map.get('values') as Y.Map<Omit<ValueNode, 'id'>> | undefined)?.forEach((node, valueId) => {
      values[valueId] = { id: valueId, ...node };
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

  const items: Record<string, Item> = {};
  r.items.forEach((map, id) => {
    const values: Record<string, string[]> = {};
    (map.get('values') as Y.Map<ValueSet> | undefined)?.forEach((set, property) => {
      const ids = [...set.keys()].sort(compareOrderKeys);
      const p = properties[property];
      const multi = p?.kind === 'select' && p.multi;
      // Two people setting a single-valued property at once can leave two
      // values; every client shows the same one.
      values[property] = multi ? ids : ids.slice(0, 1);
    });
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
  });

  const dependencies = [...r.dependencies.values()].filter((d) => items[d.from] && items[d.to]);
  return { properties, items, dependencies };
}
