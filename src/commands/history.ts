// Who changed what, and when (requirement 36, ADR 0020). Each command this
// person makes, and each undo or redo, becomes one entry in the plan's
// history document: the plan diff of what it did, who did it, and when. The
// document is kept beside the board, never in it, and travels on its own:
// across tabs, through the relay in a room of its own, and in changes files.

import * as Y from 'yjs';
import { planDiff } from '../domain/diff.ts';
import { HISTORY_VERSION, CLOCK_SKEW_MS, type HistoryEntry } from '../domain/history.ts';
import { appendEntry, historyRoom, readClocks, readEntries, writeClock } from '../store/history.ts';
import { persist } from '../store/persistence.ts';
import { indexedDbSyncStore, memorySyncStore, RelayProvider } from '../store/relay.ts';
import { readPlan, readTree } from '../store/schema.ts';
import { syncTabs } from '../store/tabs.ts';
import { findPlan, historyDatabase, historySyncDatabase, type PlanId, type SharedPlan } from './plans.ts';
import { myPresenceId } from './presence.ts';
import { myName } from './sharing.ts';
import { openPlanStore, ownChange, type OpenPlan, type PlanStore } from './store.ts';

export { readClocks, readEntries } from '../store/history.ts';
export type { HistoryEntry } from '../domain/history.ts';

/** Who an entry is by: the stable per-browser id presence uses, which also gives their color, and the name chosen. */
export interface Author {
  by: string;
  name: string;
}

/** This person, as history records them. */
export function me(): Author {
  return { by: myPresenceId(), name: myName() ?? 'Someone' };
}

function entryId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Record this person's changes to `store` in `history`, one entry per
 * command, undo or redo. Changes from anyone or anywhere else (the relay,
 * another tab, a file, a loop repair) aren't theirs, and aren't recorded here:
 * whoever made them recorded them where they made them.
 */
export function watchHistory(store: PlanStore, history: Y.Doc, author: () => Author = me, now: () => number = Date.now): () => void {
  let last = readPlan(store.doc);
  // Cards this plan has ever had, deleted ones too: one that reappears was restored, not added.
  const seen = new Set(Object.keys(readTree(store.doc)));
  let stale = false;
  const before = (tr: Y.Transaction) => {
    if (!stale || ownChange(store, tr.origin) === null) return;
    last = readPlan(store.doc);
    for (const id of Object.keys(readTree(store.doc))) seen.add(id);
    stale = false;
  };
  const after = (tr: Y.Transaction) => {
    const own = ownChange(store, tr.origin);
    if (own === null) {
      // Someone else's change: the plan to diff from is read again before this person's next one, not now.
      if (tr.changed.size > 0) stale = true;
      return;
    }
    const plan = readPlan(store.doc);
    const changes = planDiff(last, plan, seen);
    last = plan;
    for (const id of Object.keys(plan.items)) seen.add(id);
    if (changes.length === 0) return;
    appendEntry(history, { v: HISTORY_VERSION, id: entryId(), ...author(), at: now(), ...(own === 'command' ? {} : { via: own }), changes });
  };
  store.doc.on('beforeTransaction', before);
  store.doc.on('afterTransaction', after);
  return () => {
    store.doc.off('beforeTransaction', before);
    store.doc.off('afterTransaction', after);
  };
}

/** The opening entry of a shared history: "Ada shared the plan" (Q73). */
export function recordShared(history: Y.Doc, author: Author = me(), at = Date.now()): void {
  if (readEntries(history).some((e) => e.event === 'shared')) return;
  appendEntry(history, { v: HISTORY_VERSION, id: entryId(), ...author, at, event: 'shared', changes: [] });
}

/**
 * Keep this person's clock correction up to date: how far the relay's clock
 * is ahead of theirs, written only when it's more than a minute out, or was.
 * Most people's never is, so most histories have none.
 */
