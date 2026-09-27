import { ancestorAtLevel, isWithin, valuesAtLevel } from './hierarchy.ts';
import type { Item, ItemId, Plan, PropertyId, ValueId } from './model.ts';
import { compareOrderKeys, itemValues } from './model.ts';
import { gapKeys } from './sequence.ts';
import { childrenOf, topLevelItems } from './tree.ts';

/** One axis of a view: a property at one level of its hierarchy. */
export interface AxisSpec {
  property: PropertyId;
  /** Hierarchy level, 0 = top. Ignored for sequence. */
  level: number;
  /**
   * Lane zoom (requirement 7, ADR 0008): only this value's descendants at
   * `level` become lanes, and cards with no value inside it are hidden
   * (questions.md Q18). Cards with exactly this value, but nothing more
   * precise, wait in the holding lane.
   */
  within?: ValueId | null;
}

export interface ViewSpec {
  x: AxisSpec;
  y: AxisSpec;
  /**
   * The card zoomed into (requirement 12, ADR 0008): the view shows only
   * its children. Null or absent for the top level.
   */
  root?: ItemId | null;
}

/** A column or row. `key` is a ValueId, or an OrderKey on the sequence axis. */
export interface Lane {
  key: string;
  /** Null on the sequence axis, which is never labeled (requirement 6). */
  label: string | null;
}

/**
 * One rendered copy of a card. A card with several values on an axis gets
 * one copy per matching lane; `x` and `y` say which lanes this copy is in,
 * so a drag knows which value it is moving. Null means the card has no value
 * on that axis, and the copy sits in that axis's holding lane.
 */
export interface CardRef {
  itemId: ItemId;
  x: string | null;
  y: string | null;
  /**
   * A faded copy of a collapsed group in a cell only its children reach
   * (requirement 13, Q16). It can't be dragged: it isn't the group's own value.
   */
  via?: 'children';
}

export interface Holding {
  rows: CardRef[][];
  columns: CardRef[][];
  corner: CardRef[];
}

export interface ViewLayout {
  columns: Lane[];
  rows: Lane[];
  /** cells[row][column] */
  cells: CardRef[][][];
  /**
   * Cards missing a value on an axis (requirement 5; questions.md Q10), in
   * holding lanes around the board's edge. `rows[i]` holds cards in row i
   * with no column (x null); `columns[j]` holds cards in column j with no row
   * (y null); `corner` holds cards with neither. A multi-valued card appears
   * once in each matching lane, as it does in cells.
   */
  holding: Holding;
  /**
   * For a sequence axis, the keys of the droppable gaps around its lanes:
   * gaps[i] sits just before lanes[i], and the last one after the last lane.
   * Null for other axes, whose lanes are fixed.
   */
  gaps: { x: string[] | null; y: string[] | null };
}

/** The lanes an item falls into on one axis, de-duplicated, in no particular order. */
export function axisKeys(plan: Plan, item: Item, axis: AxisSpec): string[] {
  const property = plan.properties[axis.property];
  if (!property) return [];
  if (property.kind === 'sequence') return item.sequence === null ? [] : [item.sequence];
  const keys = new Set<string>();
  for (const value of itemValues(item, property.id)) {
    const key = ancestorAtLevel(property, value, axis.level);
    if (key !== null && (!axis.within || isWithin(property, key, axis.within))) keys.add(key);
  }
  return [...keys];
}

function axisLanes(plan: Plan, axis: AxisSpec, items: Item[]): Lane[] {
  const property = plan.properties[axis.property];
  if (!property) return [];
  if (property.kind === 'sequence') {
    // Columns are the distinct keys in use; an unused position has no column.
    const keys = new Set(items.flatMap((item) => (item.sequence === null ? [] : [item.sequence])));
    return [...keys].sort(compareOrderKeys).map((key) => ({ key, label: null }));
  }
  // Every value at the level gets a lane, so empty lanes stay droppable.
  const within = axis.within;
  return valuesAtLevel(property, axis.level)
    .filter((node) => !within || isWithin(property, node.id, within))
    .map((node) => ({ key: node.id, label: node.label }));
}

/** Stable order within a cell: sequence, then title, then ID. Unsequenced items go last. */
function compareItems(a: Item, b: Item): number {
  if (a.sequence !== b.sequence) {
    if (a.sequence === null) return 1;
    if (b.sequence === null) return -1;
    return compareOrderKeys(a.sequence, b.sequence);
  }
  return a.title.localeCompare(b.title) || compareOrderKeys(a.id, b.id);
}

/** Parent to children, consistent with the tree helpers: orphans and cycle members belong to no one. */
function childrenIndex(plan: Plan): Map<ItemId, Item[]> {
  const surfaced = new Set(topLevelItems(plan));
  const out = new Map<ItemId, Item[]>();
  for (const item of Object.values(plan.items)) {
    if (item.parent === null || surfaced.has(item.id)) continue;
    out.set(item.parent, [...(out.get(item.parent) ?? []), item]);
  }
  return out;
}

