// A relay in memory that speaks the relay's protocol (relay/PROTOCOL.md), for
// tests: the provider's own (relay.test.ts) and the random schedules
// (src/commands/schedules.test.ts). Test code only.

import { toBase64Url } from './keys.ts';
import { Frame, FrameReader, FrameWriter, HelloFlag, RelayError } from './frames.ts';
import type { RelaySocket } from './relay.ts';

/**
 * A relay in memory that speaks the same protocol as relay/ (PROTOCOL.md),
 * delivering frames a microtask later, as a network would. Tests drive
 * time by running its queue and the providers' timers.
 */
export class FakeRelay {
  rooms = new Map<string, { token: string; epoch: Uint8Array; head: number; log: { seq: number; data: Uint8Array }[]; snapshot?: { upto: number; data: Uint8Array }; peers: Set<FakeSocket>; retired?: boolean }>();
  down = false;
  /** A relay from before sprint 12: no `retired` in synced, and no retiring. */
  legacy = false;
  /** Asked on each catch-up: true drops the connection after the updates and before synced, as a flaky network can. */
  cutCatchUp: () => boolean = () => false;
  sockets = new Set<FakeSocket>();
  private nextPeer = 0;
  open = (url: string): RelaySocket => {
    const socket = new FakeSocket(this, url.split('/rooms/')[1]!, ++this.nextPeer);
    this.sockets.add(socket);
    queueMicrotask(() => (this.down ? socket.drop() : socket.onopen?.()));
    return socket;
  };
  /** Every connection drops, as when the network goes. */
  cut() {
    for (const s of [...this.sockets]) s.drop();
  }
  /** A copy of a room, as a backup would keep it. */
  backup(room: string) {
    const r = this.rooms.get(room)!;
    return { ...r, log: [...r.log], ...(r.snapshot ? { snapshot: { ...r.snapshot } } : {}), peers: new Set<FakeSocket>() };
  }
  /** Restore a room from a backup, started once with -restored: a new epoch, and everyone connected drops. */
  restore(room: string, backup: ReturnType<FakeRelay['backup']>) {
    for (const s of [...this.sockets]) if (s.room === room) s.drop();
    this.rooms.set(room, { ...backup, log: [...backup.log], epoch: crypto.getRandomValues(new Uint8Array(16)), peers: new Set() });
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
      if (flags & HelloFlag.Retire && !this.legacy) {
        if (!socket.canWrite) { socket.refuse(RelayError.ReadOnly); return; }
        if (!target.retired) {
          target.retired = true;
          for (const peer of target.peers) peer.deliver(new FrameWriter(Frame.Error).uint(RelayError.Replaced).bytes(new TextEncoder().encode('replaced')).done());
        }
      }
      let from = after;
      if (target.snapshot && after < target.snapshot.upto) {
        socket.deliver(new FrameWriter(Frame.SnapshotOut).uint(target.snapshot.upto).uint(0).bytes(target.snapshot.data).done());
        from = target.snapshot.upto;
      }
      for (const e of target.log) if (e.seq > from) socket.deliver(new FrameWriter(Frame.UpdateOut).uint(e.seq).uint(0).bytes(e.data).done());
      if (this.cutCatchUp()) {
        queueMicrotask(() => queueMicrotask(() => socket.drop()));
        return;
      }
      const upto = target.snapshot?.upto ?? 0;
      const synced = new FrameWriter(Frame.Synced).uint(target.head).uint(upto).bytes(target.epoch).uint(socket.id).uint(socket.canWrite ? 1 : 0);
      socket.deliver((this.legacy ? synced : synced.uint(target.retired ? 1 : 0)).done());
      target.peers.add(socket);
      return;
    }
    if (!room) return;
    if (r.kind === Frame.Update) {
      const ref = r.uint();
      const data = r.bytes();
      if (room.retired) { socket.deliver(new FrameWriter(Frame.Error).uint(RelayError.Replaced).bytes(new TextEncoder().encode('replaced')).uint(ref).done()); return; }
      if (!socket.canWrite) { socket.deliver(new FrameWriter(Frame.Error).uint(RelayError.ReadOnly).bytes(new TextEncoder().encode('view only')).uint(ref).done()); return; }
      const seq = ++room.head;
      room.log.push({ seq, data });
      for (const peer of room.peers) if (peer !== socket) peer.deliver(new FrameWriter(Frame.UpdateOut).uint(seq).uint(0).bytes(data).done());
      socket.deliver(new FrameWriter(Frame.Ack).uint(ref).uint(seq).uint(0).done());
    } else if (r.kind === Frame.Ephemeral && !room.retired) {
      // Presence is forwarded to everyone else, view links included, and never kept.
      const data = r.bytes();
      for (const peer of room.peers) if (peer !== socket) peer.deliver(new FrameWriter(Frame.EphemeralOut).uint(socket.id).bytes(data).done());
    } else if (r.kind === Frame.Snapshot && socket.canWrite) {
      const upto = r.uint();
      room.snapshot = { upto, data: r.bytes() };
      room.log = room.log.filter((e) => e.seq > upto);
    }
  }
}

export class FakeSocket implements RelaySocket {
  onopen: (() => void) | null = null;
  onmessage: ((frame: Uint8Array) => void) | null = null;
  onclose: (() => void) | null = null;
  canWrite = false;
  private closed = false;
  constructor(
    private readonly relay: FakeRelay,
    readonly room: string,
    readonly id: number,
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
    for (const room of this.relay.rooms.values()) {
      if (!room.peers.delete(this)) continue;
      for (const peer of room.peers) peer.deliver(new FrameWriter(Frame.Left).uint(this.id).done());
    }
    queueMicrotask(() => this.onclose?.());
  }
}

/** Timers the test runs by hand. */
export function timers() {
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
export async function settle(clock: ReturnType<typeof timers>) {
  for (let i = 0; i < 50; i++) {
    for (let j = 0; j < 20; j++) await Promise.resolve();
    if (clock.run() === 0) {
      for (let j = 0; j < 20; j++) await Promise.resolve();
      if (clock.run() === 0) return;
    }
  }
}
