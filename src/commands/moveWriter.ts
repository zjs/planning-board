import * as Y from 'yjs';
import { persist } from '../store/persistence.ts';
import { indexedDbSyncStore, type SyncRecord } from '../store/relay.ts';
import type { MoveWriter } from './move.ts';

/** Moved plans written to this browser's IndexedDB (src/commands/move.ts). */
export const browserWriter: MoveWriter = {
  async mergeDoc(name, updates) {
    const doc = new Y.Doc();
    const kept = await persist(doc, name);
    if (kept.status !== 'saved') throw new Error('This browser won’t keep plans.');
    // What's here already loaded first, so this adds to it.
    Y.applyUpdate(doc, Y.mergeUpdates(updates));
    await kept.close();
    doc.destroy();
  },
  async putSync(name, record) {
    const store = indexedDbSyncStore(name);
    if ((await store.load()) === null) await store.save(record as SyncRecord);
  },
};
