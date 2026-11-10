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
import { isEmpty, schemaOf } from '../store/schema.ts';
import { migrateV1 } from '../store/schemaV1.ts';
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
  /** The plan here was deleted, and comes back. */
  restored?: true;
  /**
   * The moved copy is shared and the plan here isn't (`adopted`: it takes the
   * moved copy's sharing), or here it's shared through another room
   * (`differs`: it keeps its own, and the dialog says so).
   */
  sharing?: 'adopted' | 'differs';
}

const isScoped = (key: string) => SCOPED.some((base) => key === base || key.startsWith(`${base}:`));

function updatesIn(db: MovedDatabase | undefined): Uint8Array[] {
  return (db?.stores.find((s) => s.name === 'updates')?.records ?? []).map((r) => r.value).filter((v): v is Uint8Array => v instanceof Uint8Array);
}

function syncRecordIn(db: MovedDatabase | undefined): unknown {
  return db?.stores.find((s) => s.name === 'sync')?.records.find((r) => r.key === 'record')?.value;
}

/** The schema-1 board a browser kept before it had several plans (ADR 0016): moved as the first plan's board. */
const V1_DATABASE = 'planning-board:v1:default';

/**
 * A plan's board in the bundle, as updates to merge. A browser that last ran
 * a build before schema 2 has its board only in the v1 database: it's
 * migrated here, as opening the app there would have done.
 */
function boardUpdates(bundle: MoveBundle, id: PlanId): Uint8Array[] {
  const own = updatesIn(bundle.databases.find((db) => db.name === planDatabase(id)));
  if (own.length > 0 || id !== FIRST_PLAN) return own;
  const v1 = updatesIn(bundle.databases.find((db) => db.name === V1_DATABASE));
  if (v1.length === 0) return [];
  const old = new Y.Doc();
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(old, Y.mergeUpdates(v1));
    if (schemaOf(old) !== 1) return [];
    migrateV1(old, doc);
    return [Y.encodeStateAsUpdate(doc)];
  } catch {
    return [];
  } finally {
    old.destroy();
    doc.destroy();
  }
}

/** Whether updates make an empty plan: no properties and no cards, the app's own rule (ADR 0021). */
function isEmptyBoard(updates: Uint8Array[]): boolean {
  if (updates.length === 0) return true;
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, Y.mergeUpdates(updates));
    return isEmpty(doc);
  } catch {
    return false;
  } finally {
    doc.destroy();
  }
}

/**
 * Whether a plan is worth moving: shared, named by hand, a board that isn't
 * empty, or a history of its own, whose deletions can still be restored.
 */
function worthMoving(bundle: MoveBundle, entry: PlanEntry): boolean {
  if (entry.shared !== undefined || entry.named === true) return true;
  const history = updatesIn(bundle.databases.find((db) => db.name === historyDatabase(entry.id, 'local')));
  return history.length > 0 || !isEmptyBoard(boardUpdates(bundle, entry.id));
}

/**
 * The plans a bundle holds that are worth moving: not deleted, and not an
 * empty plan nobody named or shared, such as the first plan a browser makes
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
  return entries.filter((e) => e.deletedAt === undefined && worthMoving(bundle, e));
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
      const sharing = !shared || same.shared?.room === shared.room ? undefined : same.shared ? 'differs' : 'adopted';
      return { entry, to: same.id, into: 'existing', ...(same.deletedAt !== undefined ? { restored: true } : {}), ...(sharing ? { sharing } : {}) };
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
  /** Whether a plan's board here is empty: no properties and no cards. */
  boardIsEmpty(name: string): Promise<boolean>;
  /** Delete a plan's databases here. */
  dropPlan(id: PlanId): Promise<void>;
}

/** A plan's databases, by role: its board, its two histories, and the two sync records. */
function databasesOf(id: PlanId) {
  return {
    docs: [planDatabase(id), historyDatabase(id, 'local'), historyDatabase(id, 'shared')],
    syncs: [syncDatabase(id), historySyncDatabase(id)],
  };
}

