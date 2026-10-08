// Two people on one board, driven by the app's real commands (src/commands/).
// Each person has their own Yjs document; `sync` exchanges what each is
// missing, the way a relay would once both are connected.

import * as Y from 'yjs';
import { createPlanStore, loadPlan, repairLoops, type PlanStore } from '../../src/commands/store.ts';
import { withBuiltIns } from '../../src/domain/builtins.ts';
import type { Item, ItemId, Plan, SelectProperty, ValueNode } from '../../src/domain/model.ts';
import { SEQUENCE, SIZE, SYSTEM, TIME } from '../../src/domain/model.ts';
import { topLevelItems } from '../../src/domain/tree.ts';
import { allCopies, layoutView, type ViewSpec } from '../../src/domain/view.ts';
import { readPlan } from '../../src/store/schema.ts';

export interface Pair {
  alice: PlanStore;
  bob: PlanStore;
}

/**
 * Both people start from the same board. `aliceFirst` decides who has the
 * lower Yjs client ID, which is what breaks ties between concurrent writes
 * to one key; running every scenario both ways shows which outcomes are a
 * coin toss.
 */
export function pair(base: Plan, aliceFirst: boolean): Pair {
  const seed = new Y.Doc();
  seed.clientID = 100;
  const seedStore = createPlanStore(seed);
  loadPlan(seedStore, base);
  const start = Y.encodeStateAsUpdate(seed);
  const person = (clientID: number) => {
    const doc = new Y.Doc();
    doc.clientID = clientID;
    Y.applyUpdate(doc, start);
    return createPlanStore(doc);
  };
  return aliceFirst ? { alice: person(1), bob: person(2) } : { alice: person(2), bob: person(1) };
}

/** Exchange everything each side is missing, in both directions. */
export function sync({ alice, bob }: Pair): void {
  const exchange = () => {
    const toBob = Y.encodeStateAsUpdate(alice.doc, Y.encodeStateVector(bob.doc));
    const toAlice = Y.encodeStateAsUpdate(bob.doc, Y.encodeStateVector(alice.doc));
    Y.applyUpdate(bob.doc, toBob);
    Y.applyUpdate(alice.doc, toAlice);
  };
  exchange();
  // Since sprint 11, each side settles loops of groups as it sees them (ADR 0004).
  if (repairLoops(alice) + repairLoops(bob) > 0) exchange();
}

export const plan = (store: PlanStore): Plan => readPlan(store.doc);

/** A canonical form of a plan, so two people's boards can be compared: keys sorted at every depth. */
export function canonical(p: Plan): string {
  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, sortKeys(v)]));
    }
    return value;
  };
  const byJson = (a: unknown, b: unknown) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
  return JSON.stringify(
    sortKeys({
      properties: p.properties,
      items: p.items,
      dependencies: [...p.dependencies].sort(byJson),
      related: [...p.related].sort(byJson),
    }),
  );
}

// The board both people start from: synthetic, like every sample in this repo.

function values(...nodes: [id: string, label: string, parent: string | null, order: string][]): Record<string, ValueNode> {
  return Object.fromEntries(nodes.map(([id, label, parent, order]) => [id, { id, label, parent, order }]));
}

const system: SelectProperty = {
  kind: 'select',
  id: SYSTEM,
  name: 'System',
  levels: ['Area', 'Component'],
  multi: true,
  values: values(
    ['billing', 'Billing', null, 'a0'],
    ['identity', 'Identity', null, 'a1'],
    ['platform', 'Platform', null, 'a2'],
    ['identity/sso', 'SSO', 'identity', 'a0'],
    ['identity/mfa', 'MFA', 'identity', 'a1'],
  ),
};

const time: SelectProperty = {
  kind: 'select',
  id: TIME,
  name: 'Time',
  levels: ['Quarter', 'Release'],
  multi: false,
  values: values(['q1', 'Q1', null, 'a0'], ['q2', 'Q2', null, 'a1'], ['q3', 'Q3', null, 'a2']),
};

const size: SelectProperty = {
  kind: 'select',
  id: SIZE,
  name: 'Size',
  levels: ['Size'],
  multi: false,
  values: values(['s', 'S', null, 'a0'], ['m', 'M', null, 'a1'], ['l', 'L', null, 'a2']),
};

function card(id: string, title: string, patch: Partial<Item> = {}): Item {
  return { id, title, description: '', parent: null, sequence: 'a0', values: {}, ...patch };
}

