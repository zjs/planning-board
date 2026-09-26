import { expect, test } from '@playwright/test';
import { APP_URL } from './app.ts';

// Slice 1 spike: slice 2 persists the Yjs document in IndexedDB, and the
// build is opened from disk. Confirm IndexedDB survives a reload on file://.
test('IndexedDB persists across reloads when opened from file://', async ({ page }) => {
  const idb = (op: 'write' | 'read') =>
    page.evaluate(
      (op) =>
        new Promise<string | null>((resolve, reject) => {
          const open = indexedDB.open('spike', 1);
          open.onupgradeneeded = () => open.result.createObjectStore('kv');
          open.onerror = () => reject(new Error(String(open.error)));
          open.onsuccess = () => {
            const tx = open.result.transaction('kv', op === 'write' ? 'readwrite' : 'readonly');
            const store = tx.objectStore('kv');
            const req = op === 'write' ? store.put('hello', 'k') : store.get('k');
            req.onsuccess = () => resolve(op === 'write' ? null : (req.result as string | null));
            req.onerror = () => reject(new Error(String(req.error)));
          };
        }),
      op,
    );
  await page.goto(APP_URL);
  await idb('write');
  await page.reload();
  expect(await idb('read')).toBe('hello');
});
