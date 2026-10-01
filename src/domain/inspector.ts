// The card inspector (questions.md Q35): what the selected cards hold for
// each property, and what an edit there changes, as pure functions.

import { compareTreeOrder, withoutAncestors } from './hierarchy.ts';
import type { Dependency, ItemId, Plan, PropertyId, SelectProperty, ValueId } from './model.ts';
import { itemValues } from './model.ts';
import type { CardValueChange } from './properties.ts';

/** One property across the selection: the values every card shares, or a mix. */
export type FieldValue =
  | { mixed: false; values: ValueId[] }
  /** `counts` says how many of the cards hold each value, in tree order. */
  | { mixed: true; counts: { value: ValueId; count: number }[] };

const sameSet = (a: readonly ValueId[], b: readonly ValueId[]) =>
  a.length === b.length && a.every((v) => b.includes(v));

export function selectionValues(plan: Plan, ids: readonly ItemId[], property: SelectProperty): FieldValue {
  const items = ids.map((id) => plan.items[id]).filter((item) => item !== undefined);
  const sets = items.map((item) => itemValues(item, property.id).filter((v) => property.values[v]));
  const byTree = (a: ValueId, b: ValueId) => compareTreeOrder(property, a, b);
  const first = sets[0] ?? [];
  if (sets.every((set) => sameSet(set, first))) return { mixed: false, values: [...first].sort(byTree) };
  const counts = new Map<ValueId, number>();
  for (const set of sets) for (const v of set) counts.set(v, (counts.get(v) ?? 0) + 1);
  return {
    mixed: true,
    counts: [...counts.keys()].sort(byTree).map((value) => ({ value, count: counts.get(value)! })),
  };
}

/** An edit from the inspector, applied to every selected card. */
export type ValueEdit =
  /** Replace the values: a single-value pick, or "none" with an empty list. */
  | { kind: 'set'; values: ValueId[] }
  /** Add a value, keeping the others (multi-value properties). A more precise value replaces its ancestor. */
  | { kind: 'add'; value: ValueId }
  | { kind: 'remove'; value: ValueId };

/** The cards an edit actually changes, with their new values. Unknown values and cards are ignored. */
export function planValueEdit(
  plan: Plan,
  ids: readonly ItemId[],
  propertyId: PropertyId,
  edit: ValueEdit,
): CardValueChange[] {
  const property = plan.properties[propertyId];
  if (property?.kind !== 'select') return [];
  const known = (v: ValueId) => property.values[v] !== undefined;
  const out: CardValueChange[] = [];
  for (const id of new Set(ids)) {
    const item = plan.items[id];
    if (!item) continue;
    const current = itemValues(item, propertyId);
    let next: ValueId[];
    if (edit.kind === 'set') {
      next = edit.values.filter(known);
      if (!property.multi) next = next.slice(0, 1);
    } else if (edit.kind === 'add') {
      if (!known(edit.value)) continue;
      next = property.multi ? withoutAncestors(property, [...current, edit.value]) : [edit.value];
    } else {
      next = current.filter((v) => v !== edit.value);
    }
    next = [...new Set(next)];
    if (!sameSet(next, current)) out.push({ item: id, values: next });
  }
  return out;
}

/** A card's own links: what it waits on, and what waits on it. A group's children's links aren't included. */
export function ownLinks(plan: Plan, id: ItemId): { after: Dependency[]; before: Dependency[] } {
  const byTitle = (pick: (d: Dependency) => ItemId) => (a: Dependency, b: Dependency) =>
    (plan.items[pick(a)]?.title ?? '').localeCompare(plan.items[pick(b)]?.title ?? '');
  return {
    after: plan.dependencies.filter((d) => d.to === id && plan.items[d.from]).sort(byTitle((d) => d.from)),
    before: plan.dependencies.filter((d) => d.from === id && plan.items[d.to]).sort(byTitle((d) => d.to)),
  };
}
