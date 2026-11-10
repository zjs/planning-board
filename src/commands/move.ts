// Bringing plans from the old address of the public build to its new one
// (Q80 d, ADR 0025). Browser storage belongs to one address, so the page at
// the old one (move.html) hands everything over in one message, and this
// writes it here: each plan's entry, board, history and sync records, its
// view, and the settings this browser doesn't have yet. Nothing here is ever
// overwritten. A plan already here, a shared one by its room or one moved
// before by its old id, takes in the moved copy's changes, as merging a
// changes file does, so bringing plans twice adds nothing twice.

import * as Y from 'yjs';
import { OURS, type MoveBundle, type MovedDatabase } from '../move/addresses.ts';
import { readPlan } from '../store/schema.ts';
import {
  FIRST_PLAN,
  FIRST_PLAN_NAME,
  allPlanEntries,
  findShared,
  forgetPlan,
  historyDatabase,
  historySyncDatabase,
  importPlanEntry,
  isEntry,
  newPlanId,
  planDatabase,
  scopedKey,
  setShared,
  syncDatabase,
  unmarkDeleted,
  type KeyValue,
  type PlanEntry,
  type PlanId,
} from './plans.ts';

const PLANS_KEY = 'planning-board:plans';
/** A plan's own view settings (src/ui/axes.ts): `base` for the first plan, `base:<id>` for others. */
const SCOPED = ['planning-board:view', 'planning-board:holding-collapsed', 'planning-board:folding', 'planning-board:collapsed', 'planning-board:expanded'];
/**
 * Settings that stay behind: the plan list itself, the guide, which names
 * plans by id, the tests' stand-ins, and the relay last used for Share, so a
 * relay set by another site under the old address (F3) doesn't come along.
 */
const LEFT_BEHIND = new Set([PLANS_KEY, 'planning-board:guide', 'planning-board:guide-plan', 'planning-board:move-from', 'planning-board:move-to', 'planning-board:relay']);

/** A plan in a bundle, and where it goes here: a new entry, or into a plan already here. */
export interface MovedPlan {
  entry: PlanEntry;
  to: PlanId;
  into: 'new' | 'existing';
}

const isScoped = (key: string) => SCOPED.some((base) => key === base || key.startsWith(`${base}:`));

function updatesIn(db: MovedDatabase | undefined): Uint8Array[] {
  return (db?.stores.find((s) => s.name === 'updates')?.records ?? []).map((r) => r.value).filter((v): v is Uint8Array => v instanceof Uint8Array);
}

function syncRecordIn(db: MovedDatabase | undefined): unknown {
  return db?.stores.find((s) => s.name === 'sync')?.records.find((r) => r.key === 'record')?.value;
}

/** Whether a plan's board, as the bundle holds it, has no cards. */
function boardIsEmpty(bundle: MoveBundle, id: PlanId): boolean {
  const updates = updatesIn(bundle.databases.find((db) => db.name === planDatabase(id)));
  if (updates.length === 0) return true;
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, Y.mergeUpdates(updates));
    return Object.keys(readPlan(doc).items).length === 0;
  } catch {
    return false;
  } finally {
    doc.destroy();
  }
}

/**
 * The plans a bundle holds that are worth moving: not deleted, and not an
 * empty board nobody named or shared, such as the first plan a browser makes
 * just by opening the app once. A browser with no list kept only the first plan.
 */
export function movablePlans(bundle: MoveBundle): PlanEntry[] {
  const raw = bundle.local[PLANS_KEY];
  let entries: PlanEntry[] = [{ id: FIRST_PLAN, name: FIRST_PLAN_NAME, created: 0, opened: 0 }];
  if (raw !== undefined) {
    try {
      const list: unknown = JSON.parse(raw);
      entries = Array.isArray(list) ? list.filter(isEntry) : [];
    } catch {
      entries = [];
    }
  }
  return entries.filter((e) => e.deletedAt === undefined && (e.shared !== undefined || e.named === true || !boardIsEmpty(bundle, e.id)));
}

/**
 * Where each plan in a bundle goes here, before anything is written.
 * `firstIsFree` says this browser's first plan is an untouched empty board,
 * which a moved first plan takes the place of rather than sitting beside.
 */
