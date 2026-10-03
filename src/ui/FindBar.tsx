import { useEffect, type KeyboardEvent, type RefObject } from 'react';
import type { Found } from '../domain/finding.ts';

interface Props {
  query: string;
  onChange: (query: string) => void;
  /** What the query finds, or null when nothing is typed. */
  found: Found | null;
  /** Enter: select every match. */
  onSelect: () => void;
  /** ↓ and ↑: show the next or previous match. */
  onStep: (by: 1 | -1) => void;
  /** Esc, ×, or leaving the field empty: stop finding, and close the bar. */
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

/** "7 cards", or "7 cards · 2 inside folded groups": every match, and how many of them are folded away. */
export function foundSummary(found: Found): string {
  const n = found.matches.length;
  if (n === 0) return 'No cards';
  const folded = [...found.inside.values()].reduce((sum, ids) => sum + ids.length, 0);
  const inside = folded === 0 ? '' : folded === 1 ? ' · 1 inside a folded group' : ` · ${folded} inside folded groups`;
  return `${n} ${n === 1 ? 'card' : 'cards'}${inside}`;
}

/** The toolbar's way into finding, for anyone who doesn't know /. */
export function FindButton({ onClick, open }: { onClick: () => void; open: boolean }) {
  return (
    <button
      type="button"
      className="icon"
      onClick={onClick}
      // Keeps the field's focus, so an empty bar doesn't close on blur and then reopen on this click.
      onMouseDown={(e) => e.preventDefault()}
      aria-pressed={open}
      aria-label="Find"
      title="Find cards (/)"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10.3 10.3 15 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/**
 * Find cards by typing (questions.md Q50, ADR 0014): a bar under the
 * toolbar, opened with / from anywhere on the board. Cards that don't match
 * dim; nothing moves.
 */
export function FindBar({ query, onChange, found, onSelect, onStep, onClose, inputRef }: Props) {
  useEffect(() => inputRef.current?.focus(), [inputRef]);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSelect();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      onStep(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };
  return (
    <div className="find-bar" role="search" data-testid="find-bar">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Find cards by title, Jira key or description"
        aria-label="Find cards"
        spellCheck={false}
        autoComplete="off"
        data-testid="find"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        // An empty bar goes away when you click elsewhere; one with words in it stays, so you can work with the matches.
        onBlur={() => {
          if (query.trim() === '') onClose();
        }}
      />
      <span className="find-count" role="status" data-testid="find-count">
        {found ? foundSummary(found) : ''}
      </span>
      <span className="find-hints">
        <kbd>Enter</kbd> selects them all · <kbd>↓</kbd> <kbd>↑</kbd> one by one · <kbd>Esc</kbd> stops
      </span>
      <button type="button" onClick={onClose} aria-label="Stop finding" title="Stop finding (Esc)">
        Done
      </button>
    </div>
  );
}
