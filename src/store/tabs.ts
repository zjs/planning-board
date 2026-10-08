// Two tabs of one plan stay in sync (sprint 10, slice 3). Each tab has its
// own Yjs document, loaded from the plan's database; edits travel between
// them over a BroadcastChannel, the way they'll travel through the relay in
// M2. Nothing here leaves the browser.

import * as Y from 'yjs';

/** Marks edits that came from another tab, so undo never tracks them. */
export const TAB_ORIGIN = { source: 'other-tab' };

/** The part of BroadcastChannel this needs, so tests can pass a fake. */
export interface TabChannel {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
}

type Message =
  /** A tab that has just opened the plan says what it has. */
  | { type: 'hello'; state: Uint8Array }
  /** What the hello's sender is missing, and what this tab has, so it can send back what this tab is missing. */
  | { type: 'welcome'; update: Uint8Array; state: Uint8Array }
  | { type: 'update'; update: Uint8Array };

const TYPES: readonly unknown[] = ['hello', 'welcome', 'update'];
const isMessage = (data: unknown): data is Message =>
  typeof data === 'object' && data !== null && TYPES.includes((data as { type?: unknown }).type);

function openChannel(name: string): TabChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(name);
  const tab: TabChannel = {
    onmessage: null,
    postMessage: (message) => channel.postMessage(message),
    close: () => channel.close(),
  };
  channel.onmessage = (event) => tab.onmessage?.(event);
  return tab;
}

/**
 * Keep `doc` in step with the same plan open in other tabs. `name` is the
 * plan's database, so tabs on different plans never mix. Returns a function
 * that stops. Without BroadcastChannel, tabs simply don't sync.
 */
export function syncTabs(doc: Y.Doc, name: string, open: (name: string) => TabChannel | null = openChannel): () => void {
  const channel = open(`planning-board:tabs:${name}`);
  if (!channel) return () => {};
  const send = (message: Message) => channel.postMessage(message);
  const apply = (update: Uint8Array) => {
    if (update.byteLength > 2) Y.applyUpdate(doc, update, TAB_ORIGIN);
  };

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== TAB_ORIGIN) send({ type: 'update', update });
  };
  doc.on('update', onUpdate);

  channel.onmessage = ({ data }) => {
    if (!isMessage(data)) return;
    try {
      if (data.type === 'hello') {
        send({ type: 'welcome', update: Y.encodeStateAsUpdate(doc, data.state), state: Y.encodeStateVector(doc) });
      } else if (data.type === 'welcome') {
        apply(data.update);
        const missing = Y.encodeStateAsUpdate(doc, data.state);
        if (missing.byteLength > 2) send({ type: 'update', update: missing });
      } else {
        apply(data.update);
      }
    } catch {
      // A message this build can't read, perhaps from a newer build in another tab: ignore it.
    }
  };
  send({ type: 'hello', state: Y.encodeStateVector(doc) });

  return () => {
    doc.off('update', onUpdate);
    channel.onmessage = null;
    channel.close();
  };
}
