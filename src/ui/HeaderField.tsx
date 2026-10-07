import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * A name typed into a row or column header (Q55): renaming a value, or
 * adding one. Enter saves; a name that can't be used stays open with the
 * reason. When adding, the field stays open for the next one, like typing
 * cards (Q51). Escape, or leaving the field, stops. Keys and presses stay
 * inside, so typing never triggers board shortcuts, drags, or folding.
 */
export function HeaderField({
  initial = '',
  label,
  placeholder,
  chain = false,
  onCommit,
  onDone,
}: {
  initial?: string;
  label: string;
  placeholder?: string;
  /** After a name is saved, clear the field for another instead of closing. */
  chain?: boolean;
  /** Save a name. Returns why it can't be used, or null once it's saved. */
  onCommit: (name: string) => string | null;
  onDone: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const closed = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const close = () => {
    if (closed.current) return;
    closed.current = true;
    onDone();
  };
  // Renaming to the same name, or leaving an empty add, is just stopping.
  const unchanged = (text: string) => text.trim() === '' || text.trim() === initial.trim();
  const save = (how: 'enter' | 'blur') => {
    // Closing unmounts the field, which blurs it: that blur isn't a second save.
    if (closed.current) return;
    const text = ref.current?.value ?? '';
    if (unchanged(text)) {
      close();
      return;
    }
    const why = onCommit(text);
    if (why !== null) {
      if (how === 'blur') {
        close();
        return;
      }
      setProblem(why);
      ref.current?.select();
      return;
    }
    if (chain && how === 'enter' && ref.current) {
      ref.current.value = '';
      setProblem(null);
      return;
    }
    close();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      save('enter');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  return (
    <span className="header-field">
      <input
        ref={ref}
        defaultValue={initial}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={problem !== null}
        title={problem ?? undefined}
        onKeyDown={onKeyDown}
        onInput={() => problem !== null && setProblem(null)}
        onBlur={() => save('blur')}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      />
      {problem !== null && (
        <span className="header-problem" role="alert">
          {problem}
        </span>
      )}
    </span>
  );
}
