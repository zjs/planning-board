// A Yjs provider for the relay spike (spikes/relay). Every update and every
// presence message is encrypted before it leaves the browser.
//
// The relay can't read Yjs, so it can't answer Yjs's own sync handshake.
// Instead it numbers the updates it receives. This provider remembers the
// last number it has seen, asks for everything after it on reconnecting,
// and keeps a "shadow" document of what the relay is known to hold. What
// the relay is missing from us, after an hour offline say, is then exactly
// `encodeStateAsUpdate(doc, stateVector(shadow))`.
//
// Works in browsers and in Node 22 (for the measurements in bench.ts).

import * as Y from 'yjs';
import { fromBase64, seal, toBase64, unseal } from './crypto.ts';

export type Status = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface PeerState {
  name: string;
  color: string;
  [key: string]: unknown;
}

/** Small key-value storage for what survives a reload: localStorage in a browser, a Map in Node. */
export interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const memoryStore = (): Store => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
};

interface Wire {
  t: string;
  seq?: number;
  after?: number;
  upto?: number;
  head?: number;
  ref?: string;
  from?: string;
  data?: string;
}

export interface Stats {
  /** Messages and bytes received while catching up, from "hello" to "synced". */
  catchUpMessages: number;
  catchUpBytes: number;
  catchUpMs: number;
  sentUpdates: number;
  sentPlainBytes: number;
  sentWireBytes: number;
}

/** Upload a snapshot once the relay holds this many updates past the last one. */
export const SNAPSHOT_EVERY = 200;

export class EncryptedProvider {
  status: Status = 'connecting';
  /** What the relay is known to hold: every update received from it, and ours once acknowledged. */
  readonly shadow = new Y.Doc();
  lastSeq = 0;
  head = 0;
  snapshotUpto = 0;
  /** This connection's ID at the relay, which peers see as `from`. */
  self: string | null = null;
  readonly peers = new Map<string, { state: PeerState; at: number }>();
  readonly stats: Stats = { catchUpMessages: 0, catchUpBytes: 0, catchUpMs: 0, sentUpdates: 0, sentPlainBytes: 0, sentWireBytes: 0 };

  private ws: WebSocket | null = null;
  private manualOffline = false;
  private pending = new Map<string, Uint8Array>();
  private nextRef = 0;
  /** Local changes the relay may not have: made offline, or sent but never acknowledged. */
  private unsent: boolean;
  private retry = 500;
  private local: PeerState | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private catchUpStart = 0;
  private listeners = new Set<() => void>();
  private syncedOnce: () => void = () => {};
  /** Resolves the first time the provider is live: caught up, and its own changes sent. */
  readonly whenSynced = new Promise<void>((resolve) => (this.syncedOnce = resolve));
  /** Called at the moment a reconnect starts receiving, with what the board held just before. */
  onReconnect: ((wasAwaySince: number) => void) | null = null;
  private awaySince = 0;

  readonly doc: Y.Doc;
  readonly url: string;
  readonly room: string;
  private readonly key: CryptoKey;
  private readonly store: Store;
  /** Upload a snapshot once the relay holds this many updates past the last one; Infinity never does. */
  private readonly snapshotEvery: number;

  constructor(doc: Y.Doc, url: string, room: string, key: CryptoKey, store: Store = memoryStore(), snapshotEvery = SNAPSHOT_EVERY) {
    this.doc = doc;
    this.url = url;
    this.room = room;
    this.key = key;
    this.store = store;
    this.snapshotEvery = snapshotEvery;
    this.lastSeq = Number(store.get('seq') ?? 0);
    const saved = store.get('shadow');
    if (saved) Y.applyUpdate(this.shadow, fromBase64(saved));
    // On first use of a room, everything in the document is new to the relay.
    this.unsent = store.get('unsent') !== 'false';
    this.awaySince = Number(store.get('lastLive') ?? 0);
    doc.on('update', this.onLocalUpdate);
    this.heartbeat = setInterval(() => {
      if (this.local) this.sendPresence();
      const now = Date.now();
      for (const [id, peer] of this.peers) if (now - peer.at > 10_000) this.peers.delete(id);
      this.emit();
    }, 3000);
    this.connect();
  }

  /** Resolves the next time the provider is live (now, if it is). */
  whenLive(): Promise<void> {
    if (this.status === 'live') return Promise.resolve();
    return new Promise((resolve) => {
      const off = this.subscribe(() => {
        if (this.status !== 'live') return;
        off();
        resolve();
      });
    });
  }

  /** Called on every status, peer or presence change. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private setStatus(status: Status) {
    if (this.status === 'live' && status !== 'live') this.awaySince = Date.now();
    this.status = status;
    if (status === 'live') this.store.set('lastLive', String(Date.now()));
    this.emit();
  }

  /** How many local changes are waiting to reach the relay (an estimate: 1 if there's anything at all). */
  get waiting(): number {
    return this.pending.size + (this.unsent && this.status !== 'live' ? 1 : 0);
  }

  goOffline() {
    this.manualOffline = true;
    this.ws?.close();
    this.setStatus('offline');
  }

  goOnline() {
    this.manualOffline = false;
    this.connect();
  }

  destroy() {
    this.manualOffline = true;
    this.doc.off('update', this.onLocalUpdate);
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.ws?.close();
  }

