// Everything the app keeps at this address, read as stored, for move.html to
// hand to the new address (Q80 d, ADR 0025). Plain browser code with no
// imports from the app, so the page stays small, and reads every database the
// app keeps today or later without knowing what's in it.

import { MOVE_FROM_KEY, MOVE_TO_KEY, OURS, type MoveBundle, type MovedDatabase } from './addresses.ts';

/** Every IndexedDB database the app keeps here, by name. */
export async function ourDatabases(): Promise<string[]> {
  if (typeof indexedDB.databases !== 'function') throw new Error('This browser can’t list what it keeps.');
  return (await indexedDB.databases()).map((db) => db.name).filter((name): name is string => name?.startsWith(OURS) === true);
}

/** One database, every store and record in it, without changing it. */
function readDatabase(name: string): Promise<MovedDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    // Opening a database that isn't there would make it: stop instead.
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onerror = () => resolve({ name, stores: [] });
    request.onsuccess = () => {
      const db = request.result;
      const names = Array.from(db.objectStoreNames);
      if (names.length === 0) {
        db.close();
        resolve({ name, stores: [] });
        return;
      }
      const tx = db.transaction(names, 'readonly');
      const reads = names.map((store) => ({ store, keys: tx.objectStore(store).getAllKeys(), values: tx.objectStore(store).getAll() }));
      tx.oncomplete = () => {
        db.close();
        resolve({
          name,
          stores: reads.map(({ store, keys, values }) => ({
            name: store,
            records: keys.result.map((key, i) => ({ key, value: values.result[i] as unknown })),
          })),
        });
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error(`Couldn’t read ${name}`));
      };
    };
  });
}

/** Everything the app keeps at this address. */
export async function collect(): Promise<MoveBundle> {
  const local: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === null || !key.startsWith(OURS) || key === MOVE_FROM_KEY || key === MOVE_TO_KEY) continue;
    const value = localStorage.getItem(key);
    if (value !== null) local[key] = value;
  }
  const databases: MovedDatabase[] = [];
  for (const name of await ourDatabases()) databases.push(await readDatabase(name));
  return { format: 'planning-board-move', version: 1, local, databases };
}

/** How many plans this browser keeps here, deleted ones left out. */
export function plansHeld(local: Record<string, string>, databases: readonly string[]): number {
  const raw = local['planning-board:plans'];
  if (raw === undefined) return databases.some((name) => name.endsWith(':default')) ? 1 : 0;
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((e: unknown) => typeof e === 'object' && e !== null && !('deletedAt' in e)).length : 0;
  } catch {
    return 0;
  }
}
