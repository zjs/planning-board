import type { Item } from '../domain/model.ts';

interface Props {
  item: Item;
  childCount: number;
  /** Index into the area palette, or null for untagged items. */
  areaIndex: number | null;
}

export function Card({ item, childCount, areaIndex }: Props) {
  const isGroup = childCount > 0;
  return (
    <div
      className={isGroup ? 'card group' : 'card'}
      data-item={item.id}
      data-area={areaIndex ?? 'none'}
      title={item.title}
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
