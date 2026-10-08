// Presence, as the board uses it (ADR 0019, Q61, Q71): who you are, what
// you're doing, and how much of everyone else to show. Presence is viewer
// state: none of it enters the plan.

import { colorFor, nextClaim, type CursorSetting, type PeerState } from '../domain/presence.ts';
import type { Presence } from './store.ts';
import { myName } from './sharing.ts';

export {
  colorFor,
  currentDriver,
  initials,
  people,
  visiblePointers,
  type CursorSetting,
  type PeerState,
  type Person,
} from '../domain/presence.ts';

const ID_KEY = 'planning-board:me-id';
const CURSORS_KEY = 'planning-board:cursors';
let memoryId: string | null = null;

/** This browser's ID in presence: one per browser, so a person's tabs show as one avatar. */
export function myPresenceId(): string {
  try {
    const saved = localStorage.getItem(ID_KEY);
    if (saved) return saved;
    const id = newId();
    localStorage.setItem(ID_KEY, id);
    return id;
  } catch {
    memoryId ??= newId();
    return memoryId;
  }
}

function newId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Whose pointers this browser shows: Everyone, the driver only, or nobody (Q61). */
export function cursorSetting(): CursorSetting {
  try {
    const saved = localStorage.getItem(CURSORS_KEY);
    if (saved === 'driver' || saved === 'none') return saved;
  } catch {
    // Everyone, without storage.
  }
  return 'everyone';
}

export function setCursorSetting(setting: CursorSetting): void {
  try {
    localStorage.setItem(CURSORS_KEY, setting);
  } catch {
    // Kept for this page only.
  }
}

/** What this tab is doing, as presence shares it. */
export interface Activity {
  pointer: PeerState['pointer'];
  selection: string[];
  drag: PeerState['drag'];
  drive: number | null;
  dropped: PeerState['dropped'];
}

export const IDLE: Activity = { pointer: null, selection: [], drag: null, drive: null, dropped: null };

/** Share what this tab is doing, under this browser's name and color. */
export function sharePresence(presence: Presence, activity: Activity): void {
  const id = myPresenceId();
  presence.set({ v: 1, id, name: myName() ?? 'Someone', color: colorFor(id).hex, ...activity });
}

/** A claim to drive that takes over from whoever drives now (Q71). */
export function claimToDrive(presence: Presence): number {
  return nextClaim(presence.states(), presence.claimsSeen());
}
