import { useMemo } from 'react';
import { ancestorAtLevel, valuesAtLevel } from '../domain/hierarchy.ts';
import { itemValues, SYSTEM, type ItemId, type Plan } from '../domain/model.ts';
import { childCounts } from '../domain/tree.ts';
import type { CardRef, Lane, ViewLayout } from '../domain/view.ts';
import { Card } from './Card.tsx';

interface Props {
  plan: Plan;
  layout: ViewLayout;
  xLabel: string;
  yLabel: string;
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

export function Board({ plan, layout, xLabel, yLabel }: Props) {
  const counts = useMemo(() => childCounts(plan), [plan]);
  const areas = useMemo(() => areaIndexes(plan), [plan]);
  const renderCard = (ref: CardRef) => (
    <Card
      key={`${ref.itemId}|${ref.x}|${ref.y}`}
      item={plan.items[ref.itemId]!}
      childCount={counts.get(ref.itemId) ?? 0}
      areaIndex={areas.get(ref.itemId) ?? null}
    />
  );
  const laneName = (lane: Lane, axis: string, i: number) => lane.label ?? `${axis} position ${i + 1}`;

  return (
    <div className="board-wrap">
      <div className="board-scroll">
        <div
          className="board"
          style={{ gridTemplateColumns: `var(--row-header) repeat(${layout.columns.length}, minmax(var(--column-min), 1fr))` }}
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
          {layout.rows.map((row, r) => [
            <div key={`h-${row.key}`} className="row-header" data-row={row.key}>
              {row.label}
            </div>,
            ...layout.columns.map((column, c) => (
              <div
                key={`${row.key}|${column.key}`}
                className="cell"
                data-row={row.key}
                data-column={column.key}
                aria-label={`${laneName(row, yLabel, r)}, ${laneName(column, xLabel, c)}`}
              >
                {layout.cells[r]![c]!.map(renderCard)}
              </div>
            )),
          ])}
          {layout.columns.length === 0 && <div className="empty-note">No items have a value on this axis yet.</div>}
        </div>
      </div>
      <aside className="holding" aria-label="Holding area" data-testid="holding">
        <h2>
          Holding area <span className="count">{layout.holding.length}</span>
        </h2>
        <p className="hint">Cards missing a {xLabel.toLowerCase()} or {yLabel.toLowerCase()} value.</p>
        <div className="holding-cards">{layout.holding.map(renderCard)}</div>
      </aside>
    </div>
  );
}
