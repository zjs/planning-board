// stub.html, which the old address of the public build serves once it has
// moved (Q80 d, ADR 0025). Share links go on to the new address with the
// same fragment, so a key never reaches a server. Someone with plans still
// kept here is offered to move them, or to open the old copy of the app,
// kept beside this page at ./app/, to save them to files.

import { MOVE_TO_KEY, NEW_PUBLIC_APP, OURS } from './addresses.ts';
import { ourDatabases, plansHeld } from './collect.ts';

const to = new URL(localStorage.getItem(MOVE_TO_KEY) ?? NEW_PUBLIC_APP);
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

async function held(): Promise<number> {
  try {
    return plansHeld(local(), await ourDatabases());
  } catch {
    return plansHeld(local(), []);
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

void held().then((count) => {
  if (isShareLink) {
    location.replace(`${base}${hash}${count > 0 ? '&moved=1' : ''}`);
    return;
  }
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
