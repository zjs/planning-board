import { pathTo } from './hierarchy.ts';
import type { Item, Plan, PropertyId } from './model.ts';
import { itemValues, SIZE, SYSTEM, TIME } from './model.ts';
import type { ViewSpec } from './view.ts';

/** A compact badge on a card for a property that isn't one of the view's axes (requirement 4). */
export interface CardAttribute {
  property: PropertyId;
  /** Short text shown on the card. */
  text: string;
  /** Full text for a tooltip. */
  title: string;
}

/** Built-ins first in a fixed order, then custom properties by name. */
const PREFERRED: PropertyId[] = [SIZE, TIME, SYSTEM];

export function cardAttributes(plan: Plan, item: Item, view: ViewSpec): CardAttribute[] {
  const onAxis = new Set([view.x.property, view.y.property]);
  const properties = Object.values(plan.properties)
    .filter((p) => p.kind === 'select' && !onAxis.has(p.id))
    .sort((a, b) => {
      const rank = (id: PropertyId) => (PREFERRED.includes(id) ? PREFERRED.indexOf(id) : PREFERRED.length);
      return rank(a.id) - rank(b.id) || a.name.localeCompare(b.name);
    });

  const out: CardAttribute[] = [];
  for (const property of properties) {
    if (property.kind !== 'select') continue;
    const paths = itemValues(item, property.id)
      .map((v) => pathTo(property, v))
      .filter((path) => path.length > 0);
    if (paths.length === 0) continue;
    const leaves = paths.map((path) => path[path.length - 1]!.label);
    const text = leaves.length > 1 ? `${leaves[0]!} +${leaves.length - 1}` : leaves[0]!;
    const title = `${property.name}: ${paths.map((path) => path.map((n) => n.label).join(' › ')).join(', ')}`;
    out.push({ property: property.id, text, title });
  }
  return out;
}
