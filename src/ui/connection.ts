// What the connection pill says (requirement 35, Q59, artboards 4 and 5): a
// pure function of the connection's state, so every case is tested.

import type { ConnectionStatus, RelayProblem } from '../commands/store.ts';

/** How long a dropped connection may take to come back before the pill says so. */
export const GRACE_MS = 3000;
/** Offline this long, or with this much unshared, the pill gets louder: others may be editing the same cards. */
export const LOUD_AFTER_MS = 60 * 60 * 1000;
export const LOUD_CHANGES = 25;

// Relay error codes (relay/PROTOCOL.md).
const UNKNOWN_ROOM = 3;
const OUTDATED_RELAY = 1;
const OUTDATED_CLIENT = 2;

export interface PillInput {
  status: ConnectionStatus;
  problem: RelayProblem | null;
  viewOnly: boolean;
  /** Changes here the relay doesn't have, as cards touched. */
  unshared: number;
  /** When the connection was last caught up, or null if never, since the plan opened. */
  lastLive: number | null;
  /** When it lost a live connection, or null. */
  lostAt: number | null;
  /** When the plan was opened. */
  openedAt: number;
  /** Whether the browser says it's offline. */
  browserOffline: boolean;
  /** Whether this computer holds any of the plan. */
  hasLocal: boolean;
  now: number;
}

export interface Pill {
  tone: 'live' | 'quiet' | 'warn' | 'loud' | 'problem';
  label: string;
  /** A second line, for the louder states. */
  detail?: string;
  /** What hovering says. */
  title: string;
  /** The relay lost the plan, and this computer can put it back. */
  canRecreate?: boolean;
}

const changes = (n: number) => `${n} ${n === 1 ? 'change' : 'changes'} not shared yet`;

export function pillState(p: PillInput): Pill {
  if (p.status === 'refused') {
    const code = p.problem?.code;
    if (code === UNKNOWN_ROOM) {
      return {
        tone: 'problem',
        label: 'Not on the relay',
        title: 'The relay doesn’t have this plan any more, perhaps after a restore from a backup. Your copy is safe here.',
        canRecreate: !p.viewOnly,
      };
    }
    if (code === OUTDATED_RELAY || code === OUTDATED_CLIENT) {
      return { tone: 'problem', label: 'Can’t use the relay', title: p.problem?.message ?? '' };
    }
    return { tone: 'problem', label: 'Can’t use the relay', title: p.problem?.message ?? 'The relay refused this plan.' };
  }
  if (p.status === 'live') {
    if (p.problem) return { tone: 'warn', label: 'Not saved on the relay', title: p.problem.message };
    return { tone: 'live', label: p.viewOnly ? 'View only' : 'Live', title: p.viewOnly ? 'You can see changes as they happen, and not make any.' : 'Changes are shared as you make them.' };
  }
  // Not connected. A dropped connection gets a few seconds to come back before the pill changes.
  const since = p.lostAt ?? p.openedAt;
  const waiting = p.now - since;
  if (waiting < GRACE_MS && !p.browserOffline) {
    if (p.lastLive !== null) return { tone: 'live', label: p.viewOnly ? 'View only' : 'Live', title: 'Reconnecting…' };
    return { tone: 'quiet', label: 'Connecting…', title: 'Reaching the relay.' };
  }
  if (p.lastLive === null && !p.hasLocal) {
    return { tone: 'problem', label: 'Can’t reach the relay', title: 'This plan isn’t on this computer yet, and the relay can’t be reached. Check the network, or that the relay is running.' };
  }
  if (p.viewOnly) return { tone: 'quiet', label: 'View only · Offline', title: 'Showing the plan as it was when last connected.' };
  if (p.unshared > 0) {
    const loud = waiting >= LOUD_AFTER_MS || p.unshared >= LOUD_CHANGES;
    return {
      tone: loud ? 'loud' : 'warn',
      label: `Offline · ${changes(p.unshared)}`,
      ...(loud ? { detail: 'Others may be changing the same cards' } : {}),
      title: 'Keep working: your changes are kept here, and shared when the relay can be reached again.',
    };
  }
  if (p.browserOffline) return { tone: 'quiet', label: 'Offline', title: 'Your changes are kept here, and shared when you’re back online.' };
  return { tone: 'quiet', label: 'Reconnecting…', title: 'Trying to reach the relay. Your changes are kept here meanwhile.' };
}
