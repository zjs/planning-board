import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { deriveKeys, fromBase64Url, newRoom, toBase64Url, unseal, viewKeyOf } from './keys.ts';
import { Frame, FrameReader, FrameWriter, HelloFlag, RelayError } from './frames.ts';
import { memorySyncStore, RelayProvider, roomUrl, SNAPSHOT_EVERY, type RelaySocket, type SyncStore } from './relay.ts';

/**
 * A relay in memory that speaks the same protocol as relay/ (PROTOCOL.md),
 * delivering frames a microtask later, as a network would. Tests drive
 * time by running its queue and the providers' timers.
 */
class FakeRelay {
  rooms = new Map<string, { token: string; epoch: Uint8Array; head: number; log: { seq: number; data: Uint8Array }[]; snapshot?: { upto: number; data: Uint8Array }; peers: Set<FakeSocket> }>();
  down = false;
  sockets = new Set<FakeSocket>();
  open = (url: string): RelaySocket => {
    const socket = new FakeSocket(this, url.split('/rooms/')[1]!);
    this.sockets.add(socket);
    queueMicrotask(() => (this.down ? socket.drop() : socket.onopen?.()));
    return socket;
  };
  /** Every connection drops, as when the network goes. */
  cut() {
    for (const s of [...this.sockets]) s.drop();
  }
  receive(socket: FakeSocket, frame: Uint8Array) {
    const r = new FrameReader(frame);
    const room = this.rooms.get(socket.room);
    if (r.kind === Frame.Hello) {
      r.uint();
      const token = toBase64Url(r.bytes());
      const after = r.uint();
      const flags = r.uint();
      let target = room;
      if (!target) {
        if (!(flags & HelloFlag.Create) || !token) { socket.refuse(RelayError.UnknownRoom); return; }
        target = { token, epoch: crypto.getRandomValues(new Uint8Array(16)), head: 0, log: [], peers: new Set() };
        this.rooms.set(socket.room, target);
      } else if (flags & HelloFlag.Create && token !== target.token) {
        socket.refuse(RelayError.RoomTaken); return;
      }
      socket.canWrite = token !== '' && token === target.token;
      let from = after;
      if (target.snapshot && after < target.snapshot.upto) {
        socket.deliver(new FrameWriter(Frame.SnapshotOut).uint(target.snapshot.upto).uint(0).bytes(target.snapshot.data).done());
        from = target.snapshot.upto;
      }
      for (const e of target.log) if (e.seq > from) socket.deliver(new FrameWriter(Frame.UpdateOut).uint(e.seq).uint(0).bytes(e.data).done());
      const upto = target.snapshot?.upto ?? 0;
      socket.deliver(new FrameWriter(Frame.Synced).uint(target.head).uint(upto).bytes(target.epoch).uint(1).uint(socket.canWrite ? 1 : 0).done());
      target.peers.add(socket);
      return;
    }
    if (!room) return;
    if (r.kind === Frame.Update) {
      const ref = r.uint();
      const data = r.bytes();
      if (!socket.canWrite) { socket.deliver(new FrameWriter(Frame.Error).uint(RelayError.ReadOnly).bytes(new TextEncoder().encode('view only')).uint(ref).done()); return; }
      const seq = ++room.head;
      room.log.push({ seq, data });
      for (const peer of room.peers) if (peer !== socket) peer.deliver(new FrameWriter(Frame.UpdateOut).uint(seq).uint(0).bytes(data).done());
      socket.deliver(new FrameWriter(Frame.Ack).uint(ref).uint(seq).uint(0).done());
    } else if (r.kind === Frame.Snapshot && socket.canWrite) {
      const upto = r.uint();
      room.snapshot = { upto, data: r.bytes() };
      room.log = room.log.filter((e) => e.seq > upto);
    }
  }
}

class FakeSocket implements RelaySocket {
  onopen: (() => void) | null = null;
  onmessage: ((frame: Uint8Array) => void) | null = null;
  onclose: (() => void) | null = null;
  canWrite = false;
  private closed = false;
  constructor(
    private readonly relay: FakeRelay,
    readonly room: string,
  ) {}
  send(frame: Uint8Array) {
    if (this.closed) return;
    const copy = frame.slice();
    queueMicrotask(() => !this.closed && this.relay.receive(this, copy));
  }
  deliver(frame: Uint8Array) {
    queueMicrotask(() => !this.closed && this.onmessage?.(frame));
  }
  refuse(code: number) {
    this.deliver(new FrameWriter(Frame.Error).uint(code).bytes(new TextEncoder().encode('refused')).done());
    queueMicrotask(() => this.drop());
  }
  close() {
    this.drop();
  }
  drop() {
    if (this.closed) return;
    this.closed = true;
    this.relay.sockets.delete(this);
    for (const room of this.relay.rooms.values()) room.peers.delete(this);
    queueMicrotask(() => this.onclose?.());
  }
}

/** Timers the test runs by hand. */
function timers() {
  const queue = new Set<() => void>();
  return {
    setTimer: (fn: () => void) => {
      queue.add(fn);
      return fn;
    },
    clearTimer: (t: unknown) => void queue.delete(t as () => void),
    run() {
      const due = [...queue];
      queue.clear();
      for (const fn of due) fn();
      return due.length;
    },
  };
}

/** Let messages flow, and run timers, until nothing is left to do. */
async function settle(clock: ReturnType<typeof timers>) {
  for (let i = 0; i < 50; i++) {
    for (let j = 0; j < 20; j++) await Promise.resolve();
    if (clock.run() === 0) {
      for (let j = 0; j < 20; j++) await Promise.resolve();
      if (clock.run() === 0) return;
    }
  }
}

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