  private connect() {
    if (this.manualOffline) return;
    this.setStatus(this.status === 'live' || this.status === 'offline' ? 'reconnecting' : this.status);
    const ws = new WebSocket(`${this.url}/rooms/${this.room}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 500;
      this.catchUpStart = Date.now();
      this.stats.catchUpMessages = 0;
      this.stats.catchUpBytes = 0;
      if (this.awaySince > 0) this.onReconnect?.(this.awaySince);
      ws.send(JSON.stringify({ t: 'hello', after: this.lastSeq }));
    };
    ws.onmessage = (event) => void this.receive(String(event.data));
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.peers.clear();
      if (this.pending.size > 0) this.markUnsent(true);
      this.pending.clear();
      if (this.manualOffline) {
        this.setStatus('offline');
        return;
      }
      this.setStatus('reconnecting');
      setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(this.retry * 2, 5000);
    };
  }

  // Messages are handled one at a time, in arrival order, though decrypting is async.
  private queue: Promise<void> = Promise.resolve();
  private receive(text: string) {
    this.queue = this.queue.then(() => this.handle(text)).catch((e: unknown) => console.error('relay message', e));
    return this.queue;
  }

  private async handle(text: string) {
    const m = JSON.parse(text) as Wire;
    if (this.status !== 'live') {
      this.stats.catchUpMessages++;
      this.stats.catchUpBytes += text.length;
    }
    switch (m.t) {
      case 'snapshot':
      case 'update': {
        // Count it as seen even if it can't be read (another key, or tampered with), so it isn't fetched again.
        this.lastSeq = Math.max(this.lastSeq, (m.t === 'snapshot' ? m.upto : m.seq) ?? 0);
        this.head = Math.max(this.head, this.lastSeq);
        this.save();
        const update = await unseal(this.key, this.room, m.data!);
        Y.applyUpdate(this.shadow, update, this);
        Y.applyUpdate(this.doc, update, this);
        break;
      }
      case 'ack': {
        const update = this.pending.get(m.ref!);
        this.pending.delete(m.ref!);
        if (update) Y.applyUpdate(this.shadow, update, this);
        this.lastSeq = Math.max(this.lastSeq, m.seq ?? 0);
        this.head = Math.max(this.head, m.seq ?? 0);
        this.save();
        this.emit();
        break;
      }
      case 'synced': {
        // The relay leaves zeros out of its JSON.
        this.head = m.head ?? 0;
        this.snapshotUpto = m.upto ?? 0;
        this.self = m.from ?? null;
        this.stats.catchUpMs = Date.now() - this.catchUpStart;
        // Everything the relay is missing from us, in one update, unless it's missing nothing.
        if (this.unsent && !Y.equalSnapshots(Y.snapshot(this.doc), Y.snapshot(this.shadow))) {
          await this.send(Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(this.shadow)));
        }
        this.markUnsent(false);
        this.setStatus('live');
        this.awaySince = 0;
        if (this.local) this.sendPresence();
        this.syncedOnce();
        break;
      }
      case 'ephemeral': {
        const state = JSON.parse(new TextDecoder().decode(await unseal(this.key, this.room, m.data!))) as PeerState | null;
        if (state === null) this.peers.delete(m.from!);
        else this.peers.set(m.from!, { state, at: Date.now() });
        this.emit();
        break;
      }
      case 'left':
        this.peers.delete(m.from!);
        this.emit();
        break;
    }
    if (this.head - this.snapshotUpto >= this.snapshotEvery && this.status === 'live' && this.lastSeq === this.head) {
      await this.uploadSnapshot();
    }
  }

  /** Make and upload a snapshot of everything the relay holds, so it can drop the log behind it. */
  async uploadSnapshot() {
    const upto = this.lastSeq;
    const data = await seal(this.key, this.room, Y.encodeStateAsUpdate(this.shadow));
    this.ws?.send(JSON.stringify({ t: 'snapshot', upto, data }));
    this.snapshotUpto = upto;
  }

  private onLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return;
    if (this.status === 'live' && this.ws?.readyState === 1) void this.send(update);
    else this.markUnsent(true);
  };

  private async send(update: Uint8Array) {
    const ref = String(++this.nextRef);
    this.pending.set(ref, update);
    const data = await seal(this.key, this.room, update);
    const text = JSON.stringify({ t: 'update', ref, data });
    this.stats.sentUpdates++;
    this.stats.sentPlainBytes += update.length;
    this.stats.sentWireBytes += text.length;
    if (this.ws?.readyState === 1) this.ws.send(text);
    else this.markUnsent(true);
    this.emit();
  }

  private markUnsent(value: boolean) {
    this.unsent = value;
    this.store.set('unsent', String(value));
  }

  /**
   * Remember the last sequence number seen, with the shadow it belongs to. They're saved together, a
   * moment later: a number saved ahead of the updates it covers would skip them after a reload.
   */
  private save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.store.set('shadow', toBase64(Y.encodeStateAsUpdate(this.shadow)));
      this.store.set('seq', String(this.lastSeq));
    }, 1000);
  }

  /** Share what this person is doing: where their pointer is, what's selected. Sent at most every 50 ms. */
  setPresence(state: PeerState) {
    this.local = state;
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      this.sendPresence();
    }, 50);
  }

  private sendPresence() {
    if (!this.local || this.status !== 'live' || this.ws?.readyState !== 1) return;
    const ws = this.ws;
    void seal(this.key, this.room, new TextEncoder().encode(JSON.stringify(this.local))).then((data) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'ephemeral', data }));
    });
  }
}
