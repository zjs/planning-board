import { memo, useMemo, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { badgeProperties, cardAttributes, type CardAttribute } from '../domain/attributes.ts';
import { ancestorAtLevel, valuesAtLevel } from '../domain/hierarchy.ts';
import { itemValues, SYSTEM, type ItemId, type Plan } from '../domain/model.ts';
import type { DropTarget } from '../domain/move.ts';
import { childCounts } from '../domain/tree.ts';
import type { CardRef, Lane, ViewLayout, ViewSpec } from '../domain/view.ts';
import { Card, DraftCard } from './Card.tsx';
import { isParentTarget, type BoardTarget } from './useCardDrag.ts';

interface Props {
  plan: Plan;
  view: ViewSpec;
  layout: ViewLayout;
  xLabel: string;
  yLabel: string;
  /** Header of each axis's holding lane, such as "No quarter". */
  xNone: string;
  yNone: string;
  /** Show holding-lane cards as one-line chips. */
  compact: boolean;
  onCompactChange: (compact: boolean) => void;
  /** The copy being dragged, if any. */
  lifted: CardRef | null;
  /** What the dragged card is over. Kept referentially stable by the drag hook. */
  target: BoardTarget | null;
  onCardPointerDown: (e: PointerEvent<HTMLElement>, card: CardRef, title: string) => void;
  /** Item to highlight after a drop. */
  justMoved: ItemId | null;
  /** The viewer's selected items. */
  selected: ReadonlySet<ItemId>;
  /** A title being typed: a new card at a spot, or a rename of one copy. */
  editing: Editing | null;
  onCardDoubleClick: (card: CardRef) => void;
  /** Double-click on empty space in a cell or holding lane. */
  onSpotDoubleClick: (spot: DropTarget) => void;
  onCommitEdit: (title: string) => void;
  onCancelEdit: () => void;
  /** A press on the board outside any card, which clears the selection. */
  onBackgroundPointerDown: () => void;
  scrollRef: RefObject<HTMLDivElement | null>;
}

/** Palette index by first top-level system area, so cards keep their color across pivots. */
function areaIndexes(plan: Plan): Map<ItemId, number> {
  const out = new Map<ItemId, number>();
  const system = plan.properties[SYSTEM];
  if (system?.kind !== 'select') return out;
  const areas = new Map(valuesAtLevel(system, 0).map((node, i) => [node.id, i]));
  for (const item of Object.values(plan.items)) {
    const first = itemValues(item, SYSTEM)[0];
    const index = areas.get(first === undefined ? '' : (ancestorAtLevel(system, first, 0) ?? ''));
    if (index !== undefined) out.set(item.id, index);
  }
  return out;
}

const sameCopy = (a: CardRef, b: CardRef) => a.itemId === b.itemId && a.x === b.x && a.y === b.y;

export type Editing = { kind: 'new'; spot: DropTarget } | { kind: 'rename'; card: CardRef };

/** Every rendered copy, in board order. */
function allCopies(layout: ViewLayout): CardRef[] {
  return [
    ...layout.cells.flat(2),
    ...layout.holding.rows.flat(),
    ...layout.holding.columns.flat(),
    ...layout.holding.corner,
  ];
}

/**
 * Which copy shows the rename field: the one asked for, or, if a pivot
 * moved it, the item's first copy on the board.
 */
function renameCopy(layout: ViewLayout, editing: Editing | null): CardRef | null {
  if (editing?.kind !== 'rename') return null;
  const copies = allCopies(layout).filter((c) => c.itemId === editing.card.itemId);
  return copies.find((c) => sameCopy(c, editing.card)) ?? copies[0] ?? null;
}

/**
 * One grid track: a lane, or on a sequence axis, the droppable gap before a
 * lane or after the last (questions.md Q8).
 */
type Track = { kind: 'lane'; lane: Lane; index: number } | { kind: 'gap'; key: string };

function tracks(lanes: Lane[], layoutGaps: string[] | null): Track[] {
  // One gap per lane plus one at the end; anything else would misplace drops, so show no gaps.
  const gaps = layoutGaps?.length === lanes.length + 1 ? layoutGaps : null;
  const out: Track[] = [];
  lanes.forEach((lane, index) => {
    if (gaps) out.push({ kind: 'gap', key: gaps[index]! });
    out.push({ kind: 'lane', lane, index });
  });
  if (gaps) out.push({ kind: 'gap', key: gaps[lanes.length]! });
  return out;
}

const trackKey = (t: Track) => (t.kind === 'lane' ? t.lane.key : t.key);

/**
 * Memoized: during a drag only the ghost moves, and the board re-renders
 * only when the drop target changes.
 */
export const Board = memo(function Board({
  plan,
  view,
  layout,
  xLabel,
  yLabel,
  xNone,
  yNone,
  compact,
  onCompactChange,
  lifted,
  target,
  onCardPointerDown,
  justMoved,
  scrollRef,
  selected,
  editing,
  onCardDoubleClick,
  onSpotDoubleClick,
  onCommitEdit,
  onCancelEdit,
  onBackgroundPointerDown,
}: Props) {
  const renaming = renameCopy(layout, editing);
  const isDraftSpot = (row: string | null, column: string | null) =>
    editing?.kind === 'new' && editing.spot.x === column && editing.spot.y === row;
  const draft = <DraftCard key="draft" onCommit={onCommitEdit} onCancel={onCancelEdit} />;
  const counts = useMemo(() => childCounts(plan), [plan]);
  const areas = useMemo(() => areaIndexes(plan), [plan]);
  const attributes = useMemo(() => {
    const properties = badgeProperties(plan);
    const out = new Map<ItemId, CardAttribute[]>();
    for (const item of Object.values(plan.items)) out.set(item.id, cardAttributes(plan, item, view, properties));
    return out;
  }, [plan, view]);
  const renderCard = (ref: CardRef, chip = false) => {
    const item = plan.items[ref.itemId]!;
    return (
      <Card
        key={`${ref.itemId}|${ref.x}|${ref.y}`}
        item={item}
        compact={chip}
        childCount={counts.get(ref.itemId) ?? 0}
        areaIndex={areas.get(ref.itemId) ?? null}
        attributes={attributes.get(ref.itemId) ?? []}
        selected={selected.has(ref.itemId)}
        lifted={lifted !== null && sameCopy(lifted, ref)}
        justMoved={justMoved === ref.itemId}
        editing={renaming !== null && sameCopy(renaming, ref)}
        onPointerDown={(e) => onCardPointerDown(e, ref, item.title)}
        onDoubleClick={() => onCardDoubleClick(ref)}
        onRename={onCommitEdit}
        onCancelEdit={onCancelEdit}
      />
    );
  };

  const columnTracks = tracks(layout.columns, layout.gaps.x);
  const rowTracks = tracks(layout.rows, layout.gaps.y);
  const noLanes = (lanes: Lane[], gaps: string[] | null) => lanes.length === 0 && gaps === null;
  const empty = noLanes(layout.columns, layout.gaps.x) || noLanes(layout.rows, layout.gaps.y);
  // A lone gap (no sequence columns yet) is full width, so there's somewhere obvious to drop.
  const gapSize = (lanes: Lane[]) => (lanes.length === 0 ? 'minmax(var(--column-min), 1fr)' : 'var(--gap-size)');
  const gridTemplateColumns = [
    'var(--row-header)',
    ...(columnTracks.length === 0
      ? ['minmax(var(--column-min), 1fr)']
      : columnTracks.map((t) => (t.kind === 'lane' ? 'minmax(var(--column-min), 1fr)' : gapSize(layout.columns)))),
    'var(--holding-width)',
  ].join(' ');

  const isTarget = (row: string | null, column: string | null) =>
    target !== null && !isParentTarget(target) && target.x === column && target.y === row;
  // Sequence lanes stay unnumbered even for screen readers (requirement 6).
  const trackName = (t: Track, axis: string) =>
    t.kind === 'gap' ? `new ${axis.toLowerCase()} position` : (t.lane.label ?? `${axis} column`);

  const cell = (row: Track, column: Track): ReactNode => {
    const rowKey = trackKey(row);
    const columnKey = trackKey(column);
    const isGap = row.kind === 'gap' || column.kind === 'gap';
    // With no sequence lanes yet, the single gap is a full-size cell, so there's somewhere obvious to drop.
    const lone = isGap && (row.kind === 'gap' ? layout.rows.length === 0 : layout.columns.length === 0);
    const classes = [
      'cell',
      isGap && !lone && 'gap',
      isGap && !lone && row.kind === 'gap' && 'gap-row',
      lone && 'lone-gap',
      isTarget(rowKey, columnKey) && 'drop-target',
    ];
    return (
      <div
        key={`${rowKey}|${columnKey}`}
        className={classes.filter(Boolean).join(' ')}
        data-drop="cell"
        data-row={rowKey}
        data-column={columnKey}
        aria-label={`${trackName(row, yLabel)}, ${trackName(column, xLabel)}`}
      >
        {row.kind === 'lane' &&
          column.kind === 'lane' &&
          layout.cells[row.index]![column.index]!.map((ref) => renderCard(ref))}
        {isDraftSpot(rowKey, columnKey) && draft}
        {lone && <span className="lone-hint">Drop a card here to start the sequence</span>}
      </div>
    );
  };

  /**
   * A holding lane: at the end of a row (cards with that row but no column),
   * under a column (that column but no row), or the corner (neither).
   * The missing axis has no data attribute, which reads as null.
   */
  const holdingCell = (row: Track | null, column: Track | null): ReactNode => {
    const rowKey = row && trackKey(row);
    const columnKey = column && trackKey(column);
    const cards =
      row?.kind === 'lane'
        ? layout.holding.rows[row.index]!
        : column?.kind === 'lane'
          ? layout.holding.columns[column.index]!
          : row === null && column === null
            ? layout.holding.corner
            : [];
    const gapRow = row?.kind === 'gap' && layout.rows.length > 0;
    const gapColumn = column?.kind === 'gap' && layout.columns.length > 0;
    const classes = [
      'cell',
      'holding-cell',
      row === null ? 'holding-bottom' : 'holding-right',
      row === null && column === null && 'holding-corner',
      gapRow && 'gap gap-row',
      gapColumn && 'gap',
      isTarget(rowKey, columnKey) && 'drop-target',
    ];
    const rowName = row ? trackName(row, yLabel) : yNone;
    const columnName = column ? trackName(column, xLabel) : xNone;
    return (
      <div
        key={`holding|${rowKey}|${columnKey}`}
        className={classes.filter(Boolean).join(' ')}
        data-drop="cell"
        data-row={rowKey ?? undefined}
        data-column={columnKey ?? undefined}
        aria-label={`${rowName}, ${columnName}`}
      >
        {!gapRow && !gapColumn && (
          // The lane fills its grid row; this inner box caps the height and scrolls.
          <div className="holding-cards">
            {cards.length > 0 && <span className="holding-count">{cards.length}</span>}
            {cards.map((ref) => renderCard(ref, compact))}
            {isDraftSpot(rowKey, columnKey) && draft}
          </div>
        )}
      </div>
    );
  };

  const backgroundPress = (e: PointerEvent<HTMLDivElement>) => {
    if (!(e.target as Element).closest('.card, button, textarea')) onBackgroundPointerDown();
  };
  // Double-clicking empty space makes a card there. Not in the thin gaps
  // between sequence columns: make it in a column, then drag it into a gap.
  const spotDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const el = e.target as Element;
    if (el.closest('.card, button, textarea')) return;
    const spot = el.closest<HTMLElement>('[data-drop="cell"]');
    if (!spot || spot.classList.contains('gap')) return;
    onSpotDoubleClick({ x: spot.dataset.column ?? null, y: spot.dataset.row ?? null });
  };

  return (
    <div className="board-wrap">
      <div className="board-scroll" ref={scrollRef} onPointerDown={backgroundPress} onDoubleClick={spotDoubleClick}>
        <div className="board" style={{ gridTemplateColumns }} data-testid="board">
          <div className="corner">
            <span className="axis-name y">{yLabel} ↓</span>
            <span className="axis-name x">{xLabel} →</span>
          </div>
          {columnTracks.map((t) =>
            t.kind === 'lane' ? (
              <div key={t.lane.key} className="column-header" data-column={t.lane.key}>
                {t.lane.label}
              </div>
            ) : (
              <div key={t.key} className="column-header gap" />
            ),
          )}
          <div className="holding-head">
            <span>{xNone}</span>
            <span className="holding-toggle" role="group" aria-label="Show holding cards as">
              <button type="button" aria-pressed={!compact} onClick={() => onCompactChange(false)}>
                Cards
              </button>
              <button type="button" aria-pressed={compact} onClick={() => onCompactChange(true)}>
                Chips
              </button>
            </span>
          </div>
          {empty && (
            <div className="empty-note">
              No cards have a {(noLanes(layout.columns, layout.gaps.x) ? xLabel : yLabel).toLowerCase()} value yet.
              They're all in the holding lanes.
            </div>
          )}
          {/* Rows render even with no columns, so their holding lanes (and cards) still show. */}
          {rowTracks.map((row) => [
            row.kind === 'lane' ? (
              <div key={`h-${row.lane.key}`} className="row-header" data-row={row.lane.key}>
                {row.lane.label}
              </div>
            ) : (
              <div key={`h-${row.key}`} className={layout.rows.length === 0 ? 'row-header' : 'row-header gap-row'} />
            ),
            ...(columnTracks.length === 0
              ? [<div key={`c-${trackKey(row)}`} className="cell" />]
              : columnTracks.map((column) => cell(row, column))),
            holdingCell(row, null),
          ])}
          <div className="holding-row-header">{yNone}</div>
          {columnTracks.length === 0 ? (
            <div className="cell holding-bottom" />
          ) : (
            columnTracks.map((column) => holdingCell(null, column))
          )}
          {holdingCell(null, null)}
        </div>
      </div>
    </div>
  );
});
