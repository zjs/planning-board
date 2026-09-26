import { isParentTarget, type DragState } from './useCardDrag.ts';

/** The card following the pointer. Never a hit-test target itself. */
export function DragGhost({ drag, addAxes }: { drag: DragState; addAxes: { x: boolean; y: boolean } }) {
  // Adding needs a multi-valued axis whose target is a lane; a holding lane always removes.
  const { target } = drag;
  const adding =
    drag.mode === 'add' &&
    target !== null &&
    !isParentTarget(target) &&
    ((addAxes.x && target.x !== null) || (addAxes.y && target.y !== null));
  return (
    <div
      className={drag.target ? 'drag-ghost over-target' : 'drag-ghost'}
      style={{ left: drag.x - drag.grabX, top: drag.y - drag.grabY, width: drag.width }}
      aria-hidden="true"
    >
      <span className="card-title">{drag.title}</span>
      {adding && <span className="add-badge">+ add</span>}
    </div>
  );
}
