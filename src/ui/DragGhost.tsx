import type { DragState } from './useCardDrag.ts';

/** The card following the pointer. Never a hit-test target itself. */
export function DragGhost({ drag, canAdd }: { drag: DragState; canAdd: boolean }) {
  const adding = canAdd && drag.mode === 'add' && drag.target?.kind === 'cell';
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
