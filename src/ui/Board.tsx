import { useMemo, type PointerEvent, type RefObject } from 'react';
import { ancestorAtLevel, valuesAtLevel } from '../domain/hierarchy.ts';
import { itemValues, SYSTEM, type ItemId, type Plan } from '../domain/model.ts';
import { childCounts } from '../domain/tree.ts';
import type { CardRef, Lane, ViewLayout } from '../domain/view.ts';
import { Card } from './Card.tsx';
import type { DragState } from './useCardDrag.ts';

interface Props {
  plan: Plan;
  layout: ViewLayout;
  xLabel: string;
  yLabel: string;
  drag: DragState | null;
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

export function Board({ plan, layout, xLabel, yLabel, drag, onCardPointerDown, justMoved, scrollRef }: Props) {
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
        lifted={drag !== null && sameCopy(drag.card, ref)}
        justMoved={justMoved === ref.itemId}
        onPointerDown={(e) => onCardPointerDown(e, ref, item.title)}
      />
    );
  };
  // Sequence lanes stay unnumbered even for screen readers (requirement 6).
  const laneName = (lane: Lane, axis: string) => lane.label ?? `${axis} column`;
  const empty = layout.columns.length === 0 || layout.rows.length === 0;
  const target = drag?.target;
  const isTarget = (row: string, column: string) => target?.kind === 'cell' && target.x === column && target.y === row;

  const from = drag?.card;
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
        <div
          className="board"
          style={{
            gridTemplateColumns: `var(--row-header) repeat(${Math.max(1, layout.columns.length)}, minmax(var(--column-min), 1fr))`,
          }}
          data-testid="board"
        >
          <div className="corner">
            <span className="axis-name y">{yLabel} ↓</span>
            <span className="axis-name x">{xLabel} →</span>
          </div>
          {layout.columns.map((column) => (
            <div key={column.key} className="column-header" data-column={column.key}>
              {column.label}
            </div>
          ))}
          {!empty &&
            layout.rows.map((row, r) => [
              <div key={`h-${row.key}`} className="row-header" data-row={row.key}>
                {row.label}
              </div>,
              ...layout.columns.map((column, c) => (
                <div
                  key={`${row.key}|${column.key}`}
                  className={isTarget(row.key, column.key) ? 'cell drop-target' : 'cell'}
                  data-drop="cell"
                  data-row={row.key}
                  data-column={column.key}
                  aria-label={`${laneName(row, yLabel)}, ${laneName(column, xLabel)}`}
                >
                  {layout.cells[r]![c]!.map(renderCard)}
                </div>
              )),
            ])}
          {empty && (
            <div className="empty-note">
              No cards have a {(layout.columns.length === 0 ? xLabel : yLabel).toLowerCase()} value yet. They're all in
              the holding area.
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
}
