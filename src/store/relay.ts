// Sync a plan through a relay (ADR 0017), end-to-end encrypted (ADR 0018).
//
// The relay can't read Yjs, so it can't answer Yjs's own sync handshake.
// It numbers the encrypted updates it receives instead. This provider keeps
// the last number it has seen (its cursor) and a "shadow" document of what
// the relay is known to hold. What the relay is missing from us, after an
// hour offline say, is then exactly the document minus the shadow, sent as
// one update whenever the provider catches up. Nothing records "unsent"
// separately, so another tab, an undo or a repair can't make it wrong.
//
// The shadow and the cursor are saved together, in one record, so a reload
// never skips an update. If two tabs overwrite each other's record, the
// older one only means fetching some updates again.

import * as Y from 'yjs';
import { deriveKeys, fromBase64Url, seal, unseal } from './keys.ts';
import { Frame, FrameReader, FrameWriter, HelloFlag, PROTOCOL_VERSION, RelayError } from './frames.ts';
import { TAB_ORIGIN } from './tabs.ts';

/** Marks edits that came from the relay, so undo never tracks them and they aren't sent back. */
export const RELAY_ORIGIN = { source: 'relay' };

/** Upload a snapshot once the relay holds this many updates past the last one. */
export const SNAPSHOT_EVERY = 200;

export type ConnectionStatus =
  /** Opening, before the first catch-up. */
  | 'connecting'
  /** Caught up, and sending changes as they're made. */
  | 'live'
  /** Lost the connection, and trying again. */
  | 'reconnecting'
  /** The relay refused this plan for good: see `problem`. */
  | 'refused';

/** A refusal from the relay, in words for a person. */
export interface RelayProblem {
  code: number;
  message: string;
}

/** What survives a reload: the cursor, the room's epoch, and the shadow they belong to. */
export interface SyncRecord {
  cursor: number;
  epoch: string | null;
  shadow: Uint8Array;
}

/** Where the record is kept: IndexedDB in a browser, memory in tests. */
export interface SyncStore {
  load(): Promise<SyncRecord | null>;
  save(record: SyncRecord): Promise<void>;
}

/** The part of WebSocket the provider uses, so tests can pass a fake relay. */
export interface RelaySocket {
  send(frame: Uint8Array): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((frame: Uint8Array) => void) | null;
  onclose: (() => void) | null;
}

export type OpenSocket = (url: string) => RelaySocket;

