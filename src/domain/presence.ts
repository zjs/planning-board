// Who else is on a shared plan, and what they're doing (requirement 32,
// ADR 0019, Q61, Q71). Presence is viewer state: it travels through the
// relay's presence channel, encrypted, and never enters the plan.
//
// Everything is anchored to cards, never to screen positions, because two
// people can be looking at the same plan in different pivots.

import type { ItemId } from './model.ts';

/** The version of a presence message. A message with another version is ignored. */
export const PRESENCE_VERSION = 1;

/** The most selected cards a message carries: enough to outline, small enough to send often. */
export const MAX_SELECTION = 200;

/** What one browser tab shares about itself. */
export interface PeerState {
  v: typeof PRESENCE_VERSION;
  /** Stable per browser, so one person's tabs and reconnections show as one avatar. */
  id: string;
  name: string;
  color: string;
  /** The card under the pointer, and where on it, as fractions of its width and height. */
  pointer: { item: ItemId; fx: number; fy: number } | null;
  selection: ItemId[];
  /** The card being dragged, and the name of the lane under it ("Q3 2027 · Billing"). */
  drag: { item: ItemId; label: string | null } | null;
  /** A claim to drive (Q71): a Lamport number, higher than any claim seen, or null. */
  drive: number | null;
  /** A card this person just dropped, to name them if the drop collides with someone else's (Q60). */
  dropped: { item: ItemId; label: string; at: number } | null;
}

/** Whose pointers show on this board (Q61). Avatars and selections always show. */
export type CursorSetting = 'everyone' | 'driver' | 'none';

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const record = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * Read a presence message, or null for anything that isn't one this build
 * understands. Messages come from other people's browsers, so every field
 * is checked, and anything out of shape is dropped rather than drawn.
 */
export function parsePeerState(raw: unknown): PeerState | null {
  const r = record(raw);
  if (!r || r.v !== PRESENCE_VERSION || !isString(r.id) || !isString(r.name) || !isString(r.color)) return null;
  const pointer = record(r.pointer);
  const drag = record(r.drag);
  const dropped = record(r.dropped);
  return {
    v: PRESENCE_VERSION,
    id: r.id.slice(0, 64),
    name: r.name.slice(0, 60),
    color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#868e96',
    pointer:
      pointer && isString(pointer.item) && isNumber(pointer.fx) && isNumber(pointer.fy)
        ? { item: pointer.item, fx: clamp(pointer.fx), fy: clamp(pointer.fy) }
        : null,
    selection: Array.isArray(r.selection) ? r.selection.filter(isString).slice(0, MAX_SELECTION) : [],
    drag: drag && isString(drag.item) ? { item: drag.item, label: isString(drag.label) ? drag.label.slice(0, 120) : null } : null,
    drive: isNumber(r.drive) ? r.drive : null,
    dropped:
      dropped && isString(dropped.item) && isString(dropped.label) && isNumber(dropped.at)
        ? { item: dropped.item, label: dropped.label.slice(0, 120), at: dropped.at }
        : null,
  };
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** One person, however many tabs they have open: what any of their tabs is doing. */
export interface Person {
  id: string;
  name: string;
  color: string;
  pointer: PeerState['pointer'];
  selection: ItemId[];
  drag: PeerState['drag'];
  drive: number | null;
  dropped: PeerState['dropped'];
}

/**
 * The people present, one per browser, in a steady order (by name, then
 * ID). A person with two tabs shows once: the selection is both tabs', and
 * the pointer and drag are whichever tab has one.
 */
export function people(states: readonly PeerState[]): Person[] {
  const byId = new Map<string, Person>();
  for (const s of states) {
    const p = byId.get(s.id);
    if (!p) {
      byId.set(s.id, { ...s, selection: [...s.selection] });
      continue;
    }
    p.pointer ??= s.pointer;
    p.drag ??= s.drag;
    p.selection = [...new Set([...p.selection, ...s.selection])];
    if (s.drive !== null && (p.drive === null || s.drive > p.drive)) p.drive = s.drive;
    if (s.dropped && (!p.dropped || s.dropped.at > p.dropped.at)) p.dropped = s.dropped;
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Who's driving (Q71): the highest claim, with ties broken by ID, so every
 * browser works out the same answer from the same people and no server has
 * to decide. Include your own state. Null when nobody is driving.
 */
export function currentDriver(states: readonly Pick<PeerState, 'id' | 'drive'>[]): string | null {
  let best: { id: string; drive: number } | null = null;
  for (const s of states) {
    if (s.drive === null) continue;
    if (!best || s.drive > best.drive || (s.drive === best.drive && s.id > best.id)) best = { id: s.id, drive: s.drive };
  }
  return best?.id ?? null;
}

/** The number for a new claim to drive: higher than every claim seen, so it takes over. */
export function nextClaim(states: readonly Pick<PeerState, 'drive'>[], seen = 0): number {
  return Math.max(seen, ...states.map((s) => s.drive ?? 0)) + 1;
}

/** Whose pointers to draw: never your own; the driver's alone with "Driver only"; nobody's with "None". */
export function visiblePointers(present: readonly Person[], setting: CursorSetting, driver: string | null, me: string): Person[] {
  if (setting === 'none') return [];
  return present.filter((p) => p.id !== me && p.pointer !== null && (setting === 'everyone' || p.id === driver));
}

/**
 * Colors for people, each with a name for whoever can't tell them apart.
 * They're darker than the area colors and drawn as outlines and pointers,
 * never as a card's edge, so a person is never mistaken for an area.
 */
export const PRESENCE_COLORS: readonly { name: string; hex: string }[] = [
  { name: 'red', hex: '#c92a2a' },
  { name: 'violet', hex: '#7048e8' },
  { name: 'teal', hex: '#087f5b' },
  { name: 'brown', hex: '#8f5b2e' },
  { name: 'navy', hex: '#1c3d8f' },
  { name: 'magenta', hex: '#a61e77' },
  { name: 'olive', hex: '#5c6b0a' },
  { name: 'slate', hex: '#495057' },
];

/** A person's color, the same on every board: from their ID. */
export function colorFor(id: string): { name: string; hex: string } {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length]!;
}

/** Initials for an avatar: "Ada Lovelace" → "AL", "bo" → "B". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return (words.length === 1 ? words[0]!.slice(0, 1) : words[0]!.slice(0, 1) + words[words.length - 1]!.slice(0, 1)).toUpperCase();
}
