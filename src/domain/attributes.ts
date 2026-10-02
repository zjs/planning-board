import { compareTreeOrder, depthOf, pathTo } from './hierarchy.ts';
import type { Item, Plan, PropertyId, SelectProperty, ValueId } from './model.ts';
import { itemValues, LEVEL, SIZE, SYSTEM, TIME } from './model.ts';
import { laneKeyOf, type AxisSpec, type ViewSpec } from './view.ts';

/** A compact badge on a card, for a value the view's axes don't already show (requirement 4). */
export interface CardAttribute {
  property: PropertyId;
  /** Short text shown on the card. */
  text: string;
  /** Full text for a tooltip. */
  title: string;
  /** The value the badge shows first, which ⇧-click selects every card with (Q47). */
  value: ValueId;
}

/** Built-ins first in a fixed order, then custom properties by name. */
const PREFERRED: PropertyId[] = [LEVEL, SIZE, TIME, SYSTEM];
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

/** A value on a nested axis that's in a collapsed parent's lane, so the board doesn't show it. */
const folded = (property: SelectProperty, axis: AxisSpec, value: string) =>
  axis.level > 0 && !axis.within && laneKeyOf(property, value, axis) !== value;

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
      // On a nested axis, a value inside a collapsed parent's lane gets a badge too (ADR 0012).
      .filter((v) => depthOf(property, v) >= 0 && (!axis || depthOf(property, v) > axis.level || folded(property, axis, v)))
      .sort((a, b) => compareTreeOrder(property, a, b));
    if (values.length === 0) continue;
    const paths = values.map((v) => pathTo(property, v));
    const leaves = paths.map((path) => path[path.length - 1]!.label);
    const text = leaves.length > 1 ? `${leaves[0]!} +${leaves.length - 1}` : leaves[0]!;
    const title = `${property.name}: ${paths.map((path) => path.map((n) => n.label).join(' › ')).join(', ')}`;
    out.push({ property: property.id, text, title, value: values[0]! });
  }
  return out;
}
