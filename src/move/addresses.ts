// Where the public build lives, before and after it moves to a domain of its
// own (Q80 d, ADR 0025). Plain constants, with no imports, so the small pages
// served at the old address (move.html, stub.html) can use them without the app.

/** The public build today, on GitHub Pages (Q31). Share links made from a page opened from disk name it. */
export const PUBLIC_APP = 'https://zjs.github.io/planning-board/';

/**
 * The public build's own domain, once it's bought and deployed (Q80 d). A
 * placeholder until then: nothing links to it, and the move between the two
 * stays switched off. docs/domain-move.md says how to switch.
 */
export const NEW_PUBLIC_APP = 'https://planning-board.example/';

/** The page at the old address that hands its plans to the new one. */
export const MOVE_PAGE = `${PUBLIC_APP}move.html`;

/** localStorage keys that point the move somewhere else, only for tests, which run both addresses on this computer. */
export const MOVE_FROM_KEY = 'planning-board:move-from';
export const MOVE_TO_KEY = 'planning-board:move-to';

/** What move.html posts to the new address: everything the app kept at the old one. */
export interface MoveBundle {
  format: 'planning-board-move';
  version: 1;
  /** Every localStorage key the app keeps, by name. */
  local: Record<string, string>;
  /** Every IndexedDB database the app keeps, record by record, as stored. */
  databases: MovedDatabase[];
}

export interface MovedDatabase {
  name: string;
  stores: { name: string; records: { key: IDBValidKey; value: unknown }[] }[];
}

/** Whether a message is a bundle of ours, before anything in it is trusted. */
export function isMoveBundle(v: unknown): v is MoveBundle {
  if (typeof v !== 'object' || v === null) return false;
  const b = v as Record<string, unknown>;
  return b.format === 'planning-board-move' && b.version === 1 && typeof b.local === 'object' && b.local !== null && Array.isArray(b.databases);
}

/** Only the app's own keys and databases move. */
export const OURS = 'planning-board:';
