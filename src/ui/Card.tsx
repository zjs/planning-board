import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import type { CardAttribute } from '../domain/attributes.ts';
import type { Item } from '../domain/model.ts';

interface Props {
  item: Item;
  childCount: number;
  /** Index into the area palette, or null for untagged items. */
  areaIndex: number | null;
  /** The edge's tooltip, naming the card's area. */
  areaTitle?: string | undefined;
  /** Levels above the lowest: a heavier border, so initiatives and epics stand out (Q32). */
  levelWeight?: number;
  /** The group this card is shown for, when several groups' children share the board (Q33). */
  /** Values of properties that aren't on an axis (requirement 4). */
  attributes: CardAttribute[];
  /** A one-line chip: title and child count only (holding lanes, when chosen). */
  compact?: boolean;
  /** Part of the viewer's selection. Every copy of a selected item shows it. */
  selected?: boolean;
  /** This copy is the one being dragged. */
  lifted?: boolean;
  /** A dragged card has rested over this one: dropping puts it inside (hold to nest). */
  nestTarget?: boolean;
  /** One of several copies of a hovered or selected card, outlined so they can be found (Q45). */
  copyFocus?: boolean;
  /** Briefly highlighted after a drop, so you can see where it landed. */
  justMoved?: boolean;
  /** Show a title field instead of the title. */
  editing?: boolean;
  /** A faded copy of a group, in a lane only its children reach (Q16). */
  viaChildren?: boolean;
  /** Why this card doesn't fit its group (requirement 13). */
  mismatches?: readonly string[];
  /** Everything that doesn't fit inside this group, at any depth (requirement 18). */
  mismatchesInside?: readonly string[];
  /** Doesn't match what's being found (Q50). */
  dimmed?: boolean;
  /** Titles of the cards folded inside this one that match what's being found (Q50). */
  foundInside?: readonly string[] | undefined;
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
  onDoubleClick?: (e: MouseEvent<HTMLDivElement>) => void;
  /** Expand this group in place: the child count on group cards (Q36, Q42). */
  onExpand?: (() => void) | undefined;
  /** On an expanded group's own card, heading its frame (Q57): the count collapses it instead. */
  onCollapse?: (() => void) | undefined;
  onRename?: (title: string, how: CommitHow) => void;
  onCancelEdit?: () => void;
  /** ⇧-click on a badge: select every card on the board with its value (Q47). */
  onSelectMatching?: (property: string, value: string) => void;
  /** Open this card's actions at a point on screen (Q54): its "⋯" button. */
  onMenu?: ((x: number, y: number) => void) | undefined;
}

