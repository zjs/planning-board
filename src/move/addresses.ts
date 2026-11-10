// Where the public build lives, before and after it moves to a domain of its
// own (Q80 d, ADR 0025). Plain constants, with no imports, so the small pages
// served at the old address (move.html, stub.html) can use them without the app.

/** The public build's first address, on GitHub Pages (Q31): where plans are moved from, whatever PUBLIC_APP becomes. */
export const OLD_PUBLIC_APP = 'https://zjs.github.io/planning-board/';

/**
 * The public build, which share links name when the page they were made on
 * can't be (a file opened from disk, or a relay's own copy of the app). It
 * becomes NEW_PUBLIC_APP at the switch (docs/domain-move.md).
 */
export const PUBLIC_APP = OLD_PUBLIC_APP;

/**
 * The public build's own domain, once it's bought and deployed (Q80 d). A
 * placeholder until then: nothing links to it, and the move between the two
 * stays switched off. docs/domain-move.md says how to switch.
 */
export const NEW_PUBLIC_APP = 'https://planning-board.example/';

/** The page at the old address that hands its plans to the new one. */
export const MOVE_PAGE = `${OLD_PUBLIC_APP}move.html`;

/** localStorage keys that point the move somewhere else, only for tests, which run both addresses on this computer. */
export const MOVE_FROM_KEY = 'planning-board:move-from';
export const MOVE_TO_KEY = 'planning-board:move-to';

/**
 * A test's stand-in for an address, from localStorage. It's read only on this
 * computer's own addresses, where the tests run: anywhere else, such as under
 * `zjs.github.io`, another site sharing the storage could set it to send
 * people, and their links' keys, somewhere of its choosing.
 */
export function testOverride(key: string): string | null {
  try {
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

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
