import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { indexedDbSyncStore, type SyncRecord } from '../store/relay.ts';
import { readPlan } from '../store/schema.ts';
import type { MoveWriter } from './move.ts';

/** Open a document's database here, with what it holds loaded. */
async function open(name: string): Promise<{ doc: Y.Doc; provider: IndexeddbPersistence }> {
  const doc = new Y.Doc();
  const provider = new IndexeddbPersistence(name, doc);
  await provider.whenSynced;
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
    const empty = Object.keys(readPlan(doc).items).length === 0;
    await provider.destroy();
    doc.destroy();
    return empty;
  },
};
