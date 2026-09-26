import type { PointerEvent } from 'react';
import type { CardAttribute } from '../domain/attributes.ts';
import type { Item } from '../domain/model.ts';

interface Props {
  item: Item;
  childCount: number;
  /** Index into the area palette, or null for untagged items. */
  areaIndex: number | null;
  /** Values of properties that aren't on an axis (requirement 4). */
  attributes: CardAttribute[];
  /** A one-line chip: title and child count only (holding lanes, when chosen). */
  compact?: boolean;
  /** This copy is the one being dragged. */
  lifted?: boolean;
  /** Briefly highlighted after a drop, so you can see where it landed. */
  justMoved?: boolean;
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
}

export function Card({ item, childCount, areaIndex, attributes, compact, lifted, justMoved, onPointerDown }: Props) {
  const isGroup = childCount > 0;
  const classes = ['card', compact && 'chip', isGroup && 'group', lifted && 'lifted', justMoved && 'just-moved'].filter(
    Boolean,
  );
  return (
    <div
      className={classes.join(' ')}
      data-item={item.id}
      data-area={areaIndex ?? 'none'}
      title={item.title}
      onPointerDown={onPointerDown}
    >
      <div className="card-main">
        <span className="card-title">{item.title}</span>
        {isGroup && (
          <span className="child-count" aria-label={`Group of ${childCount} items`} title={`Group of ${childCount} items`}>
            {childCount}
          </span>
        )}
      </div>
      {!compact && attributes.length > 0 && (
        <div className="card-attrs">
          {attributes.map((a) => (
            <span key={a.property} className="attr" data-property={a.property} title={a.title}>
              {a.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
