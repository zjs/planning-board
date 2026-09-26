import type { SelectProperty, ValueId, ValueNode } from './model.ts';

/** Ancestors of a value, top-level first, ending with the value itself. */
export function pathTo(property: SelectProperty, valueId: ValueId): ValueNode[] {
  const path: ValueNode[] = [];
  const seen = new Set<ValueId>();
  let node = property.values[valueId];
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    path.unshift(node);
    node = node.parent === null ? undefined : property.values[node.parent];
  }
  return path;
}

/** Zero for top-level values; -1 for unknown values. */
export function depthOf(property: SelectProperty, valueId: ValueId): number {
  return pathTo(property, valueId).length - 1;
}

/**
 * The value's ancestor at `level`, or the value itself if it sits at that level.
 * Null when the value is unknown or shallower than `level`.
 */
export function ancestorAtLevel(
  property: SelectProperty,
  valueId: ValueId,
  level: number,
): ValueId | null {
  return pathTo(property, valueId)[level]?.id ?? null;
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePaths(a: ValueNode[], b: ValueNode[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = compareKeys(a[i]!.order, b[i]!.order) || compareKeys(a[i]!.id, b[i]!.id);
    if (c !== 0) return c;
  }
  return a.length - b.length;
}

/** All values at `level`, in tree order (parents' order first, then their own). */
export function valuesAtLevel(property: SelectProperty, level: number): ValueNode[] {
  return Object.values(property.values)
    .map((node) => pathTo(property, node.id))
    .filter((path) => path.length === level + 1)
    .sort(comparePaths)
    .map((path) => path[path.length - 1]!);
}
