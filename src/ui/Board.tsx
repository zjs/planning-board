import { memo, useLayoutEffect, useMemo, useRef, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { badgeProperties, cardAttributes, type CardAttribute } from '../domain/attributes.ts';
import { levelWeight } from '../domain/builtins.ts';
import { ancestorAtLevel, valuesAtLevel } from '../domain/hierarchy.ts';
import { itemValues, SYSTEM, type ItemId, type Plan } from '../domain/model.ts';
import type { DropTarget } from '../domain/move.ts';
import { childCounts } from '../domain/tree.ts';
import { allCopies, type Band, type CardRef, type Lane, type ViewLayout, type ViewSpec } from '../domain/view.ts';
import type { Found } from '../domain/finding.ts';
import type { Mismatches } from '../domain/mismatches.ts';
import { Card, DraftCard, type CommitHow } from './Card.tsx';
import { DependencyLines, type DrawnLine } from './DependencyLines.tsx';
import { isCellTarget, isIntoTarget, type BoardTarget } from './useCardDrag.ts';

interface Props {
  plan: Plan;
  view: ViewSpec;
  layout: ViewLayout;
  xLabel: string;
  yLabel: string;
  /** Header of each axis's holding lane, such as "No quarter". */
  xNone: string;
  yNone: string;
  /** Header of a parent's own lane on a nested axis, such as "No component". */
  xParentNone: string;
  yParentNone: string;
  /** Show holding-lane cards as one-line chips. */
  compact: boolean;
  onCompactChange: (compact: boolean) => void;
  /** The copy being dragged, if any. */
  lifted: CardRef | null;
  /** What the dragged card is over. Kept referentially stable by the drag hook. */
  target: BoardTarget | null;
  onCardPointerDown: (e: PointerEvent<HTMLElement>, card: CardRef, title: string, draggable?: boolean) => void;
  /** Item to highlight after a drop. */
  justMoved: ItemId | null;
  /** The viewer's selected items. */
  selected: ReadonlySet<ItemId>;
  /** A title being typed: a new card at a spot, or a rename of one copy. */
  editing: Editing | null;
  onCardDoubleClick: (card: CardRef) => void;
  /** The child count on a group card, which expands it. */
  onCardExpand: (card: CardRef) => void;
  /** Double-click on empty space in a cell or holding lane. */
  onSpotDoubleClick: (spot: DropTarget) => void;
  onCommitEdit: (title: string, how: CommitHow) => void;
  onCancelEdit: () => void;
  /** A press on the board outside any card, which clears the selection. */
  onBackgroundPointerDown: () => void;
  /** Group mismatch markers (requirements 13, 18). */
  mismatches: Mismatches;
  /** Fold or unfold a band on a nested axis (ADR 0013). */
  onBandToggle: (which: 'x' | 'y', key: string) => void;
  /** ⇧-click on a lane or band header: select every card in lanes `start` up to `end` (Q47). */
  onSelectLanes: (which: 'x' | 'y', start: number, end: number) => void;
  /** ⇧-click on a card's badge: select every card on the board with that value (Q47). */
  onSelectMatching: (property: string, value: string) => void;
  /** The level each axis shows, such as "component", for a collapsed lane's "4 components". */
  levelNames: { x: string; y: string };
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Dependency lines to draw (requirement 15). */
  lines: readonly DrawnLine[];
  /** Cards whose copies are joined and outlined: the hovered and selected ones with several (Q45). */
  copyFocus: readonly ItemId[];
  /** The card under the pointer, for its focus lines (Q39). */
  onHover: (id: ItemId | null) => void;
  onLineClick: (line: DrawnLine) => void;
  /** What's being found (Q50): cards that don't match dim. Null when nothing is typed. */
  found: Found | null;
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

const NONE: readonly string[] = [];

const sameCopy = (a: CardRef, b: CardRef) => a.itemId === b.itemId && a.x === b.x && a.y === b.y;

/**
 * A title being typed: a new card at a spot, or a rename. `chain` counts the
 * new cards typed one after another (Q51), so each gets a fresh field.
 */
export type Editing = { kind: 'new'; spot: DropTarget; chain?: number } | { kind: 'rename'; card: CardRef };

/**
 * Which copy shows the rename field: the one asked for, or, if a pivot
 * moved it, the item's first copy on the board.
 */
function renameCopy(layout: ViewLayout, editing: Editing | null): CardRef | null {
  if (editing?.kind !== 'rename') return null;
  const copies = allCopies(layout).filter((c) => c.itemId === editing.card.itemId && !c.via);
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
 * One row of column bands at a band level: each band once, spanning its
 * lanes, and null for a lane no band at that level covers.
 */
function bandCells(bands: Band[], depth: number, lanes: number): (Band | null)[] {
  const out: (Band | null)[] = [];
  for (let i = 0; i < lanes; ) {
    const band = bands.find((b) => b.depth === depth && b.start === i);
    out.push(band ?? null);
    i = band ? band.end : i + 1;
  }
  return out;
}

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
  xParentNone,
  yParentNone,
  compact,
  onCompactChange,
  lifted,
  target,
  onCardPointerDown,
  justMoved,
  scrollRef,
  lines,
  copyFocus,
  onHover,
  onLineClick,
  selected,
  editing,
  onCardDoubleClick,
  onCardExpand,
  onSpotDoubleClick,
  onCommitEdit,
  onCancelEdit,
  onBackgroundPointerDown,
  onBandToggle,
  onSelectLanes,
  onSelectMatching,
  levelNames,
  mismatches,
  found,
}: Props) {
  /**
   * A lane header. On a nested axis, a parent's own lane reads "No
   * component", and a folded one says how much it holds; clicking that
   * unfolds it, a bigger target than the band's ▸ (ADR 0013).
   */
  const laneHeader = (which: 'x' | 'y', lane: Lane) => {
    if (lane.kind === 'parent') return <span className="lane-note">{which === 'x' ? xParentNone : yParentNone}</span>;
    if (lane.kind === 'collapsed') {
      const n = lane.inner ?? 0;
      return (
        <button
          type="button"
          className="lane-unfold"
          onClick={() => onBandToggle(which, lane.key)}
          title={`Unfold ${lane.label ?? ''}: show each of its lanes`}
        >
          {`${n} ${levelNames[which]}${n === 1 ? '' : 's'}`} ▸
        </button>
      );
    }
    return lane.label;
  };
  /** A band's header: its name and a ▾ that folds it, or a ▸ that unfolds it. */
  const bandHeader = (which: 'x' | 'y', band: Band) => (
    <button
      type="button"
      className="band-head band-toggle"
      aria-expanded={!band.collapsed}
      aria-label={`${band.collapsed ? 'Unfold' : 'Fold'} ${band.label}`}
      title={band.collapsed ? `Show each of ${band.label}'s lanes` : `Fold ${band.label} into one lane`}
      onClick={() => onBandToggle(which, band.key)}
    >
      <span aria-hidden="true">{band.collapsed ? '▸' : '▾'}</span> <span>{band.label}</span>
    </button>
  );
  /** ⇧-click anywhere on a header selects its lanes' cards, before the click can fold or unfold. */
  const selectOnShift = (which: 'x' | 'y', start: number, end: number) => (e: MouseEvent<HTMLElement>) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    onSelectLanes(which, start, end);
  };
  const boardRef = useRef<HTMLDivElement>(null);
  // A new card's field stays in view as the cards typed before it arrive and push it down (Q51).
  const typingNew = editing?.kind === 'new';
  useLayoutEffect(() => {
    if (typingNew) boardRef.current?.querySelector('.card.draft')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [typingNew, layout]);
  const renaming = renameCopy(layout, editing);
  const isDraftSpot = (row: string | null, column: string | null) =>
    editing?.kind === 'new' && editing.spot.x === column && editing.spot.y === row;
  const draft = (
    <DraftCard key={`draft-${editing?.kind === 'new' ? (editing.chain ?? 0) : 0}`} onCommit={onCommitEdit} onCancel={onCancelEdit} />
  );
  const counts = useMemo(() => childCounts(plan), [plan]);
  const areas = useMemo(() => areaIndexes(plan), [plan]);
  const weights = useMemo(
    () => new Map(Object.values(plan.items).map((item) => [item.id, levelWeight(plan, item)])),
    [plan],
  );
  const attributes = useMemo(() => {
    const properties = badgeProperties(plan);
    const out = new Map<ItemId, CardAttribute[]>();
    for (const item of Object.values(plan.items)) out.set(item.id, cardAttributes(plan, item, view, properties));
    return out;
  }, [plan, view]);
  // Each group whose children share the board gets its own tone for their chips and edges (Q33).
  const tones = useMemo(() => {
    const out = new Map<ItemId, number>();
    for (const ref of allCopies(layout)) if (ref.parent !== undefined && !out.has(ref.parent)) out.set(ref.parent, out.size % 6);
    return out;
  }, [layout]);
  const renderCard = (ref: CardRef, chip = false, frame?: CardRef) => {
    const item = plan.items[ref.itemId]!;
    const tone = ref.parent === undefined ? undefined : tones.get(ref.parent);
    const foldedMatches = found?.inside.get(ref.itemId);
    return (
      <Card
        key={`${frame ? `${frame.itemId}>` : ''}${ref.itemId}|${ref.x}|${ref.y}|${ref.via ?? ''}`}
        parentChip={tone === undefined ? undefined : { title: plan.items[ref.parent!]?.title ?? '', tone }}
        item={item}
        compact={chip}
        childCount={counts.get(ref.itemId) ?? 0}
        areaIndex={areas.get(ref.itemId) ?? null}
        levelWeight={weights.get(ref.itemId) ?? 0}
        attributes={attributes.get(ref.itemId) ?? []}
        selected={selected.has(ref.itemId)}
        lifted={lifted !== null && sameCopy(lifted, ref)}
        nestTarget={isIntoTarget(target) && target.into === ref.itemId}
        copyFocus={!ref.via && copyFocus.includes(ref.itemId)}
        justMoved={justMoved === ref.itemId}
        editing={renaming !== null && sameCopy(renaming, ref)}
        viaChildren={ref.via === 'children'}
        mismatches={mismatches.onCard.get(ref.itemId) ?? NONE}
        mismatchesInside={mismatches.inside.get(ref.itemId) ?? NONE}
        dimmed={found !== null && !found.shown.has(ref.itemId) && foldedMatches === undefined}
        foundInside={foldedMatches?.map((id) => plan.items[id]?.title ?? '')}
        // A faded copy isn't the group's own value, so it can be clicked but not dragged (Q16).
        onPointerDown={(e) => onCardPointerDown(e, ref, item.title, ref.via !== 'children')}
        // A card in a frame isn't on the board's level: double-click expands its group, like the frame's header.
        onDoubleClick={() => onCardDoubleClick(frame ?? ref)}
        onExpand={(counts.get(ref.itemId) ?? 0) > 0 ? () => onCardExpand(ref) : undefined}
        onSelectMatching={onSelectMatching}
        onRename={onCommitEdit}
        onCancelEdit={onCancelEdit}
      />
    );
  };

  /**
   * A collapsed group in a cell only its children reach (Q33): its faded
   * copy as a header, framing the real cards that put it there. Those can be
   * dragged, and dragging one changes that card.
   */
  const renderFrame = (ref: CardRef) => (
    <div key={`frame|${ref.itemId}|${ref.x}|${ref.y}`} className="frame" data-frame={ref.itemId}>
      {renderCard(ref)}
      {(ref.inner ?? []).map((inner) => renderCard(inner, false, ref))}
    </div>
  );

  const columnTracks = tracks(layout.columns, layout.gaps.x);
  const rowTracks = tracks(layout.rows, layout.gaps.y);
  const noLanes = (lanes: Lane[], gaps: string[] | null) => lanes.length === 0 && gaps === null;
  const empty = noLanes(layout.columns, layout.gaps.x) || noLanes(layout.rows, layout.gaps.y);
  // A lone gap (no sequence columns yet) is full width, so there's somewhere obvious to drop.
  const gapSize = (lanes: Lane[]) => (lanes.length === 0 ? 'minmax(var(--column-min), 1fr)' : 'var(--gap-size)');
  // Band tracks for nested axes (ADR 0012): a column per level of row bands, a row per level of column bands.
  const depths = (bands: Band[]) => (bands.length === 0 ? 0 : Math.max(...bands.map((b) => b.depth)) + 1);
  const yDepth = depths(layout.bands.y);
  const xDepth = depths(layout.bands.x);
  const gridTemplateColumns = [
    ...Array.from({ length: yDepth }, () => 'var(--band-width)'),
    'var(--row-header)',
    ...(columnTracks.length === 0
      ? ['minmax(var(--column-min), 1fr)']
      : columnTracks.map((t) =>
          // A gap being typed into opens up to a column's width, so the new card has room.
          t.kind === 'lane' || (editing?.kind === 'new' && editing.spot.x === t.key)
            ? 'minmax(var(--column-min), 1fr)'
            : gapSize(layout.columns),
        )),
    'var(--holding-width)',
  ].join(' ');

  const isTarget = (row: string | null, column: string | null) =>
    isCellTarget(target) && target.x === column && target.y === row;
  // Sequence lanes stay unnumbered even for screen readers (requirement 6).
  const trackName = (t: Track, axis: string) =>
    t.kind === 'gap' ? `new ${axis.toLowerCase()} position` : (t.lane.label ?? `${axis} column`);

  const cell = (row: Track, column: Track): ReactNode => {
    const rowKey = trackKey(row);
    const columnKey = trackKey(column);
    const isGap = row.kind === 'gap' || column.kind === 'gap';
    // With no sequence lanes yet, the single gap is a full-size cell, so there's somewhere obvious to drop.
    const lone = isGap && (row.kind === 'gap' ? layout.rows.length === 0 : layout.columns.length === 0);
    const parentLane = (t: Track, lanes: Lane[]) => t.kind === 'lane' && lanes[t.index]!.kind === 'parent';
    const classes = [
      'cell',
      (parentLane(row, layout.rows) || parentLane(column, layout.columns)) && 'parent-lane',
      isGap && !lone && 'gap',
      isGap && !lone && row.kind === 'gap' && 'gap-row',
      lone && 'lone-gap',
      isTarget(rowKey, columnKey) && 'drop-target',
      isDraftSpot(rowKey, columnKey) && 'drafting',
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
          layout.cells[row.index]![column.index]!.map((ref) => (ref.via ? renderFrame(ref) : renderCard(ref)))}
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

  const holdingHead = (
    <>
      <span>{xNone}</span>
      <span className="holding-toggle" role="group" aria-label="Show holding cards as">
        <button type="button" aria-pressed={!compact} onClick={() => onCompactChange(false)}>
          Cards
        </button>
        <button type="button" aria-pressed={compact} onClick={() => onCompactChange(true)}>
          Chips
        </button>
      </span>
    </>
  );

  /** Row bands that start at this row, one per band level; each spans its rows (ADR 0012). */
  const rowBandCells = (index: number): ReactNode[] =>
    Array.from({ length: yDepth }, (_, depth) => {
      const band = layout.bands.y.find((b) => b.depth === depth && b.start <= index && index < b.end);
      const left = { left: `calc(var(--band-width) * ${depth})` };
      if (!band) return <div key={`yb-${depth}-${index}`} className="band band-y empty" style={left} />;
      if (band.start !== index) return null;
      return (
        <div
          key={`yb-${band.key}`}
          className={band.collapsed ? 'band band-y collapsed' : 'band band-y'}
          data-band={band.key}
          style={{ ...left, gridRow: `span ${band.end - band.start}` }}
          onClickCapture={selectOnShift('y', band.start, band.end)}
        >
          {bandHeader('y', band)}
        </div>
      );
    }).filter((cell) => cell !== null);

  const backgroundPress = (e: PointerEvent<HTMLDivElement>) => {
    if (!(e.target as Element).closest('.card, button, textarea')) onBackgroundPointerDown();
  };
  // Double-clicking empty space makes a card there. In a gap between
  // sequence columns, that's a card in a new column of its own.
  const spotDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const el = e.target as Element;
    if (el.closest('.card, button, textarea')) return;
    const spot = el.closest<HTMLElement>('[data-drop="cell"]');
    if (!spot) return;
    onSpotDoubleClick({ x: spot.dataset.column ?? null, y: spot.dataset.row ?? null });
  };

  return (
    <div className="board-wrap">
      <div
        className="board-scroll"
        ref={scrollRef}
        onPointerDown={backgroundPress}
        onDoubleClick={spotDoubleClick}
        onPointerOver={(e) => onHover((e.target as Element).closest<HTMLElement>('.card')?.dataset.item ?? null)}
        onPointerLeave={() => onHover(null)}
      >
        <div
          className={['board', layout.rows.length === 0 && 'no-rows', layout.columns.length === 0 && 'no-columns']
            .filter(Boolean)
            .join(' ')}
          ref={boardRef}
          style={{ gridTemplateColumns }}
          data-testid="board"
        >
          {(lines.length > 0 || copyFocus.length > 0) && <DependencyLines
              lines={lines}
              copies={copyFocus}
              board={boardRef}
              scroller={scrollRef}
              layoutKey={layout}
              onLineClick={onLineClick}
            />}
          <div className="corner" style={{ gridRow: `span ${xDepth + 1}`, gridColumn: `span ${yDepth + 1}` }}>
            <span className="axis-name y">{yLabel} ↓</span>
            <span className="axis-name x">{xLabel} →</span>
          </div>
          {Array.from({ length: xDepth }, (_, depth) => [
            ...bandCells(layout.bands.x, depth, layout.columns.length).map((b, i) =>
              b === null ? (
                <div key={`xb-${depth}-${i}`} className="band band-x empty" style={{ top: `calc(var(--band-height) * ${depth})` }} />
              ) : (
                <div
                  key={`xb-${b.key}`}
                  className={b.collapsed ? 'band band-x collapsed' : 'band band-x'}
                  data-band={b.key}
                  style={{ gridColumn: `span ${b.end - b.start}`, top: `calc(var(--band-height) * ${depth})` }}
                  onClickCapture={selectOnShift('x', b.start, b.end)}
                >
                  {bandHeader('x', b)}
                </div>
              ),
            ),
            depth === 0 && <div key="holding-head" className="holding-head" style={{ gridRow: `span ${xDepth + 1}` }}>{holdingHead}</div>,
          ])}
          {columnTracks.map((t) =>
            t.kind === 'lane' ? (
              <div
                key={t.lane.key}
                className={t.lane.kind ? `column-header lane-${t.lane.kind}` : 'column-header'}
                data-column={t.lane.key}
                style={xDepth > 0 ? { top: `calc(var(--band-height) * ${xDepth})` } : undefined}
                onClickCapture={selectOnShift('x', t.index, t.index + 1)}
              >
                {laneHeader('x', t.lane)}
              </div>
            ) : (
              <div key={t.key} className="column-header gap" />
            ),
          )}
          {xDepth === 0 && <div className="holding-head">{holdingHead}</div>}
          {empty && (
            <div className="empty-note">
              {Object.keys(plan.items).length === 0 ? (
                <>No cards yet. Double-click anywhere to add one, and press Enter to add the next.</>
              ) : (
                <>
                  No cards have a {(noLanes(layout.columns, layout.gaps.x) ? xLabel : yLabel).toLowerCase()} value yet.
                  They're all in the holding lanes.
                </>
              )}
            </div>
          )}
          {/* Rows render even with no columns, so their holding lanes (and cards) still show. */}
          {rowTracks.map((row) => [
            ...(row.kind === 'lane' ? rowBandCells(row.index) : []),
            row.kind === 'lane' ? (
              <div
                key={`h-${row.lane.key}`}
                className={row.lane.kind ? `row-header lane-${row.lane.kind}` : 'row-header'}
                data-row={row.lane.key}
                style={yDepth > 0 ? { left: `calc(var(--band-width) * ${yDepth})` } : undefined}
                onClickCapture={selectOnShift('y', row.index, row.index + 1)}
              >
                {laneHeader('y', row.lane)}
              </div>
            ) : (
              <div key={`h-${row.key}`} className={layout.rows.length === 0 ? 'row-header' : 'row-header gap-row'} />
            ),
            ...(columnTracks.length === 0
              ? [<div key={`c-${trackKey(row)}`} className="cell" />]
              : columnTracks.map((column) => cell(row, column))),
            holdingCell(row, null),
          ])}
          <div className="holding-row-header" style={yDepth > 0 ? { gridColumn: `span ${yDepth + 1}` } : undefined}>
            {yNone}
          </div>
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