export function recordClock(history: Y.Doc, by: string, relayAt: number, localAt: number): void {
  const offset = relayAt - localAt;
  const known = readClocks(history).get(by);
  if (known === undefined ? Math.abs(offset) <= CLOCK_SKEW_MS : Math.abs(offset - known) <= CLOCK_SKEW_MS / 2) return;
  writeClock(history, by, offset);
}

/** A plan's history, open: the document, the one from before it was shared, and its relay connection. */
export interface History {
  doc: Y.Doc;
  /** The plan's history from before it was shared, on the computer it was drafted on (Q73); otherwise null. */
  earlier: Y.Doc | null;
  connection: RelayProvider | null;
  /** Resolves once what's saved is loaded. */
  ready: Promise<void>;
  /** Called whenever an entry or a clock arrives, in either document. */
  subscribe: (listener: () => void) => () => void;
  close: () => Promise<void>;
}

/**
 * Open a plan's history, after its board: a plan only here keeps a `local`
 * history; a shared one, a `shared` history synced through its relay room,
 * with the `local` one kept beside it, read-only, if it was drafted here.
 */
export function openHistory(plan: OpenPlan, shared: SharedPlan | undefined, drafted: boolean): History {
  const id: PlanId = plan.id;
  const doc = new Y.Doc();
  const earlier = shared && drafted ? new Y.Doc() : null;
  const stoppers: (() => void)[] = [];
  const closers: (() => Promise<void>)[] = [];
  let connection: RelayProvider | null = null;
  const state = { closed: false };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  doc.on('update', notify);
  earlier?.on('update', notify);

  stoppers.push(watchHistory(plan.store, doc));
  const clock = (relayAt: number, localAt: number) => {
    if (!plan.store.readOnly) recordClock(doc, myPresenceId(), relayAt, localAt);
  };
  if (plan.connection) stoppers.push(plan.connection.onRelayClock(clock));

  const generation = shared ? 'shared' : 'local';
  const ready = (async () => {
    const saved = await persist(doc, historyDatabase(id, generation));
    closers.push(saved.close);
    if (earlier) closers.push((await persist(earlier, historyDatabase(id, 'local'))).close);
    if (state.closed) return;
    stoppers.push(syncTabs(doc, historyDatabase(id, generation)));
    if (shared?.relay !== undefined) {
      connection = new RelayProvider({
        doc,
        relay: shared.relay,
        room: historyRoom(shared.room),
        viewKey: shared.viewKey,
        ...(shared.secret ? { secret: shared.secret, create: true } : {}),
        sync: typeof indexedDB === 'undefined' ? memorySyncStore() : indexedDbSyncStore(historySyncDatabase(id)),
      });
      stoppers.push(connection.onRelayClock(clock));
    }
    notify();
  })();
  return {
    doc,
    earlier,
    get connection() {
      return connection;
    },
    ready,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    close: async () => {
      state.closed = true;
      await ready.catch(() => undefined);
      connection?.destroy();
      stoppers.forEach((stop) => stop());
      await Promise.all(closers.map((c) => c()));
      doc.destroy();
      earlier?.destroy();
    },
  };
}

/** Open a plan with its history (ADR 0020, ADR 0021): the board first, then its history. */
export async function openPlanWithHistory(id: PlanId, shared?: SharedPlan): Promise<OpenPlan> {
  const plan = await openPlanStore(id, shared);
  const history = openHistory(plan, shared, findPlan(id)?.drafted === true);
  const closeBoard = plan.close;
  plan.history = history;
  plan.close = async () => {
    await history.close();
    await closeBoard();
  };
  return plan;
}

/** Every entry in a history, from before sharing too where this computer has it, and each person's clock correction. */
export function historyOf(history: History): { entries: HistoryEntry[]; earlier: HistoryEntry[]; clocks: Map<string, number> } {
  return {
    entries: readEntries(history.doc),
    earlier: history.earlier ? readEntries(history.earlier) : [],
    clocks: readClocks(history.doc),
  };
}
