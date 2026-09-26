import { useMemo } from 'react';
import { cardAttributes } from '../domain/attributes.ts';
import type { ItemId, Plan } from '../domain/model.ts';
import { ancestry } from '../domain/tree.ts';

interface Props {
  plan: Plan;
  /** The card zoomed into. */
  root: ItemId;
  /** The drag is over this breadcrumb segment (a parent, or null for the plan). */
  target: ItemId | null | undefined;
  /** A card is being dragged, so segments show as drop targets. */
  dragging: boolean;
  /** Nothing inside the zoomed card yet. */
  empty: boolean;
  onZoomTo: (id: ItemId | null) => void;
}

/** Shows every value, with nothing hidden by an axis: the zoom header lists the group's own values (Q19). */
const NO_AXES = { x: { property: '', level: 0 }, y: { property: '', level: 0 } };

/**
 * Where you are when zoomed into a card (requirement 12): a breadcrumb back
 * to the top, and the card's own values. Each segment is also a drop target
 * that moves a card out to that level.
 */
export function ZoomBar({ plan, root, target, dragging, empty, onZoomTo }: Props) {
  const chain = useMemo(() => ancestry(plan, root), [plan, root]);
  const item = plan.items[root];
  const values = useMemo(() => (item ? cardAttributes(plan, item, NO_AXES) : []), [plan, item]);
  if (!item) return null;
  // Every level above the current one, starting with the whole plan.
  const levels: { id: ItemId | null; label: string }[] = [
    { id: null, label: 'Plan' },
    ...chain.slice(0, -1).map((id) => ({ id, label: plan.items[id]?.title ?? '' })),
  ];
  return (
    <nav className={dragging ? 'zoom-bar dragging' : 'zoom-bar'} aria-label="Zoom" data-testid="zoom-bar">
      <ol className="crumbs">
        {levels.map((level) => (
          <li key={level.id ?? 'plan'}>
            <button
              type="button"
              className={target === level.id ? 'crumb drop-target' : 'crumb'}
              data-drop="parent"
              data-parent={level.id ?? ''}
              onClick={() => onZoomTo(level.id)}
              title={dragging ? `Move out to ${level.label}` : `Zoom out to ${level.label}`}
            >
              {level.label}
            </button>
          </li>
        ))}
        <li aria-current="page" className="crumb-current">
          {item.title}
        </li>
      </ol>
      {values.length > 0 && (
        <ul className="zoom-values" aria-label={`${item.title}'s own values`}>
          {values.map((v) => (
            <li key={v.property} className="attr" title={v.title}>
              {v.title}
            </li>
          ))}
        </ul>
      )}
      {empty && <span className="zoom-hint">Nothing inside yet. Double-click a cell to add the first card.</span>}
      {dragging && <span className="zoom-hint">Drop on a level to move the card out</span>}
    </nav>
  );
}
