// Conflict detection (requirements 13, 16, 17), as pure functions. Sprint 0
// has no conflict UI; these exist so sprint 1 starts from tested rules.
// Conflicts are highlights for discussion, never constraints (requirement 19).

import { ancestorAtLevel, depthOf, pathTo, valuesAtLevel } from './hierarchy.ts';
import type { Item, ItemId, Plan, SelectProperty, ValueId } from './model.ts';
import { itemValues, SIZE, SYSTEM, TIME } from './model.ts';
import { childCounts } from './tree.ts';

export type Conflict =
  /** A prerequisite placed after its dependent (requirement 16). */
  | { kind: 'dependency-order'; axis: 'sequence' | 'time'; prerequisite: ItemId; dependent: ItemId }
  /** More items on one component in one time bucket than its limit allows (requirement 17). */
  | { kind: 'contention'; component: ValueId; bucket: ValueId; items: ItemId[]; limit: number }
  /** A child that doesn't fit its group (requirement 13). */
  | { kind: 'group-size' | 'group-time' | 'group-system'; group: ItemId; child: ItemId };

export interface ConflictOptions {
  /** Time hierarchy level that counts as one bucket. Default 0 (quarter). */
  timeLevel?: number;
  /** Concurrency limit per component. */
  limits?: Record<ValueId, number>;
  /** Limit for components without their own. Default: none, so no contention is ever reported. */
  defaultLimit?: number | null;
}

function select(plan: Plan, id: string): SelectProperty | null {
  const p = plan.properties[id];
  return p?.kind === 'select' ? p : null;
}

/** An item's time bucket at `level`, as an index for ordering; null when it has none at that level. */
function bucketIndex(plan: Plan, item: Item, level: number): { bucket: ValueId; index: number } | null {
  const time = select(plan, TIME);
  const value = itemValues(item, TIME)[0];
  if (!time || value === undefined) return null;
  const bucket = ancestorAtLevel(time, value, level);
  if (bucket === null) return null;
  const index = valuesAtLevel(time, level).findIndex((node) => node.id === bucket);
  return index < 0 ? null : { bucket, index };
}

/** Prerequisites placed strictly after their dependents, by sequence and by time bucket. */
export function dependencyConflicts(plan: Plan, options: ConflictOptions = {}): Conflict[] {
  const level = options.timeLevel ?? 0;
  const out: Conflict[] = [];
  for (const { from, to } of plan.dependencies) {
    const a = plan.items[from];
    const b = plan.items[to];
    if (!a || !b) continue;
    if (a.sequence !== null && b.sequence !== null && a.sequence > b.sequence) {
      out.push({ kind: 'dependency-order', axis: 'sequence', prerequisite: from, dependent: to });
    }
    const ta = bucketIndex(plan, a, level);
    const tb = bucketIndex(plan, b, level);
    if (ta && tb && ta.index > tb.index) {
      out.push({ kind: 'dependency-order', axis: 'time', prerequisite: from, dependent: to });
    }
  }
  return out;
}

/**
 * Components with more items in one time bucket than their limit. Counts
 * work items (items without children) tagged at the deepest system level;
 * a group's own values are a ballpark, and counting both it and its
 * children would double-count. Untagged and unscheduled items are skipped
 * (requirement 21).
 */
export function contentionConflicts(plan: Plan, options: ConflictOptions = {}): Conflict[] {
  const system = select(plan, SYSTEM);
  if (!system) return [];
  const level = options.timeLevel ?? 0;
  const deepest = system.levels.length - 1;
  const groups = childCounts(plan);
  const load = new Map<string, { component: ValueId; bucket: ValueId; items: ItemId[] }>();
  for (const item of Object.values(plan.items)) {
    if (groups.has(item.id)) continue;
    const time = bucketIndex(plan, item, level);
    if (!time) continue;
    for (const component of new Set(itemValues(item, SYSTEM))) {
      if (depthOf(system, component) !== deepest) continue;
      const key = `${component}\u0000${time.bucket}`;
      const entry = load.get(key) ?? { component, bucket: time.bucket, items: [] };
      entry.items.push(item.id);
      load.set(key, entry);
    }
  }
  const out: Conflict[] = [];
  for (const { component, bucket, items } of load.values()) {
    const limit = options.limits?.[component] ?? options.defaultLimit ?? null;
    if (limit !== null && items.length > limit) {
      out.push({ kind: 'contention', component, bucket, items: items.sort(), limit });
    }
  }
  return out;
}

/** Whether one path is a prefix of the other: the values overlap (one contains the other). */
function overlaps(property: SelectProperty, a: ValueId, b: ValueId): boolean {
  const pa = pathTo(property, a).map((n) => n.id);
  const pb = pathTo(property, b).map((n) => n.id);
  const n = Math.min(pa.length, pb.length);
  return n > 0 && pa.slice(0, n).every((id, i) => id === pb[i]);
}

/**
 * Children that don't fit their group: larger than it, dated in a
 * different time bucket, or in a system area the group doesn't touch.
 * Only flagged when both sides have values, and never "fixed" (requirement 13).
 */
export function groupConflicts(plan: Plan): Conflict[] {
  const size = select(plan, SIZE);
  const time = select(plan, TIME);
  const system = select(plan, SYSTEM);
  const sizeRank = new Map(size ? valuesAtLevel(size, 0).map((node, i) => [node.id, i]) : []);
  const out: Conflict[] = [];
  for (const child of Object.values(plan.items)) {
    const group = child.parent === null ? undefined : plan.items[child.parent];
    if (!group) continue;
    const pair = { group: group.id, child: child.id };

    const cs = sizeRank.get(itemValues(child, SIZE)[0] ?? '');
    const gs = sizeRank.get(itemValues(group, SIZE)[0] ?? '');
    if (cs !== undefined && gs !== undefined && cs > gs) out.push({ kind: 'group-size', ...pair });

    const ct = itemValues(child, TIME)[0];
    const gt = itemValues(group, TIME)[0];
    // A child dated more loosely than its group (Q1 vs the group's release) might still fit, so only disjoint dates count.
    if (time && ct !== undefined && gt !== undefined && !overlaps(time, ct, gt)) {
      out.push({ kind: 'group-time', ...pair });
    }

    if (system) {
      const areas = (item: Item) =>
        new Set(itemValues(item, SYSTEM).flatMap((v) => ancestorAtLevel(system, v, 0) ?? []));
      const childAreas = areas(child);
      const groupAreas = areas(group);
      if (childAreas.size > 0 && groupAreas.size > 0 && [...childAreas].some((a) => !groupAreas.has(a))) {
        out.push({ kind: 'group-system', ...pair });
      }
    }
  }
  return out;
}

export function allConflicts(plan: Plan, options: ConflictOptions = {}): Conflict[] {
  return [...dependencyConflicts(plan, options), ...contentionConflicts(plan, options), ...groupConflicts(plan)];
}
