// The version 1 layout of a plan's Yjs document (sprint 0 to sprint 9;
// ADR 0006), kept only to read boards saved before schema 2 (ADR 0016) and
// migrate them. Nothing writes this layout any more.

import * as Y from 'yjs';
import type { Dependency, Item, Plan, Property, Related, ValueNode } from '../domain/model.ts';
import { compareOrderKeys } from '../domain/model.ts';
import { isOrderKey } from '../domain/sequence.ts';
import { writePlan } from './schema.ts';

type ValueSet = Y.Map<true>;

const root = (doc: Y.Doc) => ({
  properties: doc.getMap<Y.Map<unknown>>('properties'),
  items: doc.getMap<Y.Map<unknown>>('items'),
  dependencies: doc.getMap<Dependency>('dependencies'),
  related: doc.getMap<Related>('related'),
});

const str = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);
const strOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
/** A malformed key (a bug, or a bad peer in M2) reads as "no position" rather than breaking layout. */
const orderKeyOrNull = (value: unknown): string | null => (typeof value === 'string' && isOrderKey(value) ? value : null);

/** Plain snapshot of a version 1 document. */
export function readPlanV1(doc: Y.Doc): Plan {
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
    const rank = orderKeyOrNull(map.get('rank'));
    if (rank !== null) items[id].rank = rank;
  });

  const dependencies = [...r.dependencies.values()].filter((d) => items[d.from] && items[d.to]);
  const related = [...r.related.values()].filter((l) => items[l.a] && items[l.b] && l.a !== l.b);
  return { properties, items, dependencies, related };
}

/**
 * Copy a version 1 board into an empty document as schema 2 (ADR 0016). It
 * goes through a plain snapshot, so nothing of the old layout survives. Not
 * an undo step: it's part of opening the board, like `ensureBuiltIns`.
 */
export function migrateV1(from: Y.Doc, to: Y.Doc): void {
  const plan = readPlanV1(from);
  to.transact(() => writePlan(to, plan));
}