/**
 * Cells a collapsed group reaches only through its descendants, at any
 * depth. A card with no value on an axis is taken to sit where its group
 * does, since children refine their group's estimate. The group's own
 * cells are left out: it already has a solid copy there.
 */
function rolledUpCells(
  group: Item,
  kids: Map<ItemId, Item[]>,
  xsOf: (item: Item) => string[],
  ysOf: (item: Item) => string[],
  /** Whether the group has solid copies here at all (it doesn't outside a lane zoom's scope). */
  solid: boolean,
): { x: string; y: string }[] {
  if (!kids.has(group.id)) return [];
  const ownXs = xsOf(group);
  const ownYs = ysOf(group);
  const own = new Set(solid ? ownYs.flatMap((y) => ownXs.map((x) => `${x}|${y}`)) : []);
  const found = new Map<string, { x: string; y: string }>();
  const walk = (parent: Item, xs: string[], ys: string[], seen: Set<ItemId>) => {
    for (const child of kids.get(parent.id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      const cxs = xsOf(child).length > 0 ? xsOf(child) : xs;
      const cys = ysOf(child).length > 0 ? ysOf(child) : ys;
      for (const y of cys) {
        for (const x of cxs) {
          const key = `${x}|${y}`;
          if (!own.has(key)) found.set(key, { x, y });
        }
      }
      walk(child, cxs, cys, seen);
    }
  };
  walk(group, ownXs, ownYs, new Set([group.id]));
  return [...found.values()];
}

/** Whether an item has any value inside a lane-zoomed axis's value (Q18: the rest are hidden). */
export function inZoomedScope(plan: Plan, item: Item, axis: AxisSpec): boolean {
  const property = plan.properties[axis.property];
  const within: ValueId | null | undefined = axis.within;
  if (!within || property?.kind !== 'select') return true;
  return itemValues(item, property.id).some((v) => isWithin(property, v, within));
}

/**
 * Lay out one level of the plan for a view: the top-level items, or the
 * children of the card zoomed into, within any lane zoom. Deeper cards stay inside their group.
 */
export function layoutView(plan: Plan, view: ViewSpec): ViewLayout {
  const items = childrenOf(plan, view.root ?? null)
    .map((id) => plan.items[id]!)
    .sort(compareItems);
  const inScope = (item: Item) => inZoomedScope(plan, item, view.x) && inZoomedScope(plan, item, view.y);
  const scoped = items.filter(inScope);
  const columns = axisLanes(plan, view.x, scoped);
  const rows = axisLanes(plan, view.y, scoped);
  const columnIndex = new Map(columns.map((lane, i) => [lane.key, i]));
  const rowIndex = new Map(rows.map((lane, i) => [lane.key, i]));
  const cells: CardRef[][][] = rows.map(() => columns.map(() => []));
  const holding: Holding = { rows: rows.map(() => []), columns: columns.map(() => []), corner: [] };

  for (const item of items) {
    // Out of a lane zoom's scope, a card shows only through its children's faded copies.
    if (!inScope(item)) continue;
    const xs = axisKeys(plan, item, view.x).filter((key) => columnIndex.has(key));
    const ys = axisKeys(plan, item, view.y).filter((key) => rowIndex.has(key));
    if (xs.length === 0 && ys.length === 0) {
      holding.corner.push({ itemId: item.id, x: null, y: null });
    } else if (xs.length === 0) {
      for (const y of ys) holding.rows[rowIndex.get(y)!]!.push({ itemId: item.id, x: null, y });
    } else if (ys.length === 0) {
      for (const x of xs) holding.columns[columnIndex.get(x)!]!.push({ itemId: item.id, x, y: null });
    } else {
      for (const y of ys) {
        for (const x of xs) {
          cells[rowIndex.get(y)!]![columnIndex.get(x)!]!.push({ itemId: item.id, x, y });
        }
      }
    }
  }

  // Faded "via children" copies (Q16), after each cell's own cards.
  const inCells = (axis: AxisSpec, index: Map<string, number>) => (item: Item) =>
    axisKeys(plan, item, axis).filter((key) => index.has(key));
  const kids = childrenIndex(plan);
  for (const item of items) {
    const reached = rolledUpCells(item, kids, inCells(view.x, columnIndex), inCells(view.y, rowIndex), inScope(item));
    for (const { x, y } of reached) {
      cells[rowIndex.get(y)!]![columnIndex.get(x)!]!.push({ itemId: item.id, x, y, via: 'children' });
    }
  }

  const allKeys = Object.values(plan.items).flatMap((item) => (item.sequence === null ? [] : [item.sequence]));
  const gapsFor = (axis: AxisSpec, lanes: Lane[]) =>
    plan.properties[axis.property]?.kind === 'sequence'
      ? gapKeys(
          lanes.map((lane) => lane.key),
          allKeys,
        )
      : null;
  return { columns, rows, cells, holding, gaps: { x: gapsFor(view.x, columns), y: gapsFor(view.y, rows) } };
}
