// History entries (requirement 36, ADR 0020): who changed what, and when.
// One entry per command, kept forever in a document of its own. Entries come
// from other people's browsers, so each is checked before it's shown.

import { changedItems, type Change } from './diff.ts';
import type { ItemId } from './model.ts';

export const HISTORY_VERSION = 1;

export interface HistoryEntry {
  v: number;
  id: string;
  /** The author's stable per-browser id, as presence uses (ADR 0019). */
  by: string;
  /** The name they chose, at the time. Their color comes from `by`, as presence's does. */
  name: string;
  /** The author's clock, as an instant: milliseconds since 1970, UTC. */
  at: number;
  /** An undo or redo of an earlier command. */
  via?: 'undo' | 'redo';
  /** Not a change to the board: the plan was shared, which opens a shared history (Q73). */
  event?: 'shared';
  changes: Change[];
}

const KINDS = new Set<Change['kind']>(['added', 'deleted', 'restored', 'renamed', 'described', 'values', 'group', 'sequence', 'linked', 'unlinked', 'property', 'value']);
const isString = (x: unknown): x is string => typeof x === 'string';
const MAX_CHANGES = 2000;

function parseChange(x: unknown): Change | null {
  if (typeof x !== 'object' || x === null) return null;
  const c = x as Record<string, unknown>;
  if (!KINDS.has(c.kind as Change['kind'])) return null;
  // The fields each kind reads are checked where they're strings; anything else would show as "undefined", not break.
  const list = (v: unknown) => Array.isArray(v) && v.every(isString);
  for (const key of ['item', 'title', 'property', 'value', 'label', 'name', 'was']) {
    if (key in c && !isString(c[key])) return null;
  }
  // A value change's `from` and `to` are lists of values; anything else's are a card, a key or nothing.
  for (const key of ['from', 'to']) {
    if (key in c && !(c.kind === 'values' ? list(c[key]) : c[key] === null || isString(c[key]))) return null;
  }
  if ('with' in c && !list(c.with)) return null;
  return x as Change;
}

/** An entry from the history document, checked; null if it isn't one this build can read. */
export function parseEntry(x: unknown): HistoryEntry | null {
  if (typeof x !== 'object' || x === null) return null;
  const e = x as Record<string, unknown>;
  if (e.v !== HISTORY_VERSION || !isString(e.id) || !isString(e.by) || !isString(e.name)) return null;
  if (typeof e.at !== 'number' || !Number.isFinite(e.at) || !Array.isArray(e.changes) || e.changes.length > MAX_CHANGES) return null;
  const changes = e.changes.map(parseChange);
  if (changes.some((c) => c === null)) return null;
  return {
    v: HISTORY_VERSION,
    id: e.id,
    by: e.by,
    name: e.name.slice(0, 60),
    at: e.at,
    ...(e.via === 'undo' || e.via === 'redo' ? { via: e.via } : {}),
    ...(e.event === 'shared' ? { event: 'shared' as const } : {}),
    changes: changes as Change[],
  };
}

/** How far an author's clock may be from the relay's before it's corrected (ADR 0020). */
export const CLOCK_SKEW_MS = 60_000;

/**
 * When an entry happened, as shown. `offset` is how far the relay's clock is
 * ahead of the author's, measured when the relay last acknowledged one of
 * their changes; past a minute, the author's clock is wrong, and the entry is
 * shown corrected. It's an offset, not the relay's receive time, so work done
 * offline keeps the time it was done.
 */
export function shownTime(entry: HistoryEntry, offset?: number): number {
  return offset !== undefined && Math.abs(offset) > CLOCK_SKEW_MS ? entry.at + offset : entry.at;
}

/** A run of one person's changes, close together in time (Q74). */
export interface Burst {
  by: string;
  name: string;
  /** The first and last entry's times. */
  from: number;
  to: number;
  /** Newest first. */
  entries: HistoryEntry[];
}

export const BURST_GAP_MS = 5 * 60_000;

/**
 * Group entries, newest first, into bursts: one person's consecutive entries
 * with no more than `gap` between neighbours. `time` gives each entry's shown
 * time. The opening "shared" entry is always on its own.
 */
export function groupBursts(entries: readonly HistoryEntry[], time: (e: HistoryEntry) => number, gap = BURST_GAP_MS): Burst[] {
  const sorted = [...entries].sort((a, b) => time(b) - time(a) || (a.id < b.id ? 1 : -1));
  const out: Burst[] = [];
  for (const entry of sorted) {
    const last = out.at(-1);
    const t = time(entry);
    if (last && last.by === entry.by && !entry.event && !last.entries[0]!.event && last.from - t <= gap) {
      last.entries.push(entry);
      last.from = t;
      continue;
    }
    out.push({ by: entry.by, name: entry.name, from: t, to: t, entries: [entry] });
  }
  return out;
}

/** The entries that touched a card, newest first, each with only the changes about it. */
export function entriesForItem(entries: readonly HistoryEntry[], item: ItemId, time: (e: HistoryEntry) => number): HistoryEntry[] {
  return entries
    .map((e) => ({ ...e, changes: e.changes.filter((c) => changedItems(c).includes(item)) }))
    .filter((e) => e.changes.length > 0)
    .sort((a, b) => time(b) - time(a));
}

/** Everyone in a history, newest name first, for filtering by person. */
export function authors(entries: readonly HistoryEntry[]): { by: string; name: string }[] {
  const latest = new Map<string, HistoryEntry>();
  for (const e of entries) {
    const known = latest.get(e.by);
    if (!known || e.at > known.at) latest.set(e.by, e);
  }
  return [...latest.values()].map((e) => ({ by: e.by, name: e.name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Who last changed each card, and when (shown time): for "Last changed by Ada, 10:42". */
export function lastChanges(entries: readonly HistoryEntry[], time: (e: HistoryEntry) => number): Map<ItemId, { by: string; name: string; at: number }> {
  const out = new Map<ItemId, { by: string; name: string; at: number }>();
  for (const entry of entries) {
    const at = time(entry);
    for (const change of entry.changes) {
      for (const item of changedItems(change)) {
        const known = out.get(item);
        if (!known || at > known.at) out.set(item, { by: entry.by, name: entry.name, at });
      }
    }
  }
  return out;
}
