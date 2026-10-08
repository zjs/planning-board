import { isCellTarget, isIntoTarget, type DragState } from './useCardDrag.ts';

/** The card following the pointer. Never a hit-test target itself. */
export function DragGhost({
  drag,
  addAxes,
  titleOf,
  where = null,
  hint = null,
  warning = null,
  count = 1,
}: {
  drag: DragState;
  addAxes: { x: boolean; y: boolean };
  /** A card's title, for "Put inside …". */
  titleOf: (id: string) => string;
  /** What dropping on the cell under the pointer gives the card: "Q2 2027 · Billing" (Q54). */
  where?: string | null;
  /** A hint for a drop that replaces a value on an axis that holds several: "Alt adds instead". */
  hint?: string | null;
  /** Someone else is dragging this card too (Q60): "Ada is moving this too". */
  warning?: string | null;
  /** How many cards move together: the selection, when the dragged card is in it (Q48). */
  count?: number;
}) {
  // Adding needs a multi-valued axis whose target is a lane; a holding lane always removes.
  const { target } = drag;
  const adding =
    drag.mode === 'add' &&
    isCellTarget(target) &&
    ((addAxes.x && target.x !== null) || (addAxes.y && target.y !== null));
  return (
    <div
      className={drag.target ? 'drag-ghost over-target' : 'drag-ghost'}
      style={{ left: drag.x - drag.grabX, top: drag.y - drag.grabY, width: drag.width }}
      aria-hidden="true"
      data-testid="drag-ghost"
    >
      <span className="card-title">{drag.title}</span>
      {count > 1 && <span className="ghost-count">+{count - 1} more</span>}
      {adding && <span className="add-badge">+ add</span>}
      {warning && (
        <span className="drag-warning" data-testid="drag-warning">
          {warning}
        </span>
      )}
      {isIntoTarget(target) ? (
        <span className="nest-badge">Put inside “{titleOf(target.into)}”</span>
      ) : (
        where && (
          <span className="ghost-notes" data-testid="drop-where">
            <span className="drop-where">→ {where}</span>
            {hint && !adding && <span className="drop-hint">{hint}</span>}
          </span>
        )
      )}
    </div>
  );
}
