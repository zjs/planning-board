import { compareTreeOrder, depthOf, pathTo } from './hierarchy.ts';
import type { Item, Plan, PropertyId, SelectProperty } from './model.ts';
import { itemValues, SIZE, SYSTEM, TIME } from './model.ts';
import type { AxisSpec, ViewSpec } from './view.ts';

/** A compact badge on a card, for a value the view's axes don't already show (requirement 4). */
export interface CardAttribute {
  property: PropertyId;
  /** Short text shown on the card. */
  text: string;
  /** Full text for a tooltip. */
  title: string;
}

/** Built-ins first in a fixed order, then custom properties by name. */
const PREFERRED: PropertyId[] = [SIZE, TIME, SYSTEM];
const rank = (id: PropertyId) => {
  const i = PREFERRED.indexOf(id);
  return i < 0 ? PREFERRED.length : i;
};

/** Properties that can have badges, in badge order. Compute once per plan. */
export function badgeProperties(plan: Plan): SelectProperty[] {
  return Object.values(plan.properties)
    .filter((p): p is SelectProperty => p.kind === 'select')
    .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
}

/**
 * Badges for one card. A property on an axis gets a badge only for values
 * more precise than the axis shows (a release in a quarter view, a component
 * in an area view), so a drag can't quietly change something you can't see.
 */
export function cardAttributes(
  plan: Plan,
  item: Item,
  view: ViewSpec,
  properties: SelectProperty[] = badgeProperties(plan),
): CardAttribute[] {
  const axisFor = (id: PropertyId): AxisSpec | undefined =>
    view.x.property === id ? view.x : view.y.property === id ? view.y : undefined;
  const out: CardAttribute[] = [];
  for (const property of properties) {
    const axis = axisFor(property.id);
    const values = itemValues(item, property.id)
      .filter((v) => depthOf(property, v) >= 0 && (!axis || depthOf(property, v) > axis.level))
      .sort((a, b) => compareTreeOrder(property, a, b));
    if (values.length === 0) continue;
    const paths = values.map((v) => pathTo(property, v));
    const leaves = paths.map((path) => path[path.length - 1]!.label);
    const text = leaves.length > 1 ? `${leaves[0]!} +${leaves.length - 1}` : leaves[0]!;
    const title = `${property.name}: ${paths.map((path) => path.map((n) => n.label).join(' › ')).join(', ')}`;
    out.push({ property: property.id, text, title });
  }
  return out;
}
