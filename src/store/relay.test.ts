import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { deriveKeys, fromBase64Url, newRoom, toBase64Url, unseal, viewKeyOf } from './keys.ts';
import { Frame, FrameReader, RelayError } from './frames.ts';
import { memorySyncStore, RelayProvider, retireRoom, roomUrl, SNAPSHOT_EVERY, type SyncStore } from './relay.ts';
import { PresenceChannel, SILENT_MS } from './presence.ts';
import type { PeerState } from '../domain/presence.ts';
import { FakeRelay, settle, timers } from './fakeRelay.ts';

function setup() {
  const relay = new FakeRelay();
  const clock = timers();
  const { room, secret } = newRoom();
  const s = toBase64Url(secret);
  const make = (doc: Y.Doc, opts: { edit?: boolean; create?: boolean; sync?: SyncStore } = {}) =>
    new RelayProvider({
      doc,
      relay: 'http://relay.test:8787',
      room,
      viewKey: viewKeyOf(s),
      ...(opts.edit === false ? {} : { secret: s }),
      ...(opts.create ? { create: true } : {}),
      sync: opts.sync ?? memorySyncStore(),
      open: relay.open,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
  return { relay, clock, room, secret: s, make };
}

const cards = (doc: Y.Doc) => doc.getMap<string>('cards').toJSON();

describe('syncing through a relay (ADR 0017)', () => {
  it('turns a relay URL into its room address', () => {
    expect(roomUrl('http://192.168.1.23:8787', 'r'.repeat(22))).toBe(`ws://192.168.1.23:8787/rooms/${'r'.repeat(22)}`);
    expect(roomUrl('https://plans.example.com/board/', 'abc')).toBe('wss://plans.example.com/board/rooms/abc');
  });

  it('shares a plan, and someone with the edit link gets it and edits live', async () => {
    const { relay, clock, room, make } = setup();
    const alice = new Y.Doc();
    alice.getMap('cards').set('tax', 'Tax engine migration');
    const a = make(alice, { create: true });
    await settle(clock);
    expect(a.status).toBe('live');
    expect(a.canWrite).toBe(true);
    expect(a.unshared()).toBeNull();
    // The relay holds it encrypted.
    const stored = relay.rooms.get(room)!.log;
    expect(stored).toHaveLength(1);
    expect(new TextDecoder().decode(stored[0]!.data)).not.toContain('Tax engine');

    const bob = new Y.Doc();
    const b = make(bob);
    await settle(clock);
    expect(cards(bob)).toEqual({ tax: 'Tax engine migration' });

    alice.getMap('cards').set('invoices', 'Invoice redesign');
    await settle(clock);
    expect(cards(bob)).toEqual({ tax: 'Tax engine migration', invoices: 'Invoice redesign' });
    bob.getMap('cards').delete('tax');
    await settle(clock);
    expect(cards(alice)).toEqual({ invoices: 'Invoice redesign' });
    a.destroy();
    b.destroy();
  });

  it('a view link reads, and nothing it does reaches the relay', async () => {
    const { relay, clock, room, make } = setup();
    const alice = new Y.Doc();
    alice.getMap('cards').set('tax', 'Tax');
    make(alice, { create: true });
    await settle(clock);
    const viewer = new Y.Doc();
    const v = make(viewer, { edit: false });
    await settle(clock);
    expect(v.canWrite).toBe(false);
    expect(cards(viewer)).toEqual({ tax: 'Tax' });
    viewer.getMap('cards').set('forged', 'nope');
    await settle(clock);
    expect(relay.rooms.get(room)!.log).toHaveLength(1);
    expect(cards(alice)).toEqual({ tax: 'Tax' });
  });

  it('works offline, says what is unshared, and sends it all in one update on coming back', async () => {
    const { relay, clock, room, make } = setup();
    const alice = new Y.Doc();
    const a = make(alice, { create: true });
    const bob = new Y.Doc();
    make(bob);
    await settle(clock);
    relay.down = true;
    relay.cut();
    await Promise.resolve();
    alice.getMap('cards').set('one', '1');
    alice.getMap('cards').set('two', '2');
    bob.getMap('cards').set('three', '3');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(a.status).toBe('reconnecting');
    expect(a.unshared()).not.toBeNull();
    const before = relay.rooms.get(room)!.log.length;
    relay.down = false;
    await settle(clock);
    expect(a.status).toBe('live');
    expect(a.unshared()).toBeNull();
    expect(relay.rooms.get(room)!.log.length - before).toBe(2); // one catch-up update from each
    expect(cards(alice)).toEqual(cards(bob));
    expect(cards(alice)).toEqual({ one: '1', two: '2', three: '3' });
  });

  it('after a reload, asks only for what it missed, from the cursor saved with its shadow', async () => {
    const { relay, clock, room, make } = setup();
    const alice = new Y.Doc();
    alice.getMap('cards').set('a', 'A');
    const sync = memorySyncStore();
    const a = make(alice, { create: true, sync });
    await settle(clock);
    a.destroy();
    await settle(clock);
    expect(sync.record?.cursor).toBe(1);
    const shadow = new Y.Doc();
    Y.applyUpdate(shadow, sync.record!.shadow);
    expect(cards(shadow)).toEqual({ a: 'A' });

    const bob = new Y.Doc();
    make(bob);
    await settle(clock);
    bob.getMap('cards').set('b', 'B');
    await settle(clock);
    // Alice comes back with her stored plan and record.
    const again = new Y.Doc();
    Y.applyUpdate(again, Y.encodeStateAsUpdate(alice));
    let seen = 0;
    const realReceive = relay.receive.bind(relay);
    relay.receive = (socket, frame) => {
      if (new FrameReader(frame).kind === Frame.Hello) {
        const r = new FrameReader(frame);
        r.uint();
        r.bytes();
        seen = r.uint();
      }
      realReceive(socket, frame);
    };
    make(again, { sync });
    await settle(clock);
    expect(seen).toBe(1);
    expect(cards(again)).toEqual({ a: 'A', b: 'B' });
    expect(relay.rooms.get(room)!.log).toHaveLength(2);
  });

  it('a room replaced on the relay is filled again from this copy', async () => {
    const { relay, clock, room, make } = setup();
    const alice = new Y.Doc();
    alice.getMap('cards').set('a', 'A');
    const a = make(alice, { create: true });
    await settle(clock);
    // Restored from an older backup: same room, new epoch, nothing in it.
    const old = relay.rooms.get(room)!;
    relay.rooms.set(room, { ...old, epoch: crypto.getRandomValues(new Uint8Array(16)), head: 0, log: [], peers: new Set() });
    relay.cut();
    await settle(clock);
    expect(a.status).toBe('live');
    const fresh = new Y.Doc();
    make(fresh);
    await settle(clock);
    expect(cards(fresh)).toEqual({ a: 'A' });
  });

  it('someone opening a link catches up in one connection, however much the room holds', async () => {
    const { relay, clock, make } = setup();
    const alice = new Y.Doc();
    const a = make(alice, { create: true });
    await settle(clock);
    for (let i = 0; i < 5; i++) alice.getMap('cards').set(`c${i}`, `Card ${i}`);
    await settle(clock);
    expect(a.status).toBe('live');
    let opened = 0;
    const open = relay.open;
    relay.open = (url) => {
      opened++;
      return open(url);
    };
    const bob = new Y.Doc();
    const b = make(bob);
    await settle(clock);
    expect(b.status).toBe('live');
    expect(Object.keys(cards(bob))).toHaveLength(5);
    expect(opened).toBe(1);
  });

  it('a first catch-up cut short before synced still notices a restore (F10, found by formal/tla/Sync.tla)', async () => {
    const { relay, clock, room, make } = setup();
    const alice = new Y.Doc();
    alice.getMap('cards').set('a', 'A');
    const a = make(alice, { create: true });
    await settle(clock);
    // Bob's first catch-up got update 1 and saved its cursor, but the connection dropped before synced, which
    // carries the room's epoch: his record has a cursor and no epoch.
    const bob = new Y.Doc();
    bob.getMap('cards').set('a', 'A');
    const sync = memorySyncStore();
    sync.record = { room, cursor: 1, epoch: null, shadow: Y.encodeStateAsUpdate(bob) };
    // Meanwhile the relay is restored from an older backup: same room, new epoch, nothing in it.
    relay.down = true;
    relay.cut();
    await settle(clock);
    alice.getMap('cards').set('b', 'B');
    const old = relay.rooms.get(room)!;
    relay.rooms.set(room, { ...old, epoch: crypto.getRandomValues(new Uint8Array(16)), head: 0, log: [], peers: new Set() });
    relay.down = false;
    await settle(clock);
    // Alice notices the new epoch and sends everything again, as update 1 of the restored room.
    expect(a.status).toBe('live');
    expect(relay.rooms.get(room)!.head).toBe(1);
    // Bob's cursor (1) is from the old room. Asking only for what comes after it would skip the new update 1.
    make(bob, { sync });
    await settle(clock);
    expect(cards(bob)).toEqual({ a: 'A', b: 'B' });
  });

  it('a room the relay has never heard of is refused, and can be made again from this copy', async () => {
    const { clock, make } = setup();
    const alice = new Y.Doc();
    alice.getMap('cards').set('a', 'A');
    const a = make(alice);
    await settle(clock);
    expect(a.status).toBe('refused');
    expect(a.problem?.code).toBe(RelayError.UnknownRoom);
    a.recreate();
    await settle(clock);
    expect(a.status).toBe('live');
    expect(a.unshared()).toBeNull();
  });

  it('uploads a snapshot once the log is long, and a newcomer starts from it', async () => {
    const { relay, clock, room, make, secret } = setup();
    const alice = new Y.Doc();
    make(alice, { create: true });
    await settle(clock);
    for (let i = 0; i <= SNAPSHOT_EVERY; i++) {
      alice.getMap('cards').set(`c${i}`, String(i));
      await settle(clock);
    }
    const stored = relay.rooms.get(room)!;
    expect(stored.snapshot?.upto).toBeGreaterThanOrEqual(SNAPSHOT_EVERY);
    // Sealed for its reach: it opens only as a snapshot up to that update.
    const { key } = deriveKeys(fromBase64Url(secret));
    expect(() => unseal(key, room, 'snapshot', stored.snapshot!.data, stored.snapshot!.upto)).not.toThrow();
    const late = new Y.Doc();
    make(late);
    await settle(clock);
    expect(Object.keys(cards(late))).toHaveLength(SNAPSHOT_EVERY + 1);
  });

  it("a shadow from some other copy of the plan isn't trusted", async () => {
    const { clock, make } = setup();
    const other = new Y.Doc();
    other.getMap('cards').set('elsewhere', 'x');
    const sync = memorySyncStore();
    sync.record = { cursor: 40, epoch: null, shadow: Y.encodeStateAsUpdate(other) };
    const alice = new Y.Doc();
    alice.getMap('cards').set('a', 'A');
    const a = make(alice, { create: true, sync });
    await settle(clock);
    expect(a.status).toBe('live');
    expect(cards(alice)).toEqual({ a: 'A' });
  });
});

describe('making new links (Q62)', () => {
  it('retiring the old room tells everyone on it, keeps what they have, and refuses their changes', async () => {
    const { relay, clock, room, secret, make } = setup();
    const alice = new Y.Doc();
    alice.getMap('cards').set('tax', 'Tax engine migration');
    const a = make(alice, { create: true });
    const bob = new Y.Doc();
    const b = make(bob);
    await settle(clock);
    expect(cards(bob)).toEqual({ tax: 'Tax engine migration' });

    const retiring = retireRoom({ relay: 'http://relay.test:8787', room, secret, open: relay.open });
    await settle(clock);
    expect(await retiring).toBe('retired');
    expect(a.retired && b.retired).toBe(true);
    expect(b.problem?.code).toBe(RelayError.Replaced);
    // Bob keeps the plan, and what he changes now stays on his computer.
    bob.getMap('cards').set('invoices', 'Invoice redesign');
    await settle(clock);
    expect(relay.rooms.get(room)!.log).toHaveLength(1);
    expect(b.unshared()).not.toBeNull();
    // Opening the old link again says so at once, and still reads.
    const carol = new Y.Doc();
    const c = make(carol);
    await settle(clock);
    expect(c.retired).toBe(true);
    expect(cards(carol)).toEqual({ tax: 'Tax engine migration' });
    [a, b, c].forEach((p) => p.destroy());
  });

  it('retiring needs the edit link, and says when the relay is too old to do it', async () => {
    const { relay, clock, room, secret, make } = setup();
    const a = make(new Y.Doc(), { create: true });
    await settle(clock);
    const other = toBase64Url(newRoom().secret);
    const wrong = retireRoom({ relay: 'http://relay.test:8787', room, secret: other, open: relay.open });
    await settle(clock);
    expect(await wrong).toBe('failed');
    // A room the relay doesn't have needs nothing retired.
    const gone = retireRoom({ relay: 'http://relay.test:8787', room: 'x'.repeat(22), secret, open: relay.open });
    await settle(clock);
    expect(await gone).toBe('retired');
    relay.legacy = true;
    const old = retireRoom({ relay: 'http://relay.test:8787', room, secret, open: relay.open });
    await settle(clock);
    expect(await old).toBe('unsupported');
    a.destroy();
  });

  it("a sync record from the plan's old room isn't used for its new one", async () => {
    const { relay, clock, room, make } = setup();
    const sync = memorySyncStore();
    const alice = new Y.Doc();
    alice.getMap('cards').set('tax', 'Tax engine migration');
    // What the old room held is everything Alice has: by it, nothing would be unshared.
    sync.record = { room: 'oldroom_0123456789abcdef', cursor: 9, epoch: 'ab', shadow: Y.encodeStateAsUpdate(alice) };
    const a = make(alice, { create: true, sync });
    await settle(clock);
    expect(relay.rooms.get(room)!.log).toHaveLength(1);
    expect(sync.record.room).toBe(room);
    a.destroy();
  });
});

describe('presence (ADR 0019)', () => {
  const me = (id: string, patch: Partial<PeerState> = {}): PeerState => ({
    v: 1, id, name: id, color: '#c92a2a', pointer: null, selection: [], drag: null, drive: null, dropped: null, ...patch,
  });

  function room() {
    const t = setup();
    let now = 1_000_000;
    const options = { now: () => now, setTimer: t.clock.setTimer, clearTimer: t.clock.clearTimer };
    return { ...t, options, advance: (ms: number) => (now += ms) };
  }

  it('shows each person what the others point at and select, sealed on the way', async () => {
    const { clock, make, options, relay } = room();
    const a = make(new Y.Doc(), { create: true });
    await settle(clock);
    const b = make(new Y.Doc(), { edit: false });
    await settle(clock);
    const pa = new PresenceChannel(a, options);
    const pb = new PresenceChannel(b, options);
    // What travels through the relay is sealed: spy on what the fake relay forwards.
    const forwarded: string[] = [];
    const deliver = Object.getOwnPropertyDescriptor(Object.getPrototypeOf([...relay.sockets][0]!), 'deliver')!.value as (f: Uint8Array) => void;
    for (const s of relay.sockets) {
      const sock = s as unknown as { deliver: (f: Uint8Array) => void };
      sock.deliver = (f: Uint8Array) => {
        forwarded.push(new TextDecoder().decode(f));
        deliver.call(s, f);
      };
    }
    pa.set(me('ada', { pointer: { item: 'card-1', fx: 0.2, fy: 0.8 }, selection: ['card-1', 'card-2'] }));
    pb.set(me('bo'));
    await settle(clock);
    expect(pb.states()).toEqual([me('ada', { pointer: { item: 'card-1', fx: 0.2, fy: 0.8 }, selection: ['card-1', 'card-2'] })]);
    expect(pa.states().map((s) => s.id)).toEqual(['bo']);
    expect(forwarded.join('')).not.toContain('card-1');
    pa.destroy();
    pb.destroy();
    a.destroy();
    b.destroy();
  });

  it('drops someone who leaves, or goes quiet, and brings them back on their next heartbeat', async () => {
    const { clock, make, options, advance } = room();
    const a = make(new Y.Doc(), { create: true });
    const b = make(new Y.Doc());
    await settle(clock);
    const pa = new PresenceChannel(a, options);
    const pb = new PresenceChannel(b, options);
    pa.set(me('ada'));
    pb.set(me('bo'));
    await settle(clock);
    expect(pa.states()).toHaveLength(1);
    // Quiet: Bo's tab stops sending (as a sleeping laptop would) while Ada's keeps going.
    pb.destroy();
    advance(SILENT_MS);
    await settle(clock);
    expect(pa.states()).toHaveLength(0);
    // Gone: the relay says so.
    const pc = new PresenceChannel(b, options);
    pc.set(me('bo'));
    await settle(clock);
    expect(pa.states()).toHaveLength(1);
    b.destroy();
    await settle(clock);
    expect(pa.states()).toHaveLength(0);
    pa.destroy();
    pc.destroy();
    a.destroy();
  });

  it('remembers the highest claim to drive it has seen (Q71)', async () => {
    const { clock, make, options } = room();
    const a = make(new Y.Doc(), { create: true });
    const b = make(new Y.Doc());
    await settle(clock);
    const pa = new PresenceChannel(a, options);
    const pb = new PresenceChannel(b, options);
    pb.set(me('bo', { drive: 7 }));
    await settle(clock);
    expect(pa.claimsSeen()).toBe(7);
    pb.set(me('bo'));
    await settle(clock);
    expect(pa.claimsSeen()).toBe(7);
    pa.destroy();
    pb.destroy();
    a.destroy();
    b.destroy();
  });
});
