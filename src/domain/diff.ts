// What changed between two versions of a plan (ADR 0020): one diff for
// history now, and for "since you were away" and scenario compare later
// (requirement 23). Changes are ids and values, never words, so they stay
// small and are put into words only when shown, in today's names.

import { type Item, type ItemId, type OrderKey, type Plan, type PropertyId, type ValueId } from './model.ts';

export type Change =
  /** A new card. */
  | { kind: 'added'; item: ItemId; title: string }
  /** A card deleted, with everything inside it that went with it. `title` is what it was called, for saying so later. */
  | { kind: 'deleted'; item: ItemId; title: string; with?: ItemId[] }
  /** A deleted card brought back, with everything inside it. */
  | { kind: 'restored'; item: ItemId; title: string; with?: ItemId[] }
  | { kind: 'renamed'; item: ItemId; from: string; to: string }
  | { kind: 'described'; item: ItemId }
  /** A card's values on one property: what it held before, and after. */
  | { kind: 'values'; item: ItemId; property: PropertyId; from: ValueId[]; to: ValueId[] }
  /** Into another group, or out to the top level (null). */
  | { kind: 'group'; item: ItemId; from: ItemId | null; to: ItemId | null }
  | { kind: 'sequence'; item: ItemId; from: OrderKey | null; to: OrderKey | null }
  /** A dependency (`from` before `to`), or with `related`, a related link (Q44). */
  | { kind: 'linked' | 'unlinked'; from: ItemId; to: ItemId; related?: true }
  /** A property added, deleted or renamed: Team, say. */
  | { kind: 'property'; property: PropertyId; op: 'added' | 'deleted' | 'renamed'; name: string; was?: string }
  /** A value of a property added, deleted, renamed or moved: an area, a quarter. */
  | { kind: 'value'; property: PropertyId; value: ValueId; op: 'added' | 'deleted' | 'renamed' | 'moved'; label: string; was?: string };

export type ChangeKind = Change['kind'];

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
const sorted = (a: readonly string[]) => [...a].sort();

function itemChanges(before: Item, after: Item): Change[] {
  const out: Change[] = [];
  const item = after.id;
  if (before.title !== after.title) out.push({ kind: 'renamed', item, from: before.title, to: after.title });
  if (before.description !== after.description) out.push({ kind: 'described', item });
  if (before.parent !== after.parent) out.push({ kind: 'group', item, from: before.parent, to: after.parent });
  if (before.sequence !== after.sequence) out.push({ kind: 'sequence', item, from: before.sequence, to: after.sequence });
  for (const property of [...new Set([...Object.keys(before.values), ...Object.keys(after.values)])].sort()) {
    const from = before.values[property] ?? [];
    const to = after.values[property] ?? [];
    if (!sameSet(from, to)) out.push({ kind: 'values', item, property, from: sorted(from), to: sorted(to) });
  }
  return out;
}

/** Cards gone from `after` whose group is still there: the deletes people made. Each carries the cards that went with it. */
function deletions(before: Plan, after: Plan): Change[] {
  const gone = Object.values(before.items).filter((i) => !after.items[i.id]);
  const goneIds = new Set(gone.map((i) => i.id));
  const out: Change[] = [];
  for (const item of gone) {
    if (item.parent !== null && goneIds.has(item.parent)) continue;
    const inside: ItemId[] = [];
    const visit = (id: ItemId) => {
      for (const child of gone) {
        if (child.parent !== id) continue;
        inside.push(child.id);
        visit(child.id);
      }
    };
    visit(item.id);
    out.push({ kind: 'deleted', item: item.id, title: item.title, ...(inside.length > 0 ? { with: inside } : {}) });
  }
  return out;
}

