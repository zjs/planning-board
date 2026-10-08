// The plans a browser keeps (Q58, requirement 34, ADR 0021). The list lives
// in localStorage, so every tab sees a change at once. Each plan's board is
// its own IndexedDB database, and its name is also kept in its document
// (src/store/schema.ts), so the name will travel with a plan once it's shared.

import { dropDatabase } from '../store/persistence.ts';
import { SCHEMA_VERSION } from '../store/schema.ts';

export type PlanId = string;

export interface PlanEntry {
  id: PlanId;
  name: string;
  /** Milliseconds since the epoch. */
  created: number;
  opened: number;
  /** Named by a person, rather than given a default name. An empty plan with a chosen name is kept. */
  named?: boolean;
  /** Deleted, and waiting out its Undo (ADR 0021). Hidden from the list; its database goes later. */
  deletedAt?: number;
  /** Shared through a relay (ADR 0018): where, and the keys from its link. */
  shared?: SharedPlan;
}

/**
 * A shared plan's place on a relay, and its keys, as the link carries them
 * (base64url). Kept in localStorage, on the same computer that already holds
 * the plan itself unencrypted (ADR 0018).
 */
export interface SharedPlan {
  relay: string;
  room: string;
  /** The edit link's secret; absent when this browser has only the view link. */
  secret?: string;
  viewKey: string;
  /** Shared, but the relay hasn't confirmed the room yet: a crash mid-share retries. */
  pending?: boolean;
}

/** The board a browser had before it kept several plans. Its database and viewer state keep their old names. */
export const FIRST_PLAN: PlanId = 'default';
export const FIRST_PLAN_NAME = 'My plan';
export const UNTITLED = 'Untitled plan';

const INDEX_KEY = 'planning-board:plans';

/** The IndexedDB database holding a plan's board. */
export function planDatabase(id: PlanId): string {
  return id === FIRST_PLAN ? `planning-board:v${SCHEMA_VERSION}:default` : `planning-board:v${SCHEMA_VERSION}:plan:${id}`;
}

/** The plan a database holds, if it's one of ours. */
export function planOfDatabase(name: string): PlanId | null {
  if (name === planDatabase(FIRST_PLAN)) return FIRST_PLAN;
  const prefix = `planning-board:v${SCHEMA_VERSION}:plan:`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : null;
}

/**
 * A localStorage key for one plan's viewer state: its view, folding, and
 * expanded groups. The first plan keeps the keys it had, so a browser's
 * view carries over unchanged.
 */
export function scopedKey(base: string, plan: PlanId): string {
  return plan === FIRST_PLAN ? base : `${base}:${plan}`;
}

/** Where the list is kept: localStorage, or memory when the browser won't give us storage. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const memory = new Map<string, string>();
const memoryStore: KeyValue = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, value),
};

/** Whether the plan list is kept between visits: false when the browser won't give localStorage. */
export function listIsSaved(): boolean {
  return defaultStore() !== memoryStore;
}

function defaultStore(): KeyValue {
  try {
    localStorage.getItem(INDEX_KEY);
    return localStorage;
  } catch {
    return memoryStore;
  }
}

const isEntry = (v: unknown): v is PlanEntry =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as PlanEntry).id === 'string' &&
  typeof (v as PlanEntry).name === 'string' &&
  typeof (v as PlanEntry).created === 'number' &&
  typeof (v as PlanEntry).opened === 'number';

/** Every entry, deleted ones included. A browser with no list yet has the first plan. */
function readAll(store: KeyValue): PlanEntry[] {
  try {
    const raw: unknown = JSON.parse(store.getItem(INDEX_KEY) ?? 'null');
    if (Array.isArray(raw)) return raw.filter(isEntry);
  } catch {
    // A damaged list starts again from the first plan; the boards themselves are untouched.
  }
  return [{ id: FIRST_PLAN, name: FIRST_PLAN_NAME, created: 0, opened: 0 }];
}

function writeAll(store: KeyValue, entries: readonly PlanEntry[]): void {
  try {
    store.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    // Full or blocked storage: the list stays as it was.
  }
}

function update(store: KeyValue, id: PlanId, change: (entry: PlanEntry) => PlanEntry): PlanEntry | null {
  const all = readAll(store);
  const at = all.findIndex((e) => e.id === id);
  if (at === -1) return null;
  const changed = change(all[at]!);
  all[at] = changed;
  writeAll(store, all);
  return changed;
}