export interface RelayOptions {
  doc: Y.Doc;
  /** The relay's address: http(s)://host[:port][/path]. */
  relay: string;
  room: string;
  /** The encryption key, from the link (base64url). */
  viewKey: string;
  /** The edit link's secret (base64url), which gives the write token; absent for a view link. */
  secret?: string;
  /** Make the room if it doesn't exist: sharing a plan. */
  create?: boolean;
  sync: SyncStore;
  open?: OpenSocket;
  /** Clock and timers, replaceable in tests. */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

const FATAL: readonly number[] = [
  RelayError.OutdatedRelay,
  RelayError.OutdatedClient,
  RelayError.UnknownRoom,
  RelayError.RoomTaken,
  RelayError.HelloFirst,
];

/** The relay's WebSocket address for a room. */
export function roomUrl(relay: string, room: string): string {
  const url = new URL(relay);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/rooms/${room}`;
  url.hash = '';
  url.search = '';
  return url.toString();
}

function openWebSocket(url: string): RelaySocket {
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  const socket: RelaySocket = {
    send: (frame) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(new Uint8Array(frame));
    },
    close: () => ws.close(),
    onopen: null,
    onmessage: null,
    onclose: null,
  };
  ws.onopen = () => socket.onopen?.();
  ws.onmessage = (event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) socket.onmessage?.(new Uint8Array(event.data));
  };
  ws.onclose = () => socket.onclose?.();
  return socket;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class RelayProvider {
  status: ConnectionStatus = 'connecting';
  /** Whether the relay accepted our write token. False until the first catch-up, and always for a view link. */
  canWrite = false;
  /** Why the relay refused this plan or a change to it, if it did. Cleared by the next accepted change. */
  problem: RelayProblem | null = null;
  /** When the provider was last caught up, or null if never. */
  lastLive: number | null = null;
  /** When it lost a live connection, or null while live or before it ever was. */
  lostAt: number | null = null;
  /** When this connection was opened. */
  readonly openedAt: number;
  /** Resolves the first time the provider has caught up. */
  readonly whenSynced: Promise<void>;
  /** The relay's number for this connection, as others see it. */
  self: number | null = null;

  private shadow = new Y.Doc();
  private cursor = 0;
  private epoch: string | null = null;
  private head = 0;
  private snapshotUpto = 0;
  private socket: RelaySocket | null = null;
  private pending = new Map<number, Uint8Array>();
  private nextRef = 0;
  private retry = 0;
  private retryTimer: unknown = null;
  private saveTimer: unknown = null;
  private replay = false;
  private replayTried = false;
  private destroyed = false;
  private create: boolean;
  private listeners = new Set<() => void>();
  private ephemeralListeners = new Set<(from: number, data: Uint8Array | null) => void>();
  private resolveSynced: () => void = () => {};
  private readonly key: Uint8Array;
  private readonly token: Uint8Array | null;
  private readonly open: OpenSocket;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;

  private readonly options: RelayOptions;

  constructor(options: RelayOptions) {
    this.options = options;
    this.key = fromBase64Url(options.viewKey);
    this.token = options.secret ? deriveKeys(fromBase64Url(options.secret)).token : null;
    this.create = options.create === true;
    this.open = options.open ?? openWebSocket;
    this.now = options.now ?? Date.now;
    this.openedAt = this.now();
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
    this.whenSynced = new Promise((resolve) => (this.resolveSynced = resolve));
    options.doc.on('update', this.onDocUpdate);
    // The browser says when the network comes and goes, sooner than a socket would notice.
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline);
      window.addEventListener('offline', this.onOffline);
    }
    void this.start();
  }

  private onOnline = () => {
    if (this.status !== 'live' && this.status !== 'refused') this.reconnectNow();
  };

  private onOffline = () => {
    this.socket?.close();
  };

  private async start() {
    const record = await this.options.sync.load().catch(() => null);
    if (this.destroyed) return;
    if (record) {
      Y.applyUpdate(this.shadow, record.shadow);
      this.cursor = record.cursor;
      this.epoch = record.epoch;
      // A shadow that holds something the plan doesn't belongs to some other copy of it: start again.
      if (Y.encodeStateAsUpdate(this.shadow, Y.encodeStateVector(this.options.doc)).byteLength > 2) this.reset();
    }
    this.connect();
  }

  /** Called on every change of status, of what's shared, or of a problem. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  /** The changes on this computer that the relay doesn't hold yet, as one Yjs update; null if none. */
  unshared(): Uint8Array | null {
    const diff = Y.encodeStateAsUpdate(this.options.doc, Y.encodeStateVector(this.shadow));
    return diff.byteLength > 2 && !Y.equalSnapshots(Y.snapshot(this.options.doc), Y.snapshot(this.shadow)) ? diff : null;
  }

  /**
   * Presence from someone else in the room (ADR 0019): their connection's
   * number, and the message, opened; null when they leave. Messages that
   * can't be opened, written with another key, are ignored.
   */
  onEphemeral(listener: (from: number, data: Uint8Array | null) => void): () => void {
    this.ephemeralListeners.add(listener);
    return () => void this.ephemeralListeners.delete(listener);
  }

  /** Send presence, sealed, to everyone else in the room. Only while live: presence is never queued. */
  sendEphemeral(plain: Uint8Array): boolean {
    if (this.status !== 'live' || !this.socket) return false;
    this.socket.send(new FrameWriter(Frame.Ephemeral).bytes(seal(this.key, this.options.room, 'presence', plain)).done());
    return true;
  }

  /** What the relay is known to hold, as one Yjs update: to say what isn't shared yet. */
  sharedState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.shadow);
  }

  /** Make the room again from this copy: after the relay lost it. */
  recreate() {
    if (!this.token) return;
    this.create = true;
    this.reset();
    this.problem = null;
    this.reconnectNow();
  }

  destroy() {
    this.destroyed = true;
    this.options.doc.off('update', this.onDocUpdate);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
    }
    if (this.retryTimer !== null) this.clearTimer(this.retryTimer);
    if (this.saveTimer !== null) {
      this.clearTimer(this.saveTimer);
      void this.flushSave();
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private reset() {
    this.shadow = new Y.Doc();
    this.cursor = 0;
    this.epoch = null;
    this.head = 0;
    this.snapshotUpto = 0;
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.emit();
  }

  private connect() {
    if (this.destroyed) return;
    const socket = this.open(roomUrl(this.options.relay, this.options.room));
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      let flags = 0;
      if (this.create && this.token) flags |= HelloFlag.Create;
      if (this.replay) flags |= HelloFlag.Replay;
      socket.send(
        new FrameWriter(Frame.Hello)
          .uint(PROTOCOL_VERSION)
          .bytes(this.token ?? new Uint8Array())
          .uint(this.replay ? 0 : this.cursor)
          .uint(flags)
          .done(),
      );
    };
    socket.onmessage = (frame) => {
      if (this.socket !== socket) return;
      try {
        this.handle(new FrameReader(frame));
      } catch {
        // A frame this build can't read: ignore it, as the protocol allows for additions.
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.pending.clear();
      if (this.destroyed || this.status === 'refused') return;
      if (this.status === 'live') this.lostAt = this.now();
      this.setStatus(this.lastLive === null ? 'connecting' : 'reconnecting');
      // Back off, with jitter, so a relay that comes back isn't met by everyone at once.
      const delay = Math.min(10_000, 500 * 2 ** this.retry) * (0.7 + Math.random() * 0.6);
      this.retry = Math.min(this.retry + 1, 5);
      this.retryTimer = this.setTimer(() => {
        this.retryTimer = null;
        this.connect();
      }, delay);
    };
  }

  private reconnectNow() {
    if (this.retryTimer !== null) {
      this.clearTimer(this.retryTimer);
      this.retryTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.connect();
  }

  private apply(target: Y.Doc, update: Uint8Array) {
    Y.applyUpdate(target, update, RELAY_ORIGIN);
  }

  private handle(r: FrameReader) {
    switch (r.kind) {
      case Frame.SnapshotOut: {
        const upto = r.uint();
        r.uint(); // received at
        const data = r.bytes();
        try {
          const update = unseal(this.key, this.options.room, 'snapshot', data, upto);
          this.apply(this.shadow, update);
          this.apply(this.options.doc, update);
          this.cursor = Math.max(this.cursor, upto);
          this.scheduleSave();
        } catch {
          // A snapshot we can't read: ask once for every update the relay still keeps instead.
          if (!this.replayTried) {
            this.replay = true;
            this.replayTried = true;
            this.reconnectNow();
          }
        }
        break;
      }
      case Frame.UpdateOut: {
        const seq = r.uint();
        r.uint(); // received at, for history (sprint 13)
        const data = r.bytes();
        // Count it as seen even if it can't be read, so it isn't fetched again and again.
        this.cursor = Math.max(this.cursor, seq);
        this.head = Math.max(this.head, seq);
        try {
          const update = unseal(this.key, this.options.room, 'update', data);
          this.apply(this.shadow, update);
          this.apply(this.options.doc, update);
        } catch {
          // Written with another key, or changed on the way.
        }
        this.scheduleSave();
        this.emit();
        break;
      }
      case Frame.Synced: {
        const head = r.uint();
        const upto = r.uint();
        const epoch = hex(r.bytes());
        this.self = r.uint();
        this.canWrite = r.uint() === 1;
        // A room replaced or restored from a backup: start again from what this copy has.
        if ((this.epoch !== null && epoch !== this.epoch) || head < this.cursor) {
          this.reset();
          this.epoch = epoch;
          this.reconnectNow();
          return;
        }
        this.epoch = epoch;
        this.head = head;
        this.snapshotUpto = upto;
        this.replay = false;
        this.create = false;
        this.retry = 0;
        this.lastLive = this.now();
        this.lostAt = null;
        this.status = 'live';
        if (this.canWrite) {
          const diff = this.unshared();
          if (diff) this.send(diff);
        }
        this.scheduleSave();
        this.emit();
        this.resolveSynced();
        break;
      }
      case Frame.Ack: {
        const ref = r.uint();
        const seq = r.uint();
        const update = this.pending.get(ref);
        this.pending.delete(ref);
        if (update) this.apply(this.shadow, update);
        this.cursor = Math.max(this.cursor, seq);
        this.head = Math.max(this.head, seq);
        if (this.problem && !FATAL.includes(this.problem.code)) this.problem = null;
        this.scheduleSave();
        this.emit();
        break;
      }
      case Frame.Error: {
        const code = r.uint();
        const message = r.text();
        if (r.more()) this.pending.delete(r.uint());
        this.problem = { code, message };
        if (FATAL.includes(code)) {
          this.status = 'refused';
          const socket = this.socket;
          this.socket = null;
          socket?.close();
        }
        this.emit();
        break;
      }
      case Frame.EphemeralOut: {
        const from = r.uint();
        const data = r.bytes();
        let plain: Uint8Array;
        try {
          plain = unseal(this.key, this.options.room, 'presence', data);
        } catch {
          break;
        }
        for (const listener of this.ephemeralListeners) listener(from, plain);
        break;
      }
      case Frame.Left: {
        const from = r.uint();
        for (const listener of this.ephemeralListeners) listener(from, null);
        break;
      }
    }
    this.maybeSnapshot();
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === RELAY_ORIGIN) return;
    // Another tab sends its own changes; this tab's catch-up covers any it couldn't.
    if (origin !== TAB_ORIGIN && this.status === 'live' && this.canWrite) this.send(update);
    this.emit();
  };

  private send(update: Uint8Array) {
    const ref = ++this.nextRef;
    this.pending.set(ref, update);
    this.socket?.send(new FrameWriter(Frame.Update).uint(ref).bytes(seal(this.key, this.options.room, 'update', update)).done());
  }

  /** Once the relay holds enough updates past its snapshot, a caught-up writer uploads a new one. */
  private maybeSnapshot() {
    if (!this.canWrite || this.status !== 'live' || this.cursor !== this.head || this.head - this.snapshotUpto < SNAPSHOT_EVERY) return;
    const upto = this.cursor;
    const data = seal(this.key, this.options.room, 'snapshot', Y.encodeStateAsUpdate(this.shadow), upto);
    this.socket?.send(new FrameWriter(Frame.Snapshot).uint(upto).bytes(data).done());
    this.snapshotUpto = upto;
  }

  private scheduleSave() {
    if (this.saveTimer !== null) return;
    this.saveTimer = this.setTimer(() => {
      this.saveTimer = null;
      void this.flushSave();
    }, 500);
  }

  private flushSave() {
    return this.options.sync
      .save({ cursor: this.cursor, epoch: this.epoch, shadow: Y.encodeStateAsUpdate(this.shadow) })
      .catch(() => undefined);
  }
}

/** The sync record kept in memory: for tests, and when the browser won't give IndexedDB. */
export function memorySyncStore(): SyncStore & { record: SyncRecord | null } {
  const store = {
    record: null as SyncRecord | null,
    load: () => Promise.resolve(store.record),
    save: (record: SyncRecord) => {
      store.record = record;
      return Promise.resolve();
    },
  };
  return store;
}

/** The sync record in its own small IndexedDB database, beside the plan's. */
export function indexedDbSyncStore(name: string): SyncStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('sync');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB'));
    });
  const run = <T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>) =>
    open().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction('sync', mode);
          const request = body(tx.objectStore('sync'));
          tx.oncomplete = () => {
            db.close();
            resolve(request.result);
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error ?? new Error('IndexedDB'));
          };
        }),
    );
  return {
    load: () => run<SyncRecord | undefined>('readonly', (s) => s.get('record') as IDBRequest<SyncRecord | undefined>).then((r) => r ?? null),
    save: (record) => run('readwrite', (s) => s.put(record, 'record')).then(() => undefined),
  };
}
