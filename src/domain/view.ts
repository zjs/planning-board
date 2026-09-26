import { ancestorAtLevel, valuesAtLevel } from './hierarchy.ts';
import type { Item, ItemId, Plan, PropertyId } from './model.ts';
import { compareOrderKeys, itemValues } from './model.ts';
import { gapKeys } from './sequence.ts';
import { childrenOf } from './tree.ts';

/** One axis of a view: a property at one level of its hierarchy. */
export interface AxisSpec {
  property: PropertyId;
  /** Hierarchy level, 0 = top. Ignored for sequence. */
  level: number;
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
    if (key !== null) keys.add(key);
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
  return valuesAtLevel(property, axis.level).map((node) => ({ key: node.id, label: node.label }));
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

/**
 * Lay out one level of the plan for a view: the top-level items, or the
 * children of the card zoomed into. Deeper cards stay inside their group.
 */
export function layoutView(plan: Plan, view: ViewSpec): ViewLayout {
  const items = childrenOf(plan, view.root ?? null)
    .map((id) => plan.items[id]!)
    .sort(compareItems);
  const columns = axisLanes(plan, view.x, items);
  const rows = axisLanes(plan, view.y, items);
  const columnIndex = new Map(columns.map((lane, i) => [lane.key, i]));
  const rowIndex = new Map(rows.map((lane, i) => [lane.key, i]));
  const cells: CardRef[][][] = rows.map(() => columns.map(() => []));
  const holding: Holding = { rows: rows.map(() => []), columns: columns.map(() => []), corner: [] };

  for (const item of items) {
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