/** The plans to show, last opened first. */
export function listPlans(store = defaultStore()): PlanEntry[] {
  return readAll(store)
    .filter((e) => e.deletedAt === undefined)
    .sort((a, b) => b.opened - a.opened || b.created - a.created);
}

export function findPlan(id: PlanId, store = defaultStore()): PlanEntry | null {
  return listPlans(store).find((e) => e.id === id) ?? null;
}

function newPlanId(): PlanId {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return 'p' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Add a plan to the list. It counts as opened now. */
export function addPlan(name: string, store = defaultStore(), now = Date.now()): PlanEntry {
  const entry: PlanEntry = { id: newPlanId(), name, created: now, opened: now };
  writeAll(store, [...readAll(store), entry]);
  return entry;
}

/** Make a plan shared, or change how it's shared: keys, relay, or that the relay confirmed it. */
export function setShared(id: PlanId, shared: SharedPlan, store = defaultStore()): void {
  update(store, id, (e) => ({ ...e, shared }));
}

/** The plan this browser keeps for a room on a relay, if any, deleted or not. */
export function findShared(relay: string, room: string, store = defaultStore()): PlanEntry | null {
  const same = (a: string, b: string) => a.replace(/\/$/, '') === b.replace(/\/$/, '');
  return readAll(store).find((e) => e.shared?.room === room && same(e.shared.relay, relay)) ?? null;
}

/** Add a plan opened from someone's share link. It's named once its first sync brings the plan's name. */
export function addSharedPlan(shared: SharedPlan, name: string, store = defaultStore(), now = Date.now()): PlanEntry {
  const entry: PlanEntry = { id: newPlanId(), name, created: now, opened: now, shared };
  writeAll(store, [...readAll(store), entry]);
  return entry;
}

/** Mark a plan as the one in use. */
export function touchPlan(id: PlanId, store = defaultStore(), now = Date.now()): void {
  update(store, id, (e) => ({ ...e, opened: now }));
}

/** Rename a plan. `byHand` keeps an empty plan in the list when another is made (ADR 0021). */
export function renamePlan(id: PlanId, name: string, { byHand = false } = {}, store = defaultStore()): void {
  update(store, id, (e) => ({ ...e, name, ...(byHand ? { named: true } : {}) }));
}

/** Hide a plan from the list, keeping its board until its Undo has passed. */
export function markDeleted(id: PlanId, store = defaultStore(), now = Date.now()): void {
  update(store, id, (e) => ({ ...e, deletedAt: now }));
}

/** Undo a delete. */
export function unmarkDeleted(id: PlanId, store = defaultStore()): void {
  update(store, id, ({ deletedAt: _, ...e }) => e);
}

/** Take a plan off the list for good. The caller drops its database. */
export function forgetPlan(id: PlanId, store = defaultStore()): void {
  writeAll(
    store,
    readAll(store).filter((e) => e.id !== id),
  );
}

/** Plans deleted long enough ago that no Undo can still reach them: a page closed during the Undo leaves these. */
export function expiredDeletes(store = defaultStore(), now = Date.now(), graceMs = 60_000): PlanId[] {
  return readAll(store)
    .filter((e) => e.deletedAt !== undefined && now - e.deletedAt > graceMs)
    .map((e) => e.id);
}

/** Delete a plan's board for good. */
export function dropPlanDatabase(id: PlanId): Promise<void> {
  return Promise.all([dropDatabase(planDatabase(id)), dropDatabase(syncDatabase(id))]).then(() => undefined);
}

/** The small database where a shared plan keeps what the relay is known to hold (src/store/relay.ts). */
export function syncDatabase(id: PlanId): string {
  return `planning-board:v${SCHEMA_VERSION}:sync:${id}`;
}

/** Whether a localStorage change, seen in a `storage` event, is to the list of plans: another tab made, renamed or deleted one. */
export const isPlanListKey = (key: string | null) => key === null || key === INDEX_KEY;

/** The plan a link names: `#plan=<id>`. */
export function planFromHash(hash: string): PlanId | null {
  const match = /(?:^#|&)plan=([^&]+)/.exec(hash);
  return match ? decodeURIComponent(match[1]!) : null;
}

export const hashFor = (id: PlanId) => `#plan=${encodeURIComponent(id)}`;

/** A plan's name as a file name: "Q3 roadmap" → "q3-roadmap". */
export function fileSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'planning-board';
}

/** A file's name without its extension, as a plan's name: "jira-export.csv" → "jira-export". */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || UNTITLED;
}
