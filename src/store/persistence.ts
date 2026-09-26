import { IndexeddbPersistence } from 'y-indexeddb';
import type * as Y from 'yjs';
import { SCHEMA_VERSION } from './schema.ts';

export type PersistenceStatus = 'saved' | 'unavailable';

/** One plan for now; scenarios will each get their own name (ADR 0003). */
export const DB_NAME = `planning-board:v${SCHEMA_VERSION}:default`;

const LOAD_TIMEOUT_MS = 4000;

/**
 * Keep `doc` in IndexedDB. Resolves once stored content is loaded, or with
 * 'unavailable' if the browser won't give us IndexedDB (some browsers
 * restrict it for files opened from disk). Then the board still works,
 * but changes won't survive a reload, and the UI says so.
 */
export async function persist(doc: Y.Doc): Promise<PersistenceStatus> {
  try {
    if (typeof indexedDB === 'undefined') return 'unavailable';
    const provider = new IndexeddbPersistence(DB_NAME, doc);
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), LOAD_TIMEOUT_MS));
    const result = await Promise.race([provider.whenSynced.then(() => 'synced' as const), timeout]);
    return result === 'synced' ? 'saved' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
