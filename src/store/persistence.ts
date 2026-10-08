import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { SCHEMA_VERSION, schemaOf } from './schema.ts';
import { migrateV1 } from './schemaV1.ts';

export type PersistenceStatus = 'saved' | 'unavailable';

/** The first plan's database (ADR 0021). Other plans are named by `planDatabase` (src/store/plans.ts). */
export const DB_NAME = `planning-board:v${SCHEMA_VERSION}:default`;
/** Where builds before schema 2 kept the board (ADR 0016). Read once to migrate, and never written. */
export const V1_DB_NAME = 'planning-board:v1:default';

const LOAD_TIMEOUT_MS = 4000;

/** Load an IndexedDB database into `doc`, or give up after a while. */
async function load(name: string, doc: Y.Doc): Promise<IndexeddbPersistence | null> {
  const provider = new IndexeddbPersistence(name, doc);
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), LOAD_TIMEOUT_MS));
  const result = await Promise.race([provider.whenSynced.then(() => 'synced' as const), timeout]);
  if (result === 'synced') return provider;
  // Detach, so a load that finishes late can't merge an old board into whatever happens next.
  void provider.destroy();
  return null;
}

/** Whether a database exists, where the browser can say; otherwise assume it might. */
async function mightExist(name: string): Promise<boolean> {
  if (typeof indexedDB.databases !== 'function') return true;
  try {
    return (await indexedDB.databases()).some((db) => db.name === name);
  } catch {
    return true;
  }
}

/**
 * The first time a browser that used an earlier build opens this one, copy
 * its board into schema 2 (ADR 0016). The old database is left as it was,
 * so an older build opened from disk still finds its last board there.
 */
async function migrateFromV1(doc: Y.Doc): Promise<void> {
  if (schemaOf(doc) !== 0 || !(await mightExist(V1_DB_NAME))) return;
  const old = new Y.Doc();
  const provider = await load(V1_DB_NAME, old);
  if (!provider) return;
  if (schemaOf(old) === 1) migrateV1(old, doc);
  await provider.destroy();
}

/** A plan's board kept in IndexedDB, and how to stop keeping it there. */
export interface Persisted {
  status: PersistenceStatus;
  /** Detach from the database, so it can be dropped or opened by another document. */
  close: () => Promise<void>;
}

const nothingToClose = async () => {};

/**
 * Keep `doc` in IndexedDB, in the database `name`. Resolves once stored
 * content is loaded, or with 'unavailable' if the browser won't give us
 * IndexedDB (some browsers restrict it for files opened from disk). Then
 * the board still works, but changes won't survive a reload, and the UI
 * says so. Only the first plan's database migrates a version 1 board.
 */
export async function persist(doc: Y.Doc, name: string = DB_NAME): Promise<Persisted> {
  try {
    if (typeof indexedDB === 'undefined') return { status: 'unavailable', close: nothingToClose };
    const provider = await load(name, doc);
    if (!provider) return { status: 'unavailable', close: nothingToClose };
    if (name === DB_NAME) await migrateFromV1(doc);
    return { status: 'saved', close: () => provider.destroy() };
  } catch {
    return { status: 'unavailable', close: nothingToClose };
  }
}

/** Delete a database for good. Waits while another tab still has it open, without failing. */
export function dropDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = request.onerror = () => resolve();
      // Blocked by another tab: it goes when that tab lets go. Don't hold the caller up.
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
