import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A modal dialog. Esc or the close button dismisses it. Board shortcuts
 * don't reach through it (App ignores keys from inside a dialog).
 */
export function Dialog({
  title,
  onClose,
  children,
  wide,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Focus goes back where it was when the dialog closes.
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], button.primary, input, select, textarea');
    first?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="dialog-backdrop">
      <div
        ref={ref}
        className={wide ? 'dialog wide' : 'dialog'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          onClose();
        }}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