/** Whether this browser's first plan is an untouched empty board: in the list, not named, shared, moved or deleted, and empty. */
async function firstPlanIsFree(writer: MoveWriter, store: KeyValue): Promise<boolean> {
  const first = allPlanEntries(store).find((e) => e.id === FIRST_PLAN);
  if (!first || first.named || first.shared || first.deletedAt !== undefined || first.movedFrom !== undefined) return false;
  return writer.boardIsEmpty(planDatabase(FIRST_PLAN));
}

/**
 * Write a bundle's plans here, as `planMove` places them, and the settings
 * this browser doesn't have yet. Returns the plans written, in order. A new
 * plan's databases are written before its entry, so a move cut short never
 * lists a plan without its board; the free first plan is listed already, so
 * its entry, with `movedFrom`, goes first. Either way the next move finishes it.
 */
export async function applyMove(bundle: MoveBundle, writer: MoveWriter, store: KeyValue = localStorage): Promise<MovedPlan[]> {
  const firstIsFree = await firstPlanIsFree(writer, store);
  const moves = planMove(bundle, store, firstIsFree);
  const byName = new Map(bundle.databases.filter((db) => db.name.startsWith(OURS)).map((db) => [db.name, db]));
  const syncs = async (move: MovedPlan) => {
    // What the relay is known to hold of the moved copy, so it sends only what's missing. A record here is kept.
    const from = databasesOf(move.entry.id).syncs;
    const to = databasesOf(move.to).syncs;
    for (const [i, name] of from.entries()) {
      const record = syncRecordIn(byName.get(name));
      if (record !== undefined) await writer.putSync(to[i]!, record);
    }
  };
  const list = (move: MovedPlan) => {
    importPlanEntry({ ...move.entry, id: move.to, movedFrom: move.entry.id }, store);
    for (const base of SCOPED) {
      const value = bundle.local[scopedKey(base, move.entry.id)];
      if (value !== undefined && store.getItem(scopedKey(base, move.to)) === null) store.setItem(scopedKey(base, move.to), value);
    }
  };
  for (const move of moves) {
    if (move.into === 'new' && move.to === FIRST_PLAN) list(move);
    const from = databasesOf(move.entry.id).docs;
    const to = databasesOf(move.to).docs;
    for (const [i, name] of from.entries()) {
      const updates = i === 0 ? boardUpdates(bundle, move.entry.id) : updatesIn(byName.get(name));
      if (updates.length > 0) await writer.mergeDoc(to[i]!, updates);
    }
    if (move.into === 'new') {
      await syncs(move);
      if (move.to !== FIRST_PLAN) list(move);
      continue;
    }
    const here = allPlanEntries(store).find((e) => e.id === move.to);
    if (here?.deletedAt !== undefined) unmarkDeleted(here.id, store);
    if (move.sharing === 'adopted' && move.entry.shared) {
      // Shared at the old address since it was first moved: the plan here takes that sharing, which is newer.
      await syncs(move);
      setShared(move.to, move.entry.shared, store);
    } else if (here?.shared && !here.shared.secret && move.entry.shared?.secret && here.shared.room === move.entry.shared.room) {
      // A Can view copy here takes the moved copy's edit key, if it had one; keys are never taken away.
      setShared(here.id, { ...here.shared, secret: move.entry.shared.secret }, store);
    }
  }
  // An untouched empty first plan no moved plan took the place of goes, rather than sit beside the moved ones,
  // unless something was put in it meanwhile.
  if (firstIsFree && moves.length > 0 && !moves.some((m) => m.to === FIRST_PLAN) && (await writer.boardIsEmpty(planDatabase(FIRST_PLAN)))) {
    forgetPlan(FIRST_PLAN, store);
    await writer.dropPlan(FIRST_PLAN);
  }
  for (const [key, value] of Object.entries(bundle.local)) {
    if (!key.startsWith(OURS) || LEFT_BEHIND.has(key) || isScoped(key)) continue;
    if (store.getItem(key) === null) store.setItem(key, value);
  }
  return moves;
}
