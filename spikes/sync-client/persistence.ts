// Stands in for src/store/persistence.ts in the spike build only
// (vite.config.ts aliases it), so the real app syncs through the relay
// without a line of app code changing.
//
// - With no room in the link, it's the app's own persistence, plus a
//   "Share this plan" button.
// - With `#room=…&key=…`, the board is that room's: kept in its own
//   IndexedDB database (so it doesn't touch your own board) and synced,
//   encrypted, through the relay that served the page.

import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { SCHEMA_VERSION } from '../../src/store/schema.ts';
import { importKey, newKey, newRoomId } from './crypto.ts';
import { mountCollaboration } from './presence.ts';
import { EncryptedProvider, memoryStore, type Store } from './provider.ts';

export type PersistenceStatus = 'saved' | 'unavailable';

const link = new URLSearchParams(location.hash.slice(1));
const room = link.get('room');
const keyText = link.get('key');

export const DB_NAME = room ? `planning-board:v${SCHEMA_VERSION}:room:${room}` : `planning-board:v${SCHEMA_VERSION}:default`;

const relayUrl = () => link.get('relay') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

const roomStore = (id: string): Store => ({
  get: (k) => localStorage.getItem(`spike:${id}:${k}`),
  set: (k, v) => localStorage.setItem(`spike:${id}:${k}`, v),
});

async function loadLocal(doc: Y.Doc): Promise<PersistenceStatus> {
  const provider = new IndexeddbPersistence(DB_NAME, doc);
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 4000));
  const result = await Promise.race([provider.whenSynced.then(() => 'synced' as const), timeout]);
  return result === 'synced' ? 'saved' : 'unavailable';
}

/** Turn the board in front of you into a shared one: upload it, encrypted, to a new room, and open that room. */
async function share(doc: Y.Doc) {
  const id = newRoomId();
  const { key, text } = await newKey();
  // Nothing about this upload is remembered: the page that opens the room catches up from the start.
  const provider = new EncryptedProvider(doc, relayUrl(), id, key, memoryStore());
  await provider.whenSynced;
  // Wait for the relay to acknowledge the upload before leaving the page.
  await new Promise<void>((resolve) => {
    const check = () => (provider.waiting === 0 ? resolve() : setTimeout(check, 50));
    check();
  });
  provider.destroy();
  location.hash = `room=${id}&key=${text}`;
  location.reload();
}

export async function persist(doc: Y.Doc): Promise<PersistenceStatus> {
  if (typeof indexedDB === 'undefined') return 'unavailable';
  const status = await loadLocal(doc);
  if (!room || !keyText) {
    mountShareButton(() => void share(doc));
    return status;
  }
  const provider = new EncryptedProvider(doc, relayUrl(), room, await importKey(keyText), roomStore(room));
  mountCollaboration(doc, provider);
  // Open as soon as the board is caught up, or after a moment if the relay can't be reached: offline still works.
  await Promise.race([provider.whenSynced, new Promise((resolve) => setTimeout(resolve, 3000))]);
  return status;
}

function mountShareButton(onShare: () => void) {
  const button = document.createElement('button');
  button.textContent = 'Share this plan (spike)';
  button.className = 'spike-share';
  button.dataset.testid = 'spike-share';
  Object.assign(button.style, {
    position: 'fixed', left: '12px', bottom: '12px', zIndex: '1000', padding: '6px 10px',
    font: '13px system-ui, sans-serif', border: '1px solid #888', borderRadius: '6px', background: '#fffbe6', cursor: 'pointer',
  });
  button.onclick = () => {
    button.disabled = true;
    button.textContent = 'Sharing…';
    onShare();
  };
  document.body.append(button);
}