/**
 * Ten cards: a group with three children, a plain card linked to one of
 * them, four loose cards with a quarter and an area each, and one card with
 * a quarter but no area yet.
 */
export function basePlan(): Plan {
  const v = (quarter: string, ...areas: string[]) => ({ [TIME]: [quarter], [SYSTEM]: areas });
  const items = [
    card('login', 'Passwordless login', { values: v('q2', 'identity') }),
    card('passkeys', 'Passkey enrolment', { parent: 'login', sequence: 'a1', values: v('q2', 'identity/sso') }),
    card('magic', 'Magic links', { parent: 'login', sequence: 'a1', values: v('q2', 'identity/sso') }),
    card('recovery', 'Account recovery', { parent: 'login', sequence: 'a2', values: v('q3', 'identity/mfa') }),
    card('audit', 'Audit log export', { sequence: 'a2', values: v('q3', 'platform') }),
    card('invoices', 'Invoice redesign', { values: v('q1', 'billing') }),
    card('tax', 'Tax engine migration', { sequence: 'a1', values: v('q1', 'billing') }),
    card('seats', 'Seat sync from directory', { sequence: 'a1', values: v('q2', 'billing', 'identity') }),
    card('rates', 'Rate limits', { sequence: 'a2', values: { ...v('q3', 'platform'), [SIZE]: ['m'] } }),
    card('notes', 'Release notes', { sequence: 'a2', values: { [TIME]: ['q2'] } }),
  ];
  return withBuiltIns({
    properties: { [SEQUENCE]: { kind: 'sequence', id: SEQUENCE, name: 'Sequence' }, [SYSTEM]: system, [TIME]: time, [SIZE]: size },
    items: Object.fromEntries(items.map((i) => [i.id, i])),
    dependencies: [{ from: 'tax', to: 'invoices' }, { from: 'passkeys', to: 'audit' }],
    related: [],
  });
}

/** Roadmap at its top levels: quarters across, areas down. */
export const roadmap: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };
/** Sequence across, areas down. */
export const sequence: ViewSpec = { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } };

// Describing what a person would see, in words, for the results table.

export const label = (p: Plan, property: string, value: string): string => {
  const prop = p.properties[property];
  return prop?.kind === 'select' ? (prop.values[value]?.label ?? `deleted value ${value}`) : value;
};

export const valuesOf = (p: Plan, id: ItemId, property: string): string[] =>
  (p.items[id]?.values[property] ?? []).map((v) => label(p, property, v));

/** What the raw document holds for a property, before readPlan picks out live values. Schema 2 (ADR 0016): flat keys on the card. */
export function storedValues(store: PlanStore, id: ItemId, property: string): string[] {
  const item = store.doc.getMap<Y.Map<unknown>>('items').get(id);
  const prefix = `v\u001f${property}`;
  const found: string[] = [];
  for (const [key, raw] of item?.entries() ?? []) {
    if (key === prefix && typeof raw === 'string') found.push(raw);
    else if (key.startsWith(`${prefix}\u001f`)) found.push(key.slice(prefix.length + 1));
  }
  return found.sort().map((v) => label(plan(store), property, v));
}

export const titleOf = (p: Plan, id: ItemId): string => p.items[id]?.title ?? '(deleted)';

/** Where a card shows in Roadmap: each cell or holding lane it has a copy in. */
export function whereInRoadmap(p: Plan, id: ItemId): string[] {
  const layout = layoutView(p, roadmap);
  const name = (lanes: { key: string; label: string | null }[], key: string | null, none: string) =>
    key === null ? none : (lanes.find((l) => l.key === key)?.label ?? key);
  return allCopies(layout)
    .filter((ref) => ref.itemId === id && !ref.via)
    .map((ref) => `${name(layout.columns, ref.x, 'No quarter')} × ${name(layout.rows, ref.y, 'No area')}`);
}

/** The card's group, as the board's cycle-safe tree helpers see it. */
export function groupOf(p: Plan, id: ItemId): string {
  const item = p.items[id];
  if (!item) return '(deleted)';
  if (item.parent === null) return 'top level';
  if (!p.items[item.parent]) return 'top level (its group was deleted)';
  return topLevelItems(p).includes(id) ? 'top level (on a cycle)' : titleOf(p, item.parent);
}

export const titles = (p: Plan): string[] => Object.values(p.items).map((i) => i.title).sort();
