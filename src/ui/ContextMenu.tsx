import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';

export type ContextEntry =
  | { label: string; onSelect: () => void; shortcut?: string; disabled?: boolean; title?: string }
  | 'divider';

/**
 * A card's actions, at the pointer (Q54): right-click a card, or its "⋯".
 * Each entry shows its key, so the menu teaches the shortcuts. Esc, a click
 * elsewhere, or scrolling the board closes it; arrow keys move between
 * entries. It stays on screen near the edges.
 */
export function ContextMenu({
  x,
  y,
  label,
  entries,
  onClose,
}: {
  x: number;
  y: number;
  label: string;
  entries: ContextEntry[];
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);

  // Keep it inside the window: open up or to the left when there's no room.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    el.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - r.width - margin))}px`;
    el.style.top = `${Math.max(margin, y + r.height > window.innerHeight - margin ? y - r.height : y)}px`;
  }, [x, y]);

  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose();
    };
    // A scroll the board makes on its own just after opening, as a drag's end settles its layout, isn't someone
    // scrolling away: only scrolls after the first moment close the menu.
    const opened = performance.now();
    const onScroll = (e: Event) => {
      if (performance.now() - opened > 200 && !root.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div
      ref={root}
      className="context-menu"
      role="menu"
      aria-label={label}
      data-testid="card-menu"
      style={{ left: x, top: y }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) =>
        entry === 'divider' ? (
          <div key={`d${i}`} className="menu-divider" role="separator" />
        ) : (
          <button
            key={entry.label}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            title={entry.title}
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
          >
            <span>{entry.label}</span>
            {entry.shortcut && <kbd className="menu-key">{entry.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
