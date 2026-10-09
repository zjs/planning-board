// The history document (requirement 36, ADR 0020): one Yjs document per plan,
// beside the board's and never inside it, so history can grow forever without
// slowing the board. It holds two maps:
//
//   entries  entry id → one command's changes, who made them and when
//   clocks   person id → how far the relay's clock is ahead of theirs
//
// On the relay it has a room of its own, beside the board's, so its updates
// are never dropped by a board snapshot.

import * as Y from 'yjs';
import { parseEntry, type HistoryEntry } from '../domain/history.ts';

/** Marks history's own writes. History is never an undo step: it's a separate document. */
export const HISTORY_ORIGIN = { source: 'history' };

/** The relay room a shared plan's history lives in, beside its board's room. */
export function historyRoom(room: string): string {
  return `${room}_h`;
}

const entriesOf = (doc: Y.Doc) => doc.getMap<unknown>('entries');
const clocksOf = (doc: Y.Doc) => doc.getMap<unknown>('clocks');

export function appendEntry(doc: Y.Doc, entry: HistoryEntry): void {
  doc.transact(() => entriesOf(doc).set(entry.id, entry), HISTORY_ORIGIN);
}

/** Every entry this build can read, in no particular order. */
export function readEntries(doc: Y.Doc): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const value of entriesOf(doc).values()) {
    const entry = parseEntry(value);
    if (entry) out.push(entry);
  }
  return out;
}

/** How far the relay's clock is ahead of each person's, where it's been measured. */
export function readClocks(doc: Y.Doc): Map<string, number> {
  const out = new Map<string, number>();
  for (const [by, offset] of clocksOf(doc).entries()) if (typeof offset === 'number' && Number.isFinite(offset)) out.set(by, offset);
  return out;
}

export function writeClock(doc: Y.Doc, by: string, offset: number): void {
  doc.transact(() => clocksOf(doc).set(by, Math.round(offset)), HISTORY_ORIGIN);
}
