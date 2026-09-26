import { memo, useMemo, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { cardAttributes } from '../domain/attributes.ts';
import { ancestorAtLevel, valuesAtLevel } from '../domain/hierarchy.ts';
import { itemValues, SYSTEM, type ItemId, type Plan } from '../domain/model.ts';
import type { DropTarget } from '../domain/move.ts';
import { childCounts } from '../domain/tree.ts';
import type { CardRef, Lane, ViewLayout, ViewSpec } from '../domain/view.ts';
import { Card } from './Card.tsx';

interface Props {
  plan: Plan;
  view: ViewSpec;
  layout: ViewLayout;
  xLabel: string;
  yLabel: string;
  /** The copy being dragged, if any. */
  lifted: CardRef | null;
  /** What the dragged card is over. Kept referentially stable by the drag hook. */
  target: DropTarget | null;
  onCardPointerDown: (e: PointerEvent<HTMLElement>, card: CardRef, title: string) => void;
  /** Item to highlight after a drop. */
  justMoved: ItemId | null;
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

/**
 * One grid track: a lane, or on a sequence axis, the droppable gap before a
 * lane or after the last (questions.md Q8).
 */
type Track = { kind: 'lane'; lane: Lane; index: number } | { kind: 'gap'; key: string };

function tracks(lanes: Lane[], gaps: string[] | null): Track[] {
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
  lifted,
  target,
  onCardPointerDown,
  justMoved,
  scrollRef,
}: Props) {
  const counts = useMemo(() => childCounts(plan), [plan]);
  const areas = useMemo(() => areaIndexes(plan), [plan]);
  const renderCard = (ref: CardRef) => {
    const item = plan.items[ref.itemId]!;
    return (
      <Card
        key={`${ref.itemId}|${ref.x}|${ref.y}`}
        item={item}
        childCount={counts.get(ref.itemId) ?? 0}
        areaIndex={areas.get(ref.itemId) ?? null}
        attributes={cardAttributes(plan, item, view)}
        lifted={lifted !== null && sameCopy(lifted, ref)}
        justMoved={justMoved === ref.itemId}
        onPointerDown={(e) => onCardPointerDown(e, ref, item.title)}
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
  ].join(' ');

  const isTarget = (row: string, column: string) => target?.kind === 'cell' && target.x === column && target.y === row;
  // Sequence lanes stay unnumbered even for screen readers (requirement 6).
  const trackName = (t: Track, axis: string) =>
    t.kind === 'gap' ? `new ${axis.toLowerCase()} position` : (t.lane.label ?? `${axis} column`);

  const cell = (row: Track, column: Track): ReactNode => {
    const rowKey = trackKey(row);
    const columnKey = trackKey(column);
    const isGap = row.kind === 'gap' || column.kind === 'gap';
    const classes = ['cell', isGap && 'gap', isGap && row.kind === 'gap' && 'gap-row', isTarget(rowKey, columnKey) && 'drop-target'];
    return (
      <div
        key={`${rowKey}|${columnKey}`}
        className={classes.filter(Boolean).join(' ')}
        data-drop="cell"
        data-row={rowKey}
        data-column={columnKey}
        aria-label={`${trackName(row, yLabel)}, ${trackName(column, xLabel)}`}
      >
        {row.kind === 'lane' && column.kind === 'lane' && layout.cells[row.index]![column.index]!.map(renderCard)}
      </div>
    );
  };

  const from = lifted;
  const fromLane = (lanes: Lane[], key: string | null | undefined) => lanes.find((l) => l.key === key)?.label;
  const clearZone = (axis: 'x' | 'y') => {
    const label = axis === 'x' ? xLabel : yLabel;
    const lane = fromLane(axis === 'x' ? layout.columns : layout.rows, from?.[axis]);
    const active = target?.kind === 'clear' && target.axis === axis;
    return (
      <div className={active ? 'clear-zone drop-target' : 'clear-zone'} data-drop={`clear-${axis}`}>
        {lane ? (
          <>
            Remove <strong>{lane}</strong>
          </>
        ) : (
          <>Clear {label.toLowerCase()} position</>
        )}
      </div>
    );
  };

  return (
    <div className="board-wrap">
      <div className="board-scroll" ref={scrollRef}>
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
          {!empty &&
            rowTracks.map((row) => [
              row.kind === 'lane' ? (
                <div key={`h-${row.lane.key}`} className="row-header" data-row={row.lane.key}>
                  {row.lane.label}
                </div>
              ) : (
                <div key={`h-${row.key}`} className="row-header gap-row" />
              ),
              ...columnTracks.map((column) => cell(row, column)),
            ])}
          {empty && (
            <div className="empty-note">
              No cards have a {(noLanes(layout.columns, layout.gaps.x) ? xLabel : yLabel).toLowerCase()} value yet.
              They're all in the holding area.
            </div>
          )}
        </div>
      </div>
      <aside className="holding" aria-label="Holding area" data-testid="holding">
        <h2>
          Holding area <span className="count">{layout.holding.length}</span>
        </h2>
        {from && from.x !== null ? (
          <div className="clear-zones">
            {clearZone('x')}
            {clearZone('y')}
          </div>
        ) : (
          <p className="hint">Cards missing a {xLabel.toLowerCase()} or {yLabel.toLowerCase()} value.</p>
        )}
        <div className="holding-cards">{layout.holding.map(renderCard)}</div>
      </aside>
    </div>
  );
});