export function planMove(bundle: MoveBundle, store?: KeyValue, firstIsFree = false): MovedPlan[] {
  const here = allPlanEntries(store);
  const used = new Set<PlanId>();
  return movablePlans(bundle).map((entry) => {
    const shared = entry.shared;
    const same = (shared ? findShared(shared.relay, shared.room, store) : null) ?? here.find((e) => e.movedFrom === entry.id) ?? null;
    if (same && !used.has(same.id)) {
      used.add(same.id);
      return { entry, to: same.id, into: 'existing' };
    }
    const free = (id: PlanId) => !used.has(id) && (!here.some((e) => e.id === id) || (id === FIRST_PLAN && firstIsFree));
    let to = entry.id;
    while (!free(to)) to = newPlanId();
    used.add(to);
    return { entry, to, into: 'new' };
  });
}

/** Where moved plans are written: the plan databases, by name. In the app it's IndexedDB (`browserWriter`). */
export interface MoveWriter {
  /** Merge Yjs updates into a document's database, making it if it isn't here. Resolves once they're stored. */
  mergeDoc(name: string, updates: Uint8Array[]): Promise<void>;
  /** Keep a sync record, unless this database already keeps one. */
  putSync(name: string, record: unknown): Promise<void>;
  /** Whether a plan's board here has no cards. */
  boardIsEmpty(name: string): Promise<boolean>;
}

/** A plan's databases, by role: its board, its two histories, and the two sync records. */
function databasesOf(id: PlanId) {
  return {
    docs: [planDatabase(id), historyDatabase(id, 'local'), historyDatabase(id, 'shared')],
    syncs: [syncDatabase(id), historySyncDatabase(id)],
  };
}

/** Whether this browser's first plan is an untouched empty board: in the list, not named, shared or deleted, and with no cards. */
async function firstPlanIsFree(writer: MoveWriter, store: KeyValue): Promise<boolean> {
  const first = allPlanEntries(store).find((e) => e.id === FIRST_PLAN);
  if (!first || first.named || first.shared || first.deletedAt !== undefined || first.movedFrom !== undefined) return false;
  return writer.boardIsEmpty(planDatabase(FIRST_PLAN));
}

/**
 * Write a bundle's plans here, as `planMove` places them, and the settings
 * this browser doesn't have yet. Returns the plans written, in order. Each
 * plan's databases are written before its entry, so a move cut short never
 * lists a plan without its board, and the next one finishes it.
 */
export async function applyMove(bundle: MoveBundle, writer: MoveWriter, store: KeyValue = localStorage): Promise<MovedPlan[]> {
  const firstIsFree = await firstPlanIsFree(writer, store);
  const moves = planMove(bundle, store, firstIsFree);
  const byName = new Map(bundle.databases.filter((db) => db.name.startsWith(OURS)).map((db) => [db.name, db]));
  for (const move of moves) {
    const from = databasesOf(move.entry.id);
    const to = databasesOf(move.to);
    for (const [i, name] of from.docs.entries()) {
      const updates = updatesIn(byName.get(name));
      if (updates.length > 0) await writer.mergeDoc(to.docs[i]!, updates);
    }
    if (move.into === 'new') {
      // What the relay is known to hold of this copy, so it sends only what's missing. A plan already here keeps its own.
      for (const [i, name] of from.syncs.entries()) {
        const record = syncRecordIn(byName.get(name));
        if (record !== undefined) await writer.putSync(to.syncs[i]!, record);
      }
      importPlanEntry({ ...move.entry, id: move.to, movedFrom: move.entry.id }, store);
      for (const base of SCOPED) {
        const value = bundle.local[scopedKey(base, move.entry.id)];
        if (value !== undefined && store.getItem(scopedKey(base, move.to)) === null) store.setItem(scopedKey(base, move.to), value);
      }
    } else {
      const here = allPlanEntries(store).find((e) => e.id === move.to);
      if (here?.deletedAt !== undefined) unmarkDeleted(here.id, store);
      // A Can view copy here takes the moved copy's edit key, if it had one; keys are never taken away.
      if (here?.shared && !here.shared.secret && move.entry.shared?.secret && here.shared.room === move.entry.shared.room) {
        setShared(here.id, { ...here.shared, secret: move.entry.shared.secret }, store);
      }
    }
  }
  // An untouched empty first plan no moved plan took the place of goes, rather than sit beside the moved ones.
  if (firstIsFree && moves.length > 0 && !moves.some((m) => m.to === FIRST_PLAN)) forgetPlan(FIRST_PLAN, store);
  for (const [key, value] of Object.entries(bundle.local)) {
    if (!key.startsWith(OURS) || LEFT_BEHIND.has(key) || isScoped(key)) continue;
    if (store.getItem(key) === null) store.setItem(key, value);
  }
  return moves;
}
