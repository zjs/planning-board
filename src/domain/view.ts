import { ancestorAtLevel, pathTo, valuesAtLevel } from './hierarchy.ts';
import type { Item, ItemId, Plan, PropertyId, SelectProperty, ValueId, ValueNode } from './model.ts';
import { compareOrderKeys, itemValues } from './model.ts';
import { gapKeys } from './sequence.ts';
import { childrenOf, topLevelItems } from './tree.ts';

/** One axis of a view: a property at one level of its hierarchy. */
export interface AxisSpec {
  property: PropertyId;
  /** Hierarchy level, 0 = top. Ignored for sequence. */
  level: number;
  /**
   * On a nested axis (ADR 0012), parent values collapsed into one lane
   * each. Viewer state, like the axes themselves.
   */
  collapsed?: readonly ValueId[];
}

export interface ViewSpec {
  x: AxisSpec;
  y: AxisSpec;
  /**
   * Groups expanded in place (Q33, ADR 0013): each one on the board shows
   * its children, framed with it (Q57). Applies at any depth, so an
   * expanded child group shows its own children too.
   */
  expanded?: readonly ItemId[];
}

/** A column or row. `key` is a ValueId, or an OrderKey on the sequence axis. */
export interface Lane {
  key: string;
  /** Null on the sequence axis, which is never labeled (requirement 6). */
  label: string | null;
  /**
   * On a nested axis (ADR 0012): `parent` is a parent's own lane, for cards
   * with the plain parent value ("Identity: no component"); `collapsed` is
   * a collapsed parent, holding everything inside it.
   */
  kind?: 'parent' | 'collapsed';
  /** For a collapsed lane, how many values at the axis level it holds. */
  inner?: number;
}

/** A parent value shown as a header across its lanes on a nested axis (ADR 0012). */
export interface Band {
  key: ValueId;
  label: string;
  /** The parent's level in its hierarchy: 0 for an area or a quarter. */
  depth: number;
  /** The lanes it spans: `start` up to, not including, `end`. */
  start: number;
  end: number;
  collapsed: boolean;
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
  /**
   * An expanded group's frame (Q57): the group's cards in this cell or
   * holding lane, under its header. Frames nest, three deep at most.
   */
  open?: true;
  /**
   * For an expanded group's frame, whether the group itself is placed here.
   * Its header is then the group's own card, which can be dragged; elsewhere
   * it's only a title.
   */
  own?: true;
  /**
   * For a frame nested deeper than three, the groups from the third level
   * down to this one, for a breadcrumb title ("API auth › Token rotation").
   */
  trail?: ItemId[];
  /**
   * The cards in a frame. For a faded copy, the cards inside the group that
   * put it in this cell (Q33), each draggable, with `x` and `y` its own lanes,
   * or null where it only has its group's value. For an expanded group's
   * frame, its cards and frames here, in cell order.
   */
  inner?: CardRef[];
}

/** How deep expanded groups' frames nest (Q57). Deeper groups get a breadcrumb title instead. */
export const FRAME_DEPTH = 3;

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
  /** Parent bands on a nested axis, outermost first (ADR 0012). Empty otherwise. */
  bands: { x: Band[]; y: Band[] };
}

/** An axis below its top level shows its parents as bands (ADR 0012). */
export function isNested(plan: Plan, axis: AxisSpec): boolean {
  return plan.properties[axis.property]?.kind === 'select' && axis.level > 0;
}

/**
 * The lane a value falls into on an axis. Normally its ancestor at the
 * axis level, or null if it's coarser than that. On a nested axis (ADR
 * 0012), a coarser value has its own lane, keyed by the value itself, and
 * a value inside a collapsed parent is in the parent's lane. Layout and
 * drops both use this, so they always agree on where a card is.
 */
export function laneKeyOf(property: SelectProperty, value: ValueId, axis: AxisSpec): ValueId | null {
  if (axis.level === 0) return ancestorAtLevel(property, value, axis.level);
  const path = pathTo(property, value);
  if (path.length === 0) return null;
  const collapsed = axis.collapsed ?? [];
  const folded = path.slice(0, axis.level).find((node) => collapsed.includes(node.id));
  return (folded ?? path[Math.min(axis.level, path.length - 1)]!).id;
}

/** The lanes an item falls into on one axis, de-duplicated, in no particular order. */
export function axisKeys(plan: Plan, item: Item, axis: AxisSpec): string[] {
  const property = plan.properties[axis.property];
  if (!property) return [];
  if (property.kind === 'sequence') return item.sequence === null ? [] : [item.sequence];
  const keys = new Set<string>();
  for (const value of itemValues(item, property.id)) {
    const key = laneKeyOf(property, value, axis);
    if (key !== null) keys.add(key);
  }
  return [...keys];
}

