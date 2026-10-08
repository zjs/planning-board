// Presence over the relay (ADR 0019): this tab's state, sent sealed through
// the relay's presence channel, and everyone else's, as they arrive.
//
// - Sending is throttled: at most one message every 50 ms while something
//   changes, and a heartbeat every 3 seconds while nothing does.
// - Someone silent for 10 seconds is dropped, as is anyone the relay says
//   has left. Losing the connection drops everyone: their heartbeats will
//   bring them back once it returns.
// - On every new connection this tab sends its state at once, so others
//   see it arrive without waiting for a heartbeat.

import { parsePeerState, type PeerState } from '../domain/presence.ts';
import type { RelayProvider } from './relay.ts';

export const THROTTLE_MS = 50;
export const HEARTBEAT_MS = 3000;
export const SILENT_MS = 10_000;

export interface PresenceOptions {
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class PresenceChannel {
  private local: PeerState | null = null;
  private peers = new Map<number, { state: PeerState; seen: number }>();
  private listeners = new Set<() => void>();
  private lastSent = -Infinity;
  private sendTimer: unknown = null;
  private tickTimer: unknown = null;
  private wasLive = false;
  private highestClaim = 0;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;
  private readonly stops: (() => void)[];
  private readonly provider: RelayProvider;

  constructor(
    provider: RelayProvider,
    options: PresenceOptions = {},
  ) {
    this.provider = provider;
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
    this.stops = [
      provider.onEphemeral((from, data) => this.receive(from, data)),
      provider.subscribe(() => this.onStatus()),
    ];
    this.wasLive = provider.status === 'live';
    this.tick();
  }

  /** Called whenever someone arrives, changes, or leaves. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private emit() {
    this.cached = null;
    for (const listener of this.listeners) listener();
  }

  private cached: PeerState[] | null = null;

  /** Everyone else's latest state, one per connection: the same array until something changes. */
  states(): PeerState[] {
    this.cached ??= [...this.peers.values()].map((p) => p.state);
    return this.cached;
  }

  /** The highest claim to drive seen since the plan opened, so a new claim beats even one that's gone (Q71). */
  claimsSeen(): number {
    return this.highestClaim;
  }

  /** This tab's state, sent soon. */
  set(state: PeerState) {
    this.local = state;
    if (state.drive !== null) this.highestClaim = Math.max(this.highestClaim, state.drive);
    if (this.sendTimer !== null) return;
    const wait = Math.max(0, this.lastSent + THROTTLE_MS - this.now());
    this.sendTimer = this.setTimer(() => {
      this.sendTimer = null;
      this.flush();
    }, wait);
  }

  private flush() {
    if (!this.local) return;
    if (this.provider.sendEphemeral(encoder.encode(JSON.stringify(this.local)))) this.lastSent = this.now();
  }

  private receive(from: number, data: Uint8Array | null) {
    if (data === null) {
      if (this.peers.delete(from)) this.emit();
      return;
    }
    let state: PeerState | null;
    try {
      state = parsePeerState(JSON.parse(decoder.decode(data)));
    } catch {
      return;
    }
    if (!state) return;
    if (state.drive !== null) this.highestClaim = Math.max(this.highestClaim, state.drive);
    this.peers.set(from, { state, seen: this.now() });
    this.emit();
  }

  private onStatus() {
    const live = this.provider.status === 'live';
    if (live && !this.wasLive) this.flush();
    if (!live && this.wasLive && this.peers.size > 0) {
      this.peers.clear();
      this.emit();
    }
    this.wasLive = live;
  }

  /** Once a second: a heartbeat when it's due, and dropping anyone gone quiet. */
  private tick() {
    this.tickTimer = this.setTimer(() => {
      const now = this.now();
      if (now - this.lastSent >= HEARTBEAT_MS) this.flush();
      let dropped = false;
      for (const [from, peer] of this.peers) {
        if (now - peer.seen >= SILENT_MS) {
          this.peers.delete(from);
          dropped = true;
        }
      }
      if (dropped) this.emit();
      this.tick();
    }, 1000);
  }

  destroy() {
    for (const stop of this.stops) stop();
    if (this.sendTimer !== null) this.clearTimer(this.sendTimer);
    if (this.tickTimer !== null) this.clearTimer(this.tickTimer);
    this.listeners.clear();
  }
}
