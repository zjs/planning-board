import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { SCHEMA_VERSION, schemaOf } from './schema.ts';
import { migrateV1 } from './schemaV1.ts';

export type PersistenceStatus = 'saved' | 'unavailable';

/** One plan for now; scenarios will each get their own name (ADR 0003). */
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

/**
 * Keep `doc` in IndexedDB. Resolves once stored content is loaded, or with
 * 'unavailable' if the browser won't give us IndexedDB (some browsers
 * restrict it for files opened from disk). Then the board still works,
 * but changes won't survive a reload, and the UI says so.
 */
export async function persist(doc: Y.Doc): Promise<PersistenceStatus> {
  try {
    if (typeof indexedDB === 'undefined') return 'unavailable';
    const provider = await load(DB_NAME, doc);
    if (!provider) return 'unavailable';
    await migrateFromV1(doc);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}
