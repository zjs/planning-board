import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export type MenuEntry =
  | {
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      title?: string;
      /** Tells entries with the same label apart, such as two plans with one name. */
      key?: string;
      /** The one in use, such as the open plan. */
      current?: boolean;
    }
  | { heading: string }
  | 'divider';

/**
 * A toolbar button that opens a short list of commands. Esc or a click
 * elsewhere closes it; arrow keys move between entries.
 */
export function Menu({ label, entries, testId }: { label: string; entries: MenuEntry[]; testId?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
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
    <div className="menu" ref={root} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        data-testid={testId}
      >
        {label} ▾
      </button>
      {open && (
        <div className="menu-list" role="menu" id={id}>
          {entries.map((entry, i) =>
            entry === 'divider' ? (
              <div key={i} className="menu-divider" role="separator" />
            ) : 'heading' in entry ? (
              <div key={i} className="menu-heading" role="presentation">
                {entry.heading}
              </div>
            ) : (
              <button
                key={entry.key ?? entry.label}
                type="button"
                role="menuitem"
                className={entry.current ? 'current' : undefined}
                aria-current={entry.current ? 'true' : undefined}
                disabled={entry.disabled}
                title={entry.title}
                onClick={() => {
                  setOpen(false);
                  entry.onSelect();
                }}
              >
                {entry.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
