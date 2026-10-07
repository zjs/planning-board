// The color on each card's edge is its area (the first top-level System value), so a card is recognizable in any
// view. These helpers give the board and the view bar the same palette, so a header and its key match the cards.

import { ancestorAtLevel, valuesAtLevel } from '../domain/hierarchy.ts';
import { itemValues, SYSTEM, type ItemId, type Plan, type ValueId } from '../domain/model.ts';

/** How many area colors there are (`--area-0` to `--area-7`); later areas reuse them in turn. */
export const AREA_COLORS = 8;

/** Each top-level System area's palette index, in their order. */
export function areaPalette(plan: Plan): Map<ValueId, number> {
  const system = plan.properties[SYSTEM];
  if (system?.kind !== 'select') return new Map();
  return new Map(valuesAtLevel(system, 0).map((node, i) => [node.id, i % AREA_COLORS]));
}

/** The areas, in order, with their palette index and name: the view bar's key. */
export function areaKey(plan: Plan): { id: ValueId; label: string; index: number }[] {
  const system = plan.properties[SYSTEM];
  if (system?.kind !== 'select') return [];
  return valuesAtLevel(system, 0).map((node, i) => ({ id: node.id, label: node.label, index: i % AREA_COLORS }));
}

/**
 * Each card's area color, by its first area, and a tooltip naming it: "Area: Billing", or "Area: Billing,
 * and 1 more" for a card in several, since only the first one colors it.
 */
export function cardAreas(plan: Plan): Map<ItemId, { index: number; title: string }> {
  const out = new Map<ItemId, { index: number; title: string }>();
  const system = plan.properties[SYSTEM];
  if (system?.kind !== 'select') return out;
  const palette = areaPalette(plan);
  for (const item of Object.values(plan.items)) {
    const areas = [...new Set(itemValues(item, SYSTEM).map((v) => ancestorAtLevel(system, v, 0)).filter((a) => a !== null))];
    const first = areas[0];
    const index = first === undefined ? undefined : palette.get(first);
    if (first === undefined || index === undefined) continue;
    const name = system.values[first]?.label ?? '';
    out.set(item.id, { index, title: areas.length > 1 ? `Area: ${name}, and ${areas.length - 1} more` : `Area: ${name}` });
  }
  return out;
}
