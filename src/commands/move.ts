// Bringing plans from the old address of the public build to its new one
// (Q80 d, ADR 0025). Browser storage belongs to one address, so the page at
// the old one (move.html) hands everything over in one message, and this
// writes it here: each plan's entry, board, history and sync records, its
// view, and the settings this browser doesn't have yet. Nothing here is ever
// overwritten; a shared plan this browser already holds takes in the moved
// copy's changes, as merging a changes file does.

import { OURS, type MoveBundle, type MovedDatabase } from '../move/addresses.ts';
import {
  FIRST_PLAN,
  FIRST_PLAN_NAME,
  findShared,
  historyDatabase,
  historySyncDatabase,
  importPlanEntry,
  isEntry,
  newPlanId,
  planDatabase,
  planIdTaken,
  scopedKey,
  setShared,
  syncDatabase,
  type KeyValue,
  type PlanEntry,
  type PlanId,
} from './plans.ts';

const PLANS_KEY = 'planning-board:plans';
/** A plan's own view settings (src/ui/axes.ts): `base` for the first plan, `base:<id>` for others. */
const SCOPED = ['planning-board:view', 'planning-board:holding-collapsed', 'planning-board:folding', 'planning-board:collapsed', 'planning-board:expanded'];
/** Settings that belong to one browser's use of the app and mean nothing elsewhere, or name plans by id. */
const LEFT_BEHIND = new Set([PLANS_KEY, 'planning-board:guide', 'planning-board:guide-plan', 'planning-board:move-from', 'planning-board:move-to']);

/** A plan in a bundle, and where it goes here: under its own id, a new one, or into the same shared plan held here. */
export interface MovedPlan {
  entry: PlanEntry;
  to: PlanId;
  into: 'new' | 'existing';
}

const isScoped = (key: string) => SCOPED.some((base) => key === base || key.startsWith(`${base}:`));

/** The plans a bundle holds, deleted ones left out. A browser with no list kept only the first plan. */
function bundledEntries(bundle: MoveBundle): PlanEntry[] {
  const raw = bundle.local[PLANS_KEY];
  if (raw === undefined) {
    const hasFirst = bundle.databases.some((db) => db.name === planDatabase(FIRST_PLAN));
    return hasFirst ? [{ id: FIRST_PLAN, name: FIRST_PLAN_NAME, created: 0, opened: 0 }] : [];
  }
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(isEntry).filter((e) => e.deletedAt === undefined) : [];
  } catch {
    return [];
  }
}

/** Where each plan in a bundle goes here, before anything is written. */
export function planMove(bundle: MoveBundle, store?: KeyValue): MovedPlan[] {
  const used = new Set<PlanId>();
  return bundledEntries(bundle).map((entry) => {
    const shared = entry.shared;
    const existing = shared ? findShared(shared.relay, shared.room, store) : null;
    if (existing && existing.deletedAt === undefined && !used.has(existing.id)) {
      used.add(existing.id);
      return { entry, to: existing.id, into: 'existing' };
    }
    let to = entry.id;
    while (planIdTaken(to, store) || used.has(to)) to = newPlanId();
    used.add(to);
    return { entry, to, into: 'new' };
  });
}

/** Where moved plans are written: the plan databases, by name. In the app it's IndexedDB (`browserWriter`). */
export interface MoveWriter {
  /** Merge Yjs updates into a document's database, making it if it isn't here. */
  mergeDoc(name: string, updates: Uint8Array[]): Promise<void>;
  /** Keep a sync record, unless this database already keeps one. */
  putSync(name: string, record: unknown): Promise<void>;
}

/** A plan's databases, by role: its board, its two histories, and the two sync records. */
function databasesOf(id: PlanId) {
  return {
    docs: [planDatabase(id), historyDatabase(id, 'local'), historyDatabase(id, 'shared')],
    syncs: [syncDatabase(id), historySyncDatabase(id)],
  };
}

function updatesIn(db: MovedDatabase | undefined): Uint8Array[] {
  return (db?.stores.find((s) => s.name === 'updates')?.records ?? []).map((r) => r.value).filter((v): v is Uint8Array => v instanceof Uint8Array);
}

function syncRecordIn(db: MovedDatabase | undefined): unknown {
  return db?.stores.find((s) => s.name === 'sync')?.records.find((r) => r.key === 'record')?.value;
}

/**
 * Write a bundle's plans here, as `planMove` placed them, and the settings
 * this browser doesn't have yet. Returns the plans written, in order.
 */
export async function applyMove(bundle: MoveBundle, writer: MoveWriter, store: KeyValue = localStorage): Promise<MovedPlan[]> {
  const moves = planMove(bundle, store);
  const byName = new Map(bundle.databases.filter((db) => db.name.startsWith(OURS)).map((db) => [db.name, db]));
  for (const move of moves) {
    const from = databasesOf(move.entry.id);
    const to = databasesOf(move.to);
    // Boards and histories first, so a plan in the list always has its content.
    for (const [i, name] of from.docs.entries()) {
      const updates = updatesIn(byName.get(name));
      if (updates.length > 0) await writer.mergeDoc(to.docs[i]!, updates);
    }
    if (move.into === 'new') {
      // What the relay is known to hold of this copy, so it sends only what's missing. A plan already held keeps its own.
      for (const [i, name] of from.syncs.entries()) {
        const record = syncRecordIn(byName.get(name));
        if (record !== undefined) await writer.putSync(to.syncs[i]!, record);
      }
      importPlanEntry({ ...move.entry, id: move.to }, store);
      for (const base of SCOPED) {
        const value = bundle.local[scopedKey(base, move.entry.id)];
        if (value !== undefined && store.getItem(scopedKey(base, move.to)) === null) store.setItem(scopedKey(base, move.to), value);
      }
    } else {
      // A Can view copy here takes the moved copy's edit key, if it had one; keys are never taken away.
      const here = findShared(move.entry.shared?.relay, move.entry.shared!.room, store);
      if (here?.shared && !here.shared.secret && move.entry.shared?.secret) setShared(here.id, { ...here.shared, secret: move.entry.shared.secret }, store);
    }
  }
  for (const [key, value] of Object.entries(bundle.local)) {
    if (!key.startsWith(OURS) || LEFT_BEHIND.has(key) || isScoped(key)) continue;
    if (store.getItem(key) === null) store.setItem(key, value);
  }
  return moves;
}
