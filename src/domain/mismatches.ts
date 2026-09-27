// Group mismatch markers (requirements 13 and 18): which cards don't fit
// their group, and what each collapsed group contains, in plain words.

import { groupConflicts, type Conflict } from './conflicts.ts';
import { pathTo } from './hierarchy.ts';
import type { ItemId, Plan, PropertyId } from './model.ts';
import { itemValues, SIZE, SYSTEM, TIME } from './model.ts';

type GroupConflict = Extract<Conflict, { kind: 'group-size' | 'group-time' | 'group-system' }>;

export interface Mismatches {
  /** Why a card doesn't fit its own group, one line per reason. */
  onCard: Map<ItemId, string[]>;
  /** Everything that doesn't fit anywhere inside a group, at any depth (requirement 18). */
  inside: Map<ItemId, string[]>;
}

function label(plan: Plan, property: PropertyId, itemId: ItemId): string {
  const p = plan.properties[property];
  const item = plan.items[itemId];
  if (p?.kind !== 'select' || !item) return '';
  return itemValues(item, property)
    .map((v) => pathTo(p, v).map((n) => n.label).join(' › '))
    .join(', ');
}

/** The card's system values whose area its group doesn't touch: only those are the problem. */
function outsideAreas(plan: Plan, c: GroupConflict): string {
  const p = plan.properties[SYSTEM];
  const child = plan.items[c.child];
  const group = plan.items[c.group];
  if (p?.kind !== 'select' || !child || !group) return '';
  const area = (v: string) => pathTo(p, v)[0]?.id;
  const groupAreas = new Set(itemValues(group, SYSTEM).map(area));
  return itemValues(child, SYSTEM)
    .filter((v) => !groupAreas.has(area(v)))
    .map((v) => pathTo(p, v).map((n) => n.label).join(' › '))
    .join(', ');
}

/** One reason, relative to the card's own group: "Dated Q3 2027, outside its group's Q2 2027". */
export function describeMismatch(plan: Plan, c: GroupConflict): string {
  const mine = (p: PropertyId) => label(plan, p, c.child);
  const theirs = (p: PropertyId) => label(plan, p, c.group);
  switch (c.kind) {
    case 'group-size':
      return `Sized ${mine(SIZE)}, larger than its group's ${theirs(SIZE)}`;
    case 'group-time':
      return `Dated ${mine(TIME)}, outside its group's ${theirs(TIME)}`;
    case 'group-system':
      return `In ${outsideAreas(plan, c)}, outside its group's ${theirs(SYSTEM)}`;
  }
}

/**
 * All group mismatches, indexed for the board: per card, and per group for
 * everything in its subtree. Values are never changed (requirement 13).
 */
export function mismatches(plan: Plan): Mismatches {
  const onCard = new Map<ItemId, string[]>();
  const inside = new Map<ItemId, string[]>();
  const push = (map: Map<ItemId, string[]>, id: ItemId, line: string) => map.set(id, [...(map.get(id) ?? []), line]);
  for (const c of groupConflicts(plan).filter((c): c is GroupConflict => c.kind.startsWith('group-'))) {
    const reason = describeMismatch(plan, c);
    push(onCard, c.child, reason);
    const child = plan.items[c.child]?.title ?? '';
    const direct = plan.items[c.group]?.title ?? '';
    // Every group from the direct one up to the top counts it, so a collapsed ancestor still shows it.
    const seen = new Set<ItemId>();
    for (let g: ItemId | null = c.group; g !== null && !seen.has(g); g = plan.items[g]?.parent ?? null) {
      seen.add(g);
      push(inside, g, g === c.group ? `${child}: ${reason}` : `${child} (in ${direct}): ${reason}`);
    }
  }
  return { onCard, inside };
}
