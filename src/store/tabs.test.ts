import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { syncTabs, TAB_ORIGIN, type TabChannel } from './tabs.ts';

/** Channels that deliver to every other channel of the same name, asynchronously, like BroadcastChannel. */
function hub() {
  const open: { name: string; channel: TabChannel }[] = [];
  const pending: Promise<void>[] = [];
  const make = (name: string): TabChannel => {
    const channel: TabChannel = {
      onmessage: null,
      postMessage(data) {
        for (const other of open) {
          if (other.channel === channel || other.name !== name) continue;
          pending.push(Promise.resolve().then(() => other.channel.onmessage?.({ data: structuredClone(data) })));
        }
      },
      close() {
        const at = open.findIndex((o) => o.channel === channel);
        if (at !== -1) open.splice(at, 1);
      },
    };
    open.push({ name, channel });
    return channel;
  };
  const settle = async () => {
    while (pending.length > 0) await pending.splice(0).reduce((a, b) => a.then(() => b), Promise.resolve());
  };
  return { make, settle };
}

const text = (doc: Y.Doc) => doc.getMap('items').toJSON();

describe('two tabs, one plan', () => {
  it('edits in either tab reach the other', async () => {
    const { make, settle } = hub();
    const a = new Y.Doc();
    const b = new Y.Doc();
    syncTabs(a, 'plan', make);
    syncTabs(b, 'plan', make);
    a.getMap('items').set('x', 1);
    await settle();
    expect(text(b)).toEqual({ x: 1 });
    b.getMap('items').set('y', 2);
    await settle();
    expect(text(a)).toEqual({ x: 1, y: 2 });
  });

  it('a tab opened later catches up, and passes on what only it has', async () => {
    const { make, settle } = hub();
    const a = new Y.Doc();
    syncTabs(a, 'plan', make);
    a.getMap('items').set('x', 1);
    await settle();
    const b = new Y.Doc();
    b.getMap('items').set('mine', true);
    syncTabs(b, 'plan', make);
    await settle();
    expect(text(b)).toEqual({ x: 1, mine: true });
    expect(text(a)).toEqual({ x: 1, mine: true });
  });

  it('marks edits from another tab, so undo leaves them alone', async () => {
    const { make, settle } = hub();
    const a = new Y.Doc();
    const b = new Y.Doc();
    syncTabs(a, 'plan', make);
    syncTabs(b, 'plan', make);
    const origins: unknown[] = [];
    b.on('update', (_: Uint8Array, origin: unknown) => origins.push(origin));
    a.getMap('items').set('x', 1);
    await settle();
    expect(origins).toEqual([TAB_ORIGIN]);
  });

  it('tabs on different plans, or stopped, stay apart', async () => {
    const { make, settle } = hub();
    const a = new Y.Doc();
    const b = new Y.Doc();
    const c = new Y.Doc();
    syncTabs(a, 'plan', make);
    syncTabs(b, 'other', make);
    const stop = syncTabs(c, 'plan', make);
    stop();
    a.getMap('items').set('x', 1);
    await settle();
    expect(text(b)).toEqual({});
    expect(text(c)).toEqual({});
  });

  it('ignores messages it can’t read', async () => {
    const { make, settle } = hub();
    const a = new Y.Doc();
    syncTabs(a, 'plan', make);
    make('planning-board:tabs:plan').postMessage({ type: 'update', update: new Uint8Array([9, 9, 9]) });
    make('planning-board:tabs:plan').postMessage('nonsense');
    await settle();
    expect(text(a)).toEqual({});
  });
});