const childValues = (property: SelectProperty, parent: ValueId): ValueNode[] =>
  Object.values(property.values)
    .filter((node) => node.parent === parent)
    .sort((a, b) => compareOrderKeys(a.order, b.order) || compareOrderKeys(a.id, b.id));

/** Lanes and bands for a nested axis: each parent's children, then the parent's own lane (ADR 0012). */
function nestedLanes(property: SelectProperty, axis: AxisSpec): { lanes: Lane[]; bands: Band[] } {
  const lanes: Lane[] = [];
  const bands: Band[] = [];
  const collapsed = axis.collapsed ?? [];
  const below = (node: ValueNode, depth: number): number =>
    depth >= axis.level ? 1 : childValues(property, node.id).reduce((n, child) => n + below(child, depth + 1), 0);
  const visit = (node: ValueNode, depth: number) => {
    if (depth === axis.level) {
      lanes.push({ key: node.id, label: node.label });
      return;
    }
    const start = lanes.length;
    const band: Band = { key: node.id, label: node.label, depth, start, end: start, collapsed: collapsed.includes(node.id) };
    bands.push(band);
    if (band.collapsed) {
      lanes.push({ key: node.id, label: node.label, kind: 'collapsed', inner: below(node, depth) });
    } else {
      for (const child of childValues(property, node.id)) visit(child, depth + 1);
      lanes.push({ key: node.id, label: node.label, kind: 'parent' });
    }
    band.end = lanes.length;
  };
  for (const root of valuesAtLevel(property, 0)) visit(root, 0);
  // Outermost bands first, so each band row or column renders in one pass.
  bands.sort((a, b) => a.depth - b.depth || a.start - b.start);
  return { lanes, bands };
}

function axisLanes(plan: Plan, axis: AxisSpec, items: Item[]): { lanes: Lane[]; bands: Band[] } {
  const property = plan.properties[axis.property];
  if (!property) return { lanes: [], bands: [] };
  if (property.kind === 'sequence') {
    // Columns are the distinct keys in use; an unused position has no column.
    const keys = new Set(items.flatMap((item) => (item.sequence === null ? [] : [item.sequence])));
    return { lanes: [...keys].sort(compareOrderKeys).map((key) => ({ key, label: null })), bands: [] };
  }
  if (isNested(plan, axis)) return nestedLanes(property, axis);
  // Every value at the level gets a lane, so empty lanes stay droppable.
  return { lanes: valuesAtLevel(property, axis.level).map((node) => ({ key: node.id, label: node.label })), bands: [] };
}

/** The lane keys an axis shows, in board order. Sequence axes have none to list. */
export function laneOrder(plan: Plan, axis: AxisSpec): string[] {
  const property = plan.properties[axis.property];
  return property?.kind === 'select' ? axisLanes(plan, axis, []).lanes.map((lane) => lane.key) : [];
}

/**
 * Stable order within a cell: sequence, then the order cards were made in
 * (Q46), then title, then ID. Unsequenced items go last; cards from before
 * ranks existed go ahead of ranked ones, since they're older.
 */