function propertyChanges(before: Plan, after: Plan): Change[] {
  const out: Change[] = [];
  for (const id of [...new Set([...Object.keys(before.properties), ...Object.keys(after.properties)])].sort()) {
    const was = before.properties[id];
    const now = after.properties[id];
    if (!was && now) out.push({ kind: 'property', property: id, op: 'added', name: now.name });
    else if (was && !now) out.push({ kind: 'property', property: id, op: 'deleted', name: was.name });
    if (!was || !now) continue;
    if (was.name !== now.name) out.push({ kind: 'property', property: id, op: 'renamed', name: now.name, was: was.name });
    if (was.kind !== 'select' || now.kind !== 'select') continue;
    for (const value of [...new Set([...Object.keys(was.values), ...Object.keys(now.values)])].sort()) {
      const a = was.values[value];
      const b = now.values[value];
      if (!a && b) out.push({ kind: 'value', property: id, value, op: 'added', label: b.label });
      else if (a && !b) out.push({ kind: 'value', property: id, value, op: 'deleted', label: a.label });
      else if (a && b) {
        if (a.label !== b.label) out.push({ kind: 'value', property: id, value, op: 'renamed', label: b.label, was: a.label });
        if (a.parent !== b.parent || a.order !== b.order) out.push({ kind: 'value', property: id, value, op: 'moved', label: b.label });
      }
    }
  }
  return out;
}

function linkChanges(before: Plan, after: Plan): Change[] {
  const out: Change[] = [];
  const dep = (d: { from: string; to: string }) => `${d.from}>${d.to}`;
  const rel = (r: { a: string; b: string }) => `${r.a}~${r.b}`;
  const deps = [new Set(before.dependencies.map(dep)), new Set(after.dependencies.map(dep))] as const;
  const rels = [new Set(before.related.map(rel)), new Set(after.related.map(rel))] as const;
  for (const d of after.dependencies) if (!deps[0].has(dep(d))) out.push({ kind: 'linked', from: d.from, to: d.to });
  for (const d of before.dependencies) if (!deps[1].has(dep(d))) out.push({ kind: 'unlinked', from: d.from, to: d.to });
  for (const r of after.related) if (!rels[0].has(rel(r))) out.push({ kind: 'linked', from: r.a, to: r.b, related: true });
  for (const r of before.related) if (!rels[1].has(rel(r))) out.push({ kind: 'unlinked', from: r.a, to: r.b, related: true });
  return out;
}

/**
 * Every change from `before` to `after`: properties first, then cards, then
 * links. A card that reappears is `restored` when `seen` says it existed
 * before, as when a delete is undone or restored; otherwise it's `added`.
 * Cards that come back inside a restored group are part of that change.
 */
export function planDiff(before: Plan, after: Plan, seen: ReadonlySet<ItemId> = new Set()): Change[] {
  const out = propertyChanges(before, after);
  const back = new Set(Object.keys(after.items).filter((id) => !before.items[id] && seen.has(id)));
  for (const item of Object.values(after.items)) {
    const was = before.items[item.id];
    if (was) {
      out.push(...itemChanges(was, item));
      continue;
    }
    if (!back.has(item.id)) {
      out.push({ kind: 'added', item: item.id, title: item.title });
      continue;
    }
    if (item.parent !== null && back.has(item.parent)) continue;
    const inside: ItemId[] = [];
    const visit = (id: ItemId) => {
      for (const child of Object.values(after.items)) {
        if (child.parent !== id || !back.has(child.id)) continue;
        inside.push(child.id);
        visit(child.id);
      }
    };
    visit(item.id);
    out.push({ kind: 'restored', item: item.id, title: item.title, ...(inside.length > 0 ? { with: inside } : {}) });
  }
  out.push(...deletions(before, after));
  out.push(...linkChanges(before, after));
  return out;
}

/** The cards a change is about, for a card's history. */
export function changedItems(change: Change): ItemId[] {
  switch (change.kind) {
    case 'linked':
    case 'unlinked':
      return [change.from, change.to];
    case 'property':
    case 'value':
      return [];
    case 'deleted':
    case 'restored':
      return [change.item, ...(change.with ?? [])];
    default:
      return [change.item];
  }
}
