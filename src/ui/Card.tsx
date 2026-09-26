import type { PointerEvent } from 'react';
import type { Item } from '../domain/model.ts';

interface Props {
  item: Item;
  childCount: number;
  /** Index into the area palette, or null for untagged items. */
  areaIndex: number | null;
  /** This copy is the one being dragged. */
  lifted?: boolean;
  /** Briefly highlighted after a drop, so you can see where it landed. */
  justMoved?: boolean;
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
}

export function Card({ item, childCount, areaIndex, lifted, justMoved, onPointerDown }: Props) {
  const isGroup = childCount > 0;
  const classes = ['card', isGroup && 'group', lifted && 'lifted', justMoved && 'just-moved'].filter(Boolean);
  return (
    <div
      className={classes.join(' ')}
      data-item={item.id}
      data-area={areaIndex ?? 'none'}
      title={item.title}
      onPointerDown={onPointerDown}
    >
      <span className="card-title">{item.title}</span>
      {isGroup && (
        <span className="child-count" aria-label={`Group of ${childCount} items`} title={`Group of ${childCount} items`}>
          {childCount}
        </span>
      )}
    </div>
  );
}
