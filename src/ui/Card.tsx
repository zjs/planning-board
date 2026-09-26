import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
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
  /** Part of the viewer's selection. Every copy of a selected item shows it. */
  selected?: boolean;
  /** This copy is the one being dragged. */
  lifted?: boolean;
  /** Briefly highlighted after a drop, so you can see where it landed. */
  justMoved?: boolean;
  /** Show a title field instead of the title. */
  editing?: boolean;
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
  onDoubleClick?: (e: MouseEvent<HTMLDivElement>) => void;
  onRename?: (title: string) => void;
  onCancelEdit?: () => void;
}

export function Card({
  item,
  childCount,
  areaIndex,
  attributes,
  compact,
  selected,
  lifted,
  justMoved,
  editing,
  onPointerDown,
  onDoubleClick,
  onRename,
  onCancelEdit,
}: Props) {
  const isGroup = childCount > 0;
  const classes = [
    'card',
    compact && 'chip',
    isGroup && 'group',
    selected && 'selected',
    lifted && 'lifted',
    justMoved && 'just-moved',
  ].filter(Boolean);
  return (
    <div
      className={classes.join(' ')}
      data-item={item.id}
      data-area={areaIndex ?? 'none'}
      title={editing ? undefined : item.title}
      aria-selected={selected ?? false}
      onPointerDown={editing ? undefined : onPointerDown}
      onDoubleClick={editing ? undefined : onDoubleClick}
    >
      <div className="card-main">
        {editing ? (
          <TitleInput
            initial={item.title}
            label="Card title"
            onCommit={(title) => onRename?.(title)}
            onCancel={() => onCancelEdit?.()}
          />
        ) : (
          <span className="card-title">{item.title}</span>
        )}
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

/** A card waiting for its first title. Nothing is created until it has one. */
export function DraftCard({ onCommit, onCancel }: { onCommit: (title: string) => void; onCancel: () => void }) {
  return (
    <div className="card draft" data-testid="draft-card">
      <div className="card-main">
        <TitleInput initial="" label="New card title" placeholder="New card" onCommit={onCommit} onCancel={onCancel} />
      </div>
    </div>
  );
}

/**
 * Enter or leaving the field saves; Escape cancels. Keys and pointer
 * presses stay inside, so typing never triggers board shortcuts or a drag.
 */
function TitleInput({
  initial,
  label,
  placeholder,
  onCommit,
  onCancel,
}: {
  initial: string;
  label: string;
  placeholder?: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(ref.current?.value ?? '');
    else onCancel();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  };
  return (
    <textarea
      ref={ref}
      className="title-input"
      defaultValue={initial}
      placeholder={placeholder}
      aria-label={label}
      rows={2}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => finish(true)}
    />
  );
}
