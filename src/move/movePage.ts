// move.html, at the old address of the public build (Q80 d, ADR 0025). The
// new address opens it in a tab of its own when someone chooses to bring
// their plans, since a page shown inside another can't see this address's
// storage. It reads everything the app keeps here and posts it to the page
// that opened it, which only that address can receive, then closes.

import { MOVE_TO_KEY, NEW_PUBLIC_APP } from './addresses.ts';
import { collect, plansHeld } from './collect.ts';

const say = (text: string) => {
  document.getElementById('status')!.textContent = text;
};

const to = new URL(localStorage.getItem(MOVE_TO_KEY) ?? NEW_PUBLIC_APP);
const opener = window.opener as Window | null;

if (!opener) {
  say(`This page hands the plans kept here to Planning Board at ${to.origin}. Open Planning Board there, and choose to bring your plans from this address.`);
} else {
  collect().then(
    (bundle) => {
      opener.postMessage(bundle, to.origin);
      const count = plansHeld(bundle.local, bundle.databases.map((db) => db.name));
      say(`Sent ${count === 1 ? '1 plan' : `${count} plans`} to ${to.origin}. You can close this tab.`);
      setTimeout(() => window.close(), 400);
    },
    (error: unknown) => {
      opener.postMessage({ format: 'planning-board-move-failed', reason: error instanceof Error ? error.message : String(error) }, to.origin);
      say('Your plans couldn’t be read here. Open the old copy of the app and save each plan to a file instead.');
    },
  );
}
