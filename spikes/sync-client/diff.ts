// What changed between two plan snapshots, in words. A pure function over
// Plan, the same shape scenario compare will need (requirement 23, ADR 0003);
// here it powers "since you were away" and the change history.

import type { Item, ItemId, Plan, PropertyId } from '../../src/domain/model.ts';
import { SEQUENCE } from '../../src/domain/model.ts';

export type ChangeKind = 'added' | 'deleted' | 'renamed' | 'values' | 'group' | 'sequence' | 'linked' | 'unlinked';

export interface Change {
  kind: ChangeKind;
  item: ItemId;
  /** For `values`: which property. */
  property?: PropertyId;
  /** The new state of what changed, for comparing one change with another (value IDs, a title, a parent). */
  after: string;
  /** One line for a person: "moved *Invoice redesign* to Q3". */
  text: string;
}

const title = (p: Plan, id: ItemId | null) => (id === null ? 'the top level' : `*${p.items[id]?.title ?? 'a deleted card'}*`);

function labels(p: Plan, property: PropertyId, ids: readonly string[]): string {
  const prop = p.properties[property];
  if (prop?.kind !== 'select') return ids.join(', ');
  return ids.map((id) => prop.values[id]?.label ?? 'a deleted value').join(', ');
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

function itemChanges(a: Plan, b: Plan, before: Item, after: Item): Change[] {
  const out: Change[] = [];
  const id = after.id;
  if (before.title !== after.title) {
    out.push({ kind: 'renamed', item: id, after: after.title, text: `renamed ${title(a, id)} to *${after.title}*` });
  }
  if (before.parent !== after.parent) {
    out.push({
      kind: 'group',
      item: id,
      after: String(after.parent),
      text: after.parent === null ? `moved ${title(b, id)} out to the top level` : `put ${title(b, id)} inside ${title(b, after.parent)}`,
    });
  }
  if (before.sequence !== after.sequence) {
    out.push({ kind: 'sequence', item: id, property: SEQUENCE, after: String(after.sequence), text: `moved ${title(b, id)} in the sequence` });
  }
  const properties = new Set([...Object.keys(before.values), ...Object.keys(after.values)]);
  for (const property of [...properties].sort()) {
    const was = before.values[property] ?? [];
    const now = after.values[property] ?? [];
    if (sameSet(was, now)) continue;
    const name = b.properties[property]?.name ?? property;
    const text =
      now.length === 0
        ? `cleared ${name} on ${title(b, id)}`
        : `set ${name} on ${title(b, id)} to ${labels(b, property, now)}${was.length > 0 ? ` (was ${labels(a, property, was)})` : ''}`;
    out.push({ kind: 'values', item: id, property, after: [...now].sort().join(','), text });
  }
  return out;
}

/** Every change from `a` to `b`, cards first, then links. */
export function planDiff(a: Plan, b: Plan): Change[] {
  const out: Change[] = [];
  for (const after of Object.values(b.items)) {
    const before = a.items[after.id];
    if (!before) out.push({ kind: 'added', item: after.id, after: after.title, text: `added ${title(b, after.id)}` });
    else out.push(...itemChanges(a, b, before, after));
  }
  for (const before of Object.values(a.items)) {
    if (!b.items[before.id]) out.push({ kind: 'deleted', item: before.id, after: '', text: `deleted ${title(a, before.id)}` });
  }
  const key = (d: { from: string; to: string }) => `${d.from}->${d.to}`;
  const was = new Set(a.dependencies.map(key));
  const now = new Set(b.dependencies.map(key));
  for (const d of b.dependencies) {
    if (!was.has(key(d))) out.push({ kind: 'linked', item: d.from, after: key(d), text: `linked ${title(b, d.from)} before ${title(b, d.to)}` });
  }
  for (const d of a.dependencies) {
    if (!now.has(key(d))) out.push({ kind: 'unlinked', item: d.from, after: key(d), text: `removed the link from ${title(a, d.from)} to ${title(a, d.to)}` });
  }
  return out;
}

/** Changes are about the same thing when they'd overwrite each other: one card's title, group, sequence, or one property. */
export const sameTarget = (x: Change, y: Change) => x.item === y.item && x.kind === y.kind && x.property === y.property;

/**
 * Of my changes since `base`, the ones that didn't survive the merge: the
 * merged board shows something else for the same thing. `mine` is what I
 * changed while away (base → my board before reconnecting).
 */
export function overridden(mine: readonly Change[], merged: Plan, base: Plan): { change: Change; now: string }[] {
  const now = planDiff(base, merged);
  const out: { change: Change; now: string }[] = [];
  for (const change of mine) {
    if (change.kind === 'added' || change.kind === 'linked') {
      // A card I added, or a link I made, that's gone from the merged board.
      const gone =
        change.kind === 'added' ? !merged.items[change.item] : !merged.dependencies.some((d) => `${d.from}->${d.to}` === change.after);
      if (gone) out.push({ change, now: change.kind === 'added' ? 'it was deleted with its group' : 'the link is gone' });
      continue;
    }
    if (!merged.items[change.item]) {
      out.push({ change, now: `${title(base, change.item)} was deleted` });
      continue;
    }
    const survived = now.find((c) => sameTarget(c, change));
    if (!survived || survived.after !== change.after) {
      out.push({ change, now: survived ? survived.text : 'it was changed back' });
    }
  }
  return out;
}
