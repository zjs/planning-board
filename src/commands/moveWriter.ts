import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { indexedDbSyncStore, type SyncRecord } from '../store/relay.ts';
import { isEmpty } from '../store/schema.ts';
import type { MoveWriter } from './move.ts';
import { dropPlanDatabase } from './plans.ts';

const OPEN_TIMEOUT_MS = 8000;

/**
 * Open a document's database here, with what it holds loaded. Like `persist`, it gives up rather than wait for good:
 * when the browser won't open IndexedDB, or another tab holds the database while it upgrades.
 */
async function open(name: string): Promise<{ doc: Y.Doc; provider: IndexeddbPersistence }> {
  const doc = new Y.Doc();
  const provider = new IndexeddbPersistence(name, doc);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fail = (why: string) => new Error(`This browser couldn’t save the plans here (${why}). Try again, or save them to files at the old address.`);
  try {
    await Promise.race([
      provider.whenSynced,
      provider._db.then(
        () => new Promise<never>(() => undefined),
        () => Promise.reject(fail('its storage is unavailable')),
      ),
      new Promise<never>((_, reject) => (timer = setTimeout(() => reject(fail('its storage didn’t answer')), OPEN_TIMEOUT_MS))),
    ]);
  } catch (error) {
    void provider.destroy().catch(() => undefined);
    doc.destroy();
    throw error;
  } finally {
    clearTimeout(timer);
  }
  return { doc, provider };
}

/**
 * Resolve once every write already started on the database is stored. y-indexeddb starts a write on each update
 * without waiting for it; a transaction started after it, on the same store, completes only after it does.
 */
async function stored(provider: IndexeddbPersistence): Promise<void> {
  const db = await provider._db;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['updates'], 'readonly');
    tx.objectStore('updates').count();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB'));
  });
}

/** Moved plans written to this browser's IndexedDB (src/commands/move.ts). */
export const browserWriter: MoveWriter = {
  async mergeDoc(name, updates) {
    const { doc, provider } = await open(name);
    // What's here already is loaded first, so this adds to it.
    Y.applyUpdate(doc, Y.mergeUpdates(updates));
    await stored(provider);
    await provider.destroy();
    doc.destroy();
  },
  async putSync(name, record) {
    const store = indexedDbSyncStore(name);
    if ((await store.load()) === null) await store.save(record as SyncRecord);
  },
  async boardIsEmpty(name) {
    const { doc, provider } = await open(name);
    const empty = isEmpty(doc);
    await provider.destroy();
    doc.destroy();
    return empty;
  },
  dropPlan: (id) => dropPlanDatabase(id),
};
