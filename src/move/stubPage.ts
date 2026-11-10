// stub.html, which the old address of the public build serves once it has
// moved (Q80 d, ADR 0025). Share links go on to the new address with the
// same fragment, so a key never reaches a server. Someone with plans still
// kept here is offered to move them, or to open the old copy of the app,
// kept beside this page at ./app/, to save them to files.

import { MOVE_TO_KEY, NEW_PUBLIC_APP, OURS, testOverride } from './addresses.ts';
import { movablePlans } from '../commands/move.ts';
import { collect, ourDatabases } from './collect.ts';

const to = new URL(testOverride(MOVE_TO_KEY) ?? NEW_PUBLIC_APP);
const base = to.href.replace(/[#?].*$/, '');
const hash = location.hash;
const isShareLink = /^#v=\d+&room=/.test(hash);

function local(): Record<string, string> {
  const all: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(OURS)) all[key] = localStorage.getItem(key) ?? '';
  }
  return all;
}

/**
 * Whether this browser might keep plans here, without reading them: a plan named or shared, a plan other than the
 * first, or a board from before schema 2. Enough for a share link's `&moved=1`, which the new address checks properly.
 */
function mightHold(): boolean {
  const all = local();
  try {
    const list: unknown = JSON.parse(all['planning-board:plans'] ?? '[]');
    if (Array.isArray(list) && list.some((e: { id?: string; named?: boolean; shared?: unknown; deletedAt?: number }) => e.deletedAt === undefined && (e.id !== 'default' || e.named === true || e.shared !== undefined))) return true;
  } catch {
    // A damaged list: the full count decides.
  }
  return false;
}

/** How many plans this browser keeps here that are worth moving: not an empty plan nobody named or shared. */
async function held(): Promise<number> {
  try {
    return movablePlans(await collect()).length;
  } catch {
    // A browser that can't list its databases: the move can't read them either, so offer the old app.
    return Object.keys(local()).length > 0 ? 1 : 0;
  }
}

async function forget(): Promise<void> {
  for (const key of Object.keys(local())) localStorage.removeItem(key);
  const names = await ourDatabases().catch(() => [] as string[]);
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = request.onerror = request.onblocked = () => resolve();
        }),
    ),
  );
}

// A share link goes on at once: reading every plan first could take seconds on a long history.
if (isShareLink) location.replace(`${base}${hash}${mightHold() ? '&moved=1' : ''}`);
else void held().then((count) => {
  if (count === 0) {
    // A plan's own address (#plan=…) names an id that may differ at the new address.
    location.replace(base);
    return;
  }
  document.getElementById('new-address')!.textContent = to.origin;
  (document.getElementById('move') as HTMLAnchorElement).href = `${base}#moved`;
  document.getElementById('count')!.textContent = count === 1 ? '1 plan' : `${count} plans`;
  document.getElementById('held')!.hidden = false;
  document.getElementById('forget')!.addEventListener('click', () => {
    if (!confirm('Delete every plan kept at this address, in this browser? Do it once they’re at the new address: this can’t be undone.')) return;
    void forget().then(() => {
      document.getElementById('held')!.hidden = true;
      document.getElementById('forgotten')!.hidden = false;
    });
  });
});
