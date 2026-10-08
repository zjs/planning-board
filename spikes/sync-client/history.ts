// Who changed what, recorded in the shared document itself (option 2 in
// presence-and-history.md): after each command, a line per change goes into
// a `history` array, with a name and a time. It's encrypted like
// everything else, and the app's readers ignore it.

import * as Y from 'yjs';
import type { Plan } from '../../src/domain/model.ts';
import { readPlan } from '../../src/store/schema.ts';
import { planDiff } from './diff.ts';

export interface HistoryEntry {
  who: string;
  color: string;
  at: number;
  /** "undo" or "redo" when it came from ⌘Z or ⇧⌘Z. */
  via?: 'undo' | 'redo';
  changes: string[];
}

const HISTORY_ORIGIN = { source: 'history' };

export const historyOf = (doc: Y.Doc) => doc.getArray<HistoryEntry>('history');

/**
 * Record every local command in `doc`'s history. The commands mark their
 * transactions with `{ source: 'local-command' }` (src/commands/store.ts);
 * undo and redo come from the store's UndoManager.
 */
export function recordHistory(doc: Y.Doc, me: () => { name: string; color: string }): () => void {
  let before: Plan = readPlan(doc);
  const onAfter = (tr: Y.Transaction) => {
    if (tr.origin === HISTORY_ORIGIN) return;
    const after = readPlan(doc);
    const origin = tr.origin as { source?: string } | null;
    const fromUndo = tr.origin instanceof Y.UndoManager;
    if (origin?.source === 'local-command' || fromUndo) {
      const changes = planDiff(before, after).map((c) => c.text);
      if (changes.length > 0) {
        const who = me();
        const entry: HistoryEntry = { who: who.name, color: who.color, at: Date.now(), changes };
        if (fromUndo) entry.via = (tr.origin as Y.UndoManager).undoing ? 'undo' : 'redo';
        // In its own transaction, after this one, so undo never tracks it.
        queueMicrotask(() => doc.transact(() => historyOf(doc).push([entry]), HISTORY_ORIGIN));
      }
    }
    before = after;
  };
  doc.on('afterTransaction', onAfter);
  return () => doc.off('afterTransaction', onAfter);
}