export function Card({
  item,
  childCount,
  areaIndex,
  areaTitle,
  levelWeight = 0,
  attributes,
  compact,
  selected,
  lifted,
  nestTarget,
  copyFocus,
  justMoved,
  editing,
  viaChildren,
  mismatches = [],
  mismatchesInside = [],
  dimmed,
  foundInside,
  onPointerDown,
  onDoubleClick,
  onExpand,
  onCollapse,
  onRename,
  onCancelEdit,
  onSelectMatching,
  onMenu,
}: Props) {
  const isGroup = childCount > 0;
  const classes = [
    'card',
    compact && 'chip',
    isGroup && 'group',
    selected && 'selected',
    viaChildren && 'via-children',
    lifted && 'lifted',
    nestTarget && 'nest-target',
    copyFocus && 'copy-focus',
    justMoved && 'just-moved',
    dimmed && 'dimmed',
  ].filter(Boolean);
  return (
    <div
      className={classes.join(' ')}
      data-item={item.id}
      data-area={areaIndex ?? 'none'}
      data-weight={levelWeight > 0 ? Math.min(levelWeight, 2) : undefined}
      title={editing ? undefined : viaChildren ? `${item.title} (via cards inside it)` : item.title}
      aria-selected={selected ?? false}
      onPointerDown={editing ? undefined : onPointerDown}
      onDoubleClick={editing ? undefined : onDoubleClick}
    >
      {areaTitle !== undefined && <span className="area-edge" title={areaTitle} aria-hidden="true" />}
      <div className="card-main">
        {editing ? (
          <TitleInput
            initial={item.title}
            label="Card title"
            onCommit={(title, how) => onRename?.(title, how)}
            onCancel={() => onCancelEdit?.()}
          />
        ) : (
          <span className="card-title">{item.title}</span>
        )}
        {foundInside && foundInside.length > 0 && (
          <span
            className="found-inside"
            title={`Inside, matching:\n${foundInside.map((t) => `• ${t}`).join('\n')}`}
            aria-label={`${foundInside.length} inside ${foundInside.length === 1 ? 'matches' : 'match'}: ${foundInside.join('; ')}`}
          >
            {foundInside.length} inside
          </span>
        )}
        {(mismatches.length > 0 || mismatchesInside.length > 0) && (
          <MismatchMarker own={mismatches} inside={mismatchesInside} />
        )}
        {isGroup &&
          (onCollapse && !editing ? (
            // Expanded, the count is the way back out (Q57). Collapsing hides nothing for good, so one click does it.
            <button
              type="button"
              className="zoom-into ready open"
              aria-label={`Collapse ${item.title} (${childCount} inside)`}
              title="Collapse: put its cards back inside"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                if (e.detail > 1) return;
                e.stopPropagation();
                onCollapse();
              }}
            >
              <span className="child-count">{childCount}</span>
              <span className="zoom-chevron" aria-hidden="true">
                ▾
              </span>
            </button>
          ) : onExpand && !editing ? (
            // The count is the way in (Q36, Q42): double-click renames, this expands the group. Only on a
            // selected group, so a click meant to select it never expands it by accident.
            <button
              type="button"
              className={selected ? 'zoom-into ready' : 'zoom-into'}
              aria-label={`Expand ${item.title} (${childCount} inside)`}
              title={selected ? `Expand: show the ${childCount} cards inside right here` : `Group of ${childCount} cards. Select it, then click here to expand it`}
              tabIndex={selected ? 0 : -1}
              onPointerDown={(e) => {
                // Unselected, the press selects the card like any other; selected, it's a click on the button.
                if (selected) e.stopPropagation();
              }}
              onClick={(e) => {
                // The second click of a double-click belongs to the card: double-click renames.
                if (!selected || e.detail > 1) return;
                e.stopPropagation();
                onExpand();
              }}
            >
              <span className="child-count">{childCount}</span>
              <span className="zoom-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          ) : (
            <span className="child-count" aria-label={`Group of ${childCount} items`} title={`Group of ${childCount} items`}>
              {childCount}
            </span>
          ))}
        {onMenu && !editing && (
          // Every action on the card, with its key (Q54). Shows on hover and selection; right-click does the same.
          <button
            type="button"
            className="card-menu"
            aria-label={`Actions for ${item.title}`}
            title="Actions (or right-click the card)"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              onMenu(r.left, r.bottom + 2);
            }}
          >
            ⋯
          </button>
        )}
      </div>
      {!compact && (attributes.length > 0 || item.externalKey) && (
        <div className="card-attrs">
          {item.externalKey && (
            <span className="attr key" title={`Key in the imported tool: ${item.externalKey}`}>
              {item.externalKey}
            </span>
          )}
          {attributes.map((a) => (
            <span
              key={a.property}
              className="attr"
              data-property={a.property}
              title={a.title}
              onPointerDown={(e) => {
                // ⇧-click on a badge selects its matches, rather than adding this card to the selection.
                if (!e.shiftKey || !onSelectMatching) return;
                e.stopPropagation();
                e.preventDefault();
                onSelectMatching(a.property, a.value);
              }}
            >
              {a.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Flags a card that doesn't fit its group, or a group with cards inside that
 * don't; hovering lists why. A flag for discussion: nothing is changed.
 */
function MismatchMarker({ own, inside }: { own: readonly string[]; inside: readonly string[] }) {
  const lines = [...own, ...(inside.length > 0 ? ['Inside:', ...inside.map((l) => `• ${l}`)] : [])];
  const text = inside.length > 0 ? `⚠ ${inside.length}` : '⚠';
  const label = [
    own.length > 0 && "Doesn't fit its group",
    inside.length > 0 && `${inside.length} ${inside.length === 1 ? 'mismatch' : 'mismatches'} inside`,
  ]
    .filter(Boolean)
    .join('; ');
  return (
    <span className="mismatch" title={lines.join('\n')} aria-label={`${label}: ${[...own, ...inside].join('; ')}`}>
      {text}
    </span>
  );
}

/** A card waiting for its first title. Nothing is created until it has one. */
/** How a title field was finished: Enter, or by leaving it. */
export type CommitHow = 'enter' | 'blur';

export function DraftCard({ onCommit, onCancel }: { onCommit: (title: string, how: CommitHow) => void; onCancel: () => void }) {
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
  onCommit: (title: string, how: CommitHow) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (how: CommitHow | null) => {
    if (done.current) return;
    done.current = true;
    if (how) onCommit(ref.current?.value ?? '', how);
    else onCancel();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finish('enter');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(null);
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
      onBlur={() => finish('blur')}
    />
  );
}