function compareItems(a: Item, b: Item): number {
  if (a.sequence !== b.sequence) {
    if (a.sequence === null) return 1;
    if (b.sequence === null) return -1;
    return compareOrderKeys(a.sequence, b.sequence);
  }
  if (a.rank !== b.rank) {
    if (a.rank === undefined) return -1;
    if (b.rank === undefined) return 1;
    return compareOrderKeys(a.rank, b.rank);
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
): { x: string; y: string; inner: CardRef[] }[] {
  if (!kids.has(group.id)) return [];
  const ownXs = xsOf(group);
  const ownYs = ysOf(group);
  const own = new Set(ownYs.flatMap((y) => ownXs.map((x) => `${x}|${y}`)));
  const found = new Map<string, { x: string; y: string; inner: CardRef[] }>();
  // A card is in a cell's frame when it puts the group there and its own parent doesn't already (Q33).
  const walk = (parent: Item, xs: string[], ys: string[], above: Set<string>, seen: Set<ItemId>) => {
    for (const child of kids.get(parent.id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      const ownX = xsOf(child);
      const ownY = ysOf(child);
      const cxs = ownX.length > 0 ? ownX : xs;
      const cys = ownY.length > 0 ? ownY : ys;
      const keys = new Set<string>();
      for (const y of cys) {
        for (const x of cxs) {
          const key = `${x}|${y}`;
          keys.add(key);
          if (own.has(key)) continue;
          const cell = found.get(key) ?? { x, y, inner: [] };
          found.set(key, cell);
          if (!above.has(key)) {
            cell.inner.push({ itemId: child.id, x: ownX.length > 0 ? x : null, y: ownY.length > 0 ? y : null });
          }
        }
      }
      walk(child, cxs, cys, keys, seen);
    }
  };
  walk(group, ownXs, ownYs, own, new Set([group.id]));
  return [...found.values()];
}

/**
 * The cards a view shows: the top-level cards, and inside every expanded
 * group among them its children, at any depth (Q33). Deeper cards stay
 * inside their group. `open` lists the expanded groups on the board, which
 * show as frames (Q57), and `parentOf` the expanded group each card or
 * frame is shown inside.
 */
function viewItems(plan: Plan, view: ViewSpec): { items: Item[]; open: Item[]; parentOf: Map<ItemId, ItemId> } {
  const expanded = new Set(view.expanded ?? []);
  const items: Item[] = [];
  const open: Item[] = [];
  const parentOf = new Map<ItemId, ItemId>();
  const seen = new Set<ItemId>();
  const add = (id: ItemId, parent: ItemId | null) => {
    if (seen.has(id)) return;
    seen.add(id);
    if (parent !== null) parentOf.set(id, parent);
    const children = childrenOf(plan, id);
    if (expanded.has(id) && children.length > 0) {
      open.push(plan.items[id]!);
      for (const child of children) add(child, id);
      return;
    }
    items.push(plan.items[id]!);
  };
  for (const id of childrenOf(plan, null)) add(id, null);
  return { items: items.sort(compareItems), open, parentOf };
}

/**
 * Wraps one cell's or holding lane's cards in their expanded groups' frames
 * (Q57), nesting three deep; a deeper group's frame sits in the third, with
 * a breadcrumb trail. A frame goes where its first card would, so the cell
 * keeps its order. An expanded group's own copy becomes its frame's header.
 */
function framed(refs: CardRef[], parentOf: Map<ItemId, ItemId>, x: string | null, y: string | null): CardRef[] {
  const chainOf = (id: ItemId): ItemId[] => {
    const chain: ItemId[] = [];
    const seen = new Set<ItemId>([id]);
    for (let at = parentOf.get(id); at !== undefined && !seen.has(at); at = parentOf.get(at)) {
      seen.add(at);
      chain.unshift(at);
    }
    return chain;
  };
  const out: CardRef[] = [];
  const frames = new Map<string, CardRef>();
  for (const ref of refs) {
    const chain = ref.open ? [...chainOf(ref.itemId), ref.itemId] : chainOf(ref.itemId);
    const levels =
      chain.length <= FRAME_DEPTH
        ? chain.map((id) => [id])
        : [...chain.slice(0, FRAME_DEPTH - 1).map((id) => [id]), chain.slice(FRAME_DEPTH - 1)];
    let list = out;
    let path = '';
    let frame: CardRef | undefined;
    for (const level of levels) {
      const id = level[level.length - 1]!;
      path += `/${id}`;
      frame = frames.get(path);
      if (frame === undefined) {
        frame = { itemId: id, x, y, open: true, inner: [], ...(level.length > 1 ? { trail: level } : {}) };
        frames.set(path, frame);
        list.push(frame);
      }
      list = frame.inner!;
    }
    if (ref.open) {
      frame!.own = true;
      frame!.x = ref.x;
      frame!.y = ref.y;
    } else {
      list.push(ref);
    }
  }
  return out;
}

/**
 * A list of copies with expanded groups' frames opened up (Q57): the cards
 * inside them, and each group's own header where it's placed itself, marked
 * `open`. Faded copies stay as they are, with their framed cards.
 */
export function unwrap(refs: readonly CardRef[]): CardRef[] {
  return refs.flatMap((ref) =>
    ref.open
      ? [...(ref.own ? [{ itemId: ref.itemId, x: ref.x, y: ref.y, open: true as const, own: true as const }] : []), ...unwrap(ref.inner ?? [])]
      : [ref],
  );
}

/**
 * Whether a card inside `parent` (null for the top level) is on this view:
 * it's at the top level, or its group is expanded and itself on the view.
 * For deciding, after moving a card, whether it can stay selected.
 */
export function shownInside(plan: Plan, view: ViewSpec, parent: ItemId | null): boolean {
  const expanded = new Set(view.expanded ?? []);
  const seen = new Set<ItemId>();
  let current = parent;
  for (;;) {
    if (current === null) return true;
    if (seen.has(current) || !expanded.has(current)) return false;
    seen.add(current);
    current = plan.items[current]?.parent ?? null;
  }
}

export function layoutView(plan: Plan, view: ViewSpec): ViewLayout {
  const { items, open, parentOf } = viewItems(plan, view);
  const openIds = new Set(open.map((item) => item.id));
  // An expanded group is placed like a card, and its copy becomes its frame's header.
  const marked = (ref: CardRef): CardRef => (openIds.has(ref.itemId) ? { ...ref, open: true } : ref);
  const { lanes: columns, bands: xBands } = axisLanes(plan, view.x, items);
  const { lanes: rows, bands: yBands } = axisLanes(plan, view.y, items);
  const columnIndex = new Map(columns.map((lane, i) => [lane.key, i]));
  const rowIndex = new Map(rows.map((lane, i) => [lane.key, i]));
  const cells: CardRef[][][] = rows.map(() => columns.map(() => []));
  const holding: Holding = { rows: rows.map(() => []), columns: columns.map(() => []), corner: [] };

  for (const item of [...items, ...open].sort(compareItems)) {
    const xs = axisKeys(plan, item, view.x).filter((key) => columnIndex.has(key));
    const ys = axisKeys(plan, item, view.y).filter((key) => rowIndex.has(key));
    if (xs.length === 0 && ys.length === 0) {
      holding.corner.push(marked({ itemId: item.id, x: null, y: null }));
    } else if (xs.length === 0) {
      for (const y of ys) holding.rows[rowIndex.get(y)!]!.push(marked({ itemId: item.id, x: null, y }));
    } else if (ys.length === 0) {
      for (const x of xs) holding.columns[columnIndex.get(x)!]!.push(marked({ itemId: item.id, x, y: null }));
    } else {
      for (const y of ys) {
        for (const x of xs) {
          cells[rowIndex.get(y)!]![columnIndex.get(x)!]!.push(marked({ itemId: item.id, x, y }));
        }
      }
    }
  }

  // Faded "via children" copies (Q16), after each cell's own cards.
  const inCells = (axis: AxisSpec, index: Map<string, number>) => (item: Item) =>
    axisKeys(plan, item, axis).filter((key) => index.has(key));
  const kids = childrenIndex(plan);
  for (const item of items) {
    const reached = rolledUpCells(item, kids, inCells(view.x, columnIndex), inCells(view.y, rowIndex));
    for (const { x, y, inner } of reached) {
      cells[rowIndex.get(y)!]![columnIndex.get(x)!]!.push({ itemId: item.id, x, y, via: 'children', inner });
    }
  }

  // Expanded groups' frames (Q57), around their cards in each cell and holding lane.
  if (open.length > 0) {
    rows.forEach((row, i) => {
      columns.forEach((column, j) => {
        cells[i]![j] = framed(cells[i]![j]!, parentOf, column.key, row.key);
      });
      holding.rows[i] = framed(holding.rows[i]!, parentOf, null, row.key);
    });
    columns.forEach((column, j) => {
      holding.columns[j] = framed(holding.columns[j]!, parentOf, column.key, null);
    });
    holding.corner = framed(holding.corner, parentOf, null, null);
  }

  const allKeys = Object.values(plan.items).flatMap((item) => (item.sequence === null ? [] : [item.sequence]));
  const gapsFor = (axis: AxisSpec, lanes: Lane[]) =>
    plan.properties[axis.property]?.kind === 'sequence'
      ? gapKeys(
          lanes.map((lane) => lane.key),
          allKeys,
        )
      : null;
  return {
    columns,
    rows,
    cells,
    holding,
    gaps: { x: gapsFor(view.x, columns), y: gapsFor(view.y, rows) },
    bands: { x: xBands, y: yBands },
  };
}

/**
 * Every copy on the board, in board order: cells first, then the holding
 * lanes. Expanded groups' frames are opened up (`unwrap`); faded copies stay.
 */
export function allCopies(layout: ViewLayout): CardRef[] {
  return unwrap([
    ...layout.cells.flat(2),
    ...layout.holding.rows.flat(),
    ...layout.holding.columns.flat(),
    ...layout.holding.corner,
  ]);
}

/**
 * Where a card's first solid copy sits, as a spot to drop or create in, or
 * null if it isn't on the board. Typing cards one after another (Q51) uses
 * it: a card made in a gap between sequence columns starts a column, and
 * the next card goes in that column, not in another new one.
 */
export function cellOf(layout: ViewLayout, id: ItemId): { x: string | null; y: string | null } | null {
  const copy = allCopies(layout).find((ref) => ref.itemId === id && !ref.via);
  return copy ? { x: copy.x, y: copy.y } : null;
}
