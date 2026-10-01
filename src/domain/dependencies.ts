// Dependency links (requirements 15 and 16, ADR 0011) as pure functions:
// which links can be made, which a card's focus shows, and where a link is
// drawn when one of its cards is hidden inside a collapsed group.

import { timeSpans } from './conflicts.ts';
import type { Dependency, ItemId, Plan } from './model.ts';
import { compareOrderKeys, SEQUENCE, TIME } from './model.ts';
import { ancestry } from './tree.ts';
import type { ViewSpec } from './view.ts';

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

/** Why a link is flagged (requirements 16 and 18, Q37). */
export type LinkFlag =
  | { kind: 'order'; axis: 'sequence' | 'time' }
  | { kind: 'loop' };

/**
 * Links on a loop: A before B before … before A, which can never all be
 * met. Found as strongly connected components (Tarjan's algorithm), so a
 * link is on a loop exactly when its two cards are in the same component.
 */
export function dependencyLoops(plan: Plan): Dependency[] {
  const next = new Map<ItemId, ItemId[]>();
  for (const d of plan.dependencies) {
    if (d.from === d.to || !plan.items[d.from] || !plan.items[d.to]) continue;
    next.set(d.from, [...(next.get(d.from) ?? []), d.to]);
  }
  const index = new Map<ItemId, number>();
  const low = new Map<ItemId, number>();
  const component = new Map<ItemId, number>();
  const stack: ItemId[] = [];
  const onStack = new Set<ItemId>();
  let counter = 0;
  let components = 0;
  // Iterative, so a long chain can't overflow the call stack.
  for (const start of next.keys()) {
    if (index.has(start)) continue;
    const work: { id: ItemId; i: number }[] = [{ id: start, i: 0 }];
    index.set(start, counter);
    low.set(start, counter++);
    stack.push(start);
    onStack.add(start);
    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const targets = next.get(frame.id) ?? [];
      if (frame.i < targets.length) {
        const to = targets[frame.i++]!;
        if (!index.has(to)) {
          index.set(to, counter);
          low.set(to, counter++);
          stack.push(to);
          onStack.add(to);
          work.push({ id: to, i: 0 });
        } else if (onStack.has(to)) {
          low.set(frame.id, Math.min(low.get(frame.id)!, index.get(to)!));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.id, Math.min(low.get(parent.id)!, low.get(frame.id)!));
      if (low.get(frame.id) === index.get(frame.id)) {
        let member: ItemId;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          component.set(member, components);
        } while (member !== frame.id);
        components++;
      }
    }
  }
  return plan.dependencies.filter(
    (d) => d.from !== d.to && component.has(d.from) && component.get(d.from) === component.get(d.to),
  );
}

/**
 * Links whose prerequisite comes after its dependent on an axis the view
 * orders by (requirement 16): to its right (or below) on a sequence axis,
 * or in a later bucket on a time axis, judged at the level the axis shows
 * (Q12). A time order counts only when it's certain, so a quarter-only
 * card isn't flagged against a release inside that quarter. Each card's
 * own values are judged, even when its line is drawn to a group (Q38).
 */
export function outOfOrder(plan: Plan, view: ViewSpec): Map<string, LinkFlag> {
  const out = new Map<string, LinkFlag>();
  const axes = [view.x, view.y];
  const sequence = axes.some((a) => a.property === SEQUENCE);
  const timeLevels = axes.filter((a) => a.property === TIME).map((a) => a.level);
  const spans = timeLevels.map((level) => timeSpans(plan, level));
  for (const d of plan.dependencies) {
    const a = plan.items[d.from];
    const b = plan.items[d.to];
    if (!a || !b || d.from === d.to) continue;
    if (sequence && a.sequence !== null && b.sequence !== null && compareOrderKeys(a.sequence, b.sequence) > 0) {
      out.set(linkKey(d), { kind: 'order', axis: 'sequence' });
      continue;
    }
    for (const span of spans) {
      const ta = span(a);
      const tb = span(b);
      if (ta && tb && ta.first > tb.last) {
        out.set(linkKey(d), { kind: 'order', axis: 'time' });
        break;
      }
    }
  }
  return out;
}

/** Every flagged link in this view: out of order here, or on a loop anywhere (Q37). */
export function linkProblems(plan: Plan, view: ViewSpec): Map<string, LinkFlag> {
  const problems = outOfOrder(plan, view);
  for (const d of dependencyLoops(plan)) problems.set(linkKey(d), { kind: 'loop' });
  return problems;
}

/** A flagged link in plain words: "“A” comes after “B” in the sequence, but must come before it." */
export function describeLinkProblem(plan: Plan, d: Dependency, problem: LinkFlag): string {
  const a = `“${plan.items[d.from]?.title ?? ''}”`;
  const b = `“${plan.items[d.to]?.title ?? ''}”`;
  if (problem.kind === 'loop') return `${a} → ${b} is part of a loop: each card waits on another in a circle.`;
  return problem.axis === 'sequence'
    ? `${a} must come before ${b}, but it's to its right in the sequence.`
    : `${a} must come before ${b}, but it's dated later.`;
}

/**
 * Flagged links inside each group, for its ⚠ count (requirement 18): every
 * group around either card counts the link, so a collapsed group shows the
 * problems it hides.
 */
export function linkProblemsInside(plan: Plan, problems: ReadonlyMap<string, LinkFlag>): Map<ItemId, string[]> {
  const inside = new Map<ItemId, string[]>();
  for (const d of plan.dependencies) {
    const problem = problems.get(linkKey(d));
    if (!problem) continue;
    const line = describeLinkProblem(plan, d, problem);
    const groups = new Set([...ancestry(plan, d.from).slice(0, -1), ...ancestry(plan, d.to).slice(0, -1)]);
    for (const g of groups) inside.set(g, [...(inside.get(g) ?? []), line]);
  }
  return inside;
}
