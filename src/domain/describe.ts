// A change in words, as history shows it (ADR 0020): "moved “Tax engine”
// into “Payments”". Words are made when shown, in today's names, so a card
// renamed since reads as it's called now. A deleted card keeps the title it
// had, from whichever change last named it.

import type { Change } from './diff.ts';
import type { ItemId, Plan, PropertyId, ValueId } from './model.ts';

const quote = (text: string) => `“${text}”`;

/** A value's label with its parents', "Identity › SSO", or that it's gone. */
export function valueLabel(plan: Plan, property: PropertyId, id: ValueId): string {
  const prop = plan.properties[property];
  if (prop?.kind !== 'select') return id;
  const path: string[] = [];
  let node = prop.values[id];
  if (!node) return 'a deleted value';
  for (let guard = 0; node && guard < 16; guard++) {
    path.unshift(node.label);
    node = node.parent === null ? undefined : prop.values[node.parent];
  }
  return path.join(' › ');
}

const values = (plan: Plan, property: PropertyId, ids: readonly ValueId[]) => ids.map((id) => valueLabel(plan, property, id)).join(', ');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * One change, in words, without who made it: "set Size on “Tax engine” to M
 * (was S)". `titleOf` names a card the plan no longer has, from history.
 */
export function describeChange(change: Change, plan: Plan, titleOf: (id: ItemId) => string | undefined = () => undefined): string {
  const card = (id: ItemId | null) => (id === null ? 'the top level' : quote(plan.items[id]?.title ?? titleOf(id) ?? 'a deleted card'));
  const propertyName = (id: PropertyId) => plan.properties[id]?.name ?? 'a deleted property';
  const inside = (w?: ItemId[]) => (w && w.length > 0 ? `, and ${plural(w.length, 'card')} inside` : '');
  switch (change.kind) {
    case 'added':
      return `added ${card(change.item)}`;
    case 'deleted':
      return `deleted ${quote(change.title)}${inside(change.with)}`;
    case 'restored':
      return `restored ${quote(change.title)}${inside(change.with)}`;
    case 'renamed':
      return `renamed ${quote(change.from)} to ${quote(change.to)}`;
    case 'described':
      return `edited the description of ${card(change.item)}`;
    case 'values': {
      const name = propertyName(change.property);
      if (change.to.length === 0) return `cleared ${name} on ${card(change.item)} (was ${values(plan, change.property, change.from)})`;
      const was = change.from.length > 0 ? ` (was ${values(plan, change.property, change.from)})` : '';
      return `set ${name} on ${card(change.item)} to ${values(plan, change.property, change.to)}${was}`;
    }
    case 'group':
      return change.to === null ? `moved ${card(change.item)} out of ${card(change.from)}` : `put ${card(change.item)} inside ${card(change.to)}`;
    case 'sequence':
      return `moved ${card(change.item)} in the sequence`;
    case 'linked':
      return change.related ? `related ${card(change.from)} and ${card(change.to)}` : `linked ${card(change.from)} before ${card(change.to)}`;
    case 'unlinked':
      return change.related
        ? `removed the related link between ${card(change.from)} and ${card(change.to)}`
        : `removed the link from ${card(change.from)} to ${card(change.to)}`;
    case 'property':
      if (change.op === 'renamed') return `renamed the property ${quote(change.was ?? '')} to ${quote(change.name)}`;
      return `${change.op} the property ${quote(change.name)}`;
    case 'value': {
      const name = propertyName(change.property);
      if (change.op === 'added') return `added ${quote(change.label)} to ${name}`;
      if (change.op === 'deleted') return `deleted ${quote(change.label)} from ${name}`;
      if (change.op === 'renamed') return `renamed ${quote(change.was ?? '')} to ${quote(change.label)} in ${name}`;
      return `moved ${quote(change.label)} in ${name}`;
    }
  }
}

/** The title a card had, from the changes that last named it: for cards the plan no longer has. */
export function titlesFrom(changes: Iterable<Change>): Map<ItemId, string> {
  const titles = new Map<ItemId, string>();
  for (const change of changes) {
    if (change.kind === 'added' || change.kind === 'deleted' || change.kind === 'restored') titles.set(change.item, change.title);
    else if (change.kind === 'renamed') titles.set(change.item, change.to);
  }
  return titles;
}
