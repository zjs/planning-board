// Dependency links (requirements 15 and 16, ADR 0011) as pure functions:
// which links can be made, which a card's focus shows, and where a link is
// drawn when one of its cards is hidden inside a collapsed group.

import type { Dependency, ItemId, Plan } from './model.ts';
import { ancestry } from './tree.ts';

export const linkKey = (d: Dependency) => `${d.from}->${d.to}`;

export function hasLink(plan: Plan, from: ItemId, to: ItemId): boolean {
  return plan.dependencies.some((d) => d.from === from && d.to === to);
}

/**
 * Why `from` can't be made a prerequisite of `to`, in plain words, or null
 * if it can. Loops are allowed: they're flagged, not refused (questions.md Q37).
 */
export function linkProblem(plan: Plan, from: ItemId, to: ItemId): string | null {
  if (!plan.items[from] || !plan.items[to]) return 'One of those cards no longer exists.';
  if (from === to) return "A card can't come before itself.";
  if (hasLink(plan, from, to)) return 'Those cards are already linked.';
  return null;
}

/**
 * A card and everything inside it. A group's links include its children's
 * (requirement 13): they're drawn to the group while it's collapsed (Q38).
 */
function subtree(plan: Plan, id: ItemId): Set<ItemId> {
  const inside = new Set<ItemId>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of Object.values(plan.items)) {
      if (item.parent !== null && inside.has(item.parent) && !inside.has(item.id)) {
        inside.add(item.id);
        grew = true;
      }
    }
  }
  return inside;
}

/** The links into and out of a card, or anything inside it: what hovering shows (Q39). */
export function directLinks(plan: Plan, id: ItemId): Dependency[] {
  const inside = subtree(plan, id);
  return plan.dependencies.filter((d) => inside.has(d.from) || inside.has(d.to));
}

/**
 * Every link upstream and downstream of a card, or anything inside it:
 * what it waits on, what that waits on, and so on, and the same for what
 * waits on it. What selecting a card shows (Q39).
 */
export function chain(plan: Plan, id: ItemId): Dependency[] {
  const out = new Map<string, Dependency>();
  const start = subtree(plan, id);
  const walk = (direction: 'up' | 'down') => {
    const seen = new Set<ItemId>(start);
    const queue = [...start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const d of plan.dependencies) {
        const [here, there] = direction === 'up' ? [d.to, d.from] : [d.from, d.to];
        if (here !== current) continue;
        out.set(linkKey(d), d);
        if (!seen.has(there)) {
          seen.add(there);
          queue.push(there);
        }
      }
    }
  };
  walk('up');
  walk('down');
  return [...out.values()];
}

/** A line on the board: between two cards on screen, standing for one or more links. */
export interface VisibleLink {
  /** The card drawn at the prerequisite end: the prerequisite itself, or the group it's hidden in. */
  from: ItemId;
  to: ItemId;
  links: Dependency[];
}

/**
 * Where links are drawn (questions.md Q38). Each end is the card itself if
 * it's on screen, or else the nearest group around it that is. A link whose
 * ends both land on the same card (it stays inside one collapsed group),
 * or whose card isn't on screen at all (outside the zoom), isn't drawn.
 * Links that land on the same pair of cards share one line.
 */
export function visibleLinks(plan: Plan, links: readonly Dependency[], onScreen: ReadonlySet<ItemId>): VisibleLink[] {
  const shownAs = new Map<ItemId, ItemId | null>();
  const resolve = (id: ItemId): ItemId | null => {
    if (!shownAs.has(id)) {
      const path = ancestry(plan, id);
      let found: ItemId | null = null;
      for (let i = path.length - 1; i >= 0; i--) {
        if (onScreen.has(path[i]!)) {
          found = path[i]!;
          break;
        }
      }
      shownAs.set(id, found);
    }
    return shownAs.get(id)!;
  };
  const lines = new Map<string, VisibleLink>();
  for (const d of links) {
    const from = resolve(d.from);
    const to = resolve(d.to);
    if (from === null || to === null || from === to) continue;
    const key = `${from}->${to}`;
    const line = lines.get(key);
    if (line) line.links.push(d);
    else lines.set(key, { from, to, links: [d] });
  }
  return [...lines.values()];
}
