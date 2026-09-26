// The plan store and every command that changes it. UI code calls these and
// never touches Yjs itself (CLAUDE.md, storage rule).

import * as Y from 'yjs';
import { planGroup, planUngroup, sharedValues } from '../domain/groups.ts';
import { cleanTitle, deletionOf, valuesForNewItem } from '../domain/items.ts';
import type { ItemId, Plan } from '../domain/model.ts';
import { planDrop, type DropMode, type DropTarget } from '../domain/move.ts';
import { wouldCreateCycle } from '../domain/tree.ts';
import type { CardRef, ViewSpec } from '../domain/view.ts';
import { persist, type PersistenceStatus } from '../store/persistence.ts';

export type { PersistenceStatus };
import { dependencyKey, isEmpty, itemToY, readPlan, root, valueSet, writePlan } from '../store/schema.ts';

/** Marks edits made through commands, so undo tracks them and not loads from storage. */
const LOCAL_ORIGIN = { source: 'local-command' };

export interface PlanStore {
  doc: Y.Doc;
  undoManager: Y.UndoManager;
}

export function createPlanStore(doc: Y.Doc = new Y.Doc()): PlanStore {
  const r = root(doc);
  const undoManager = new Y.UndoManager([r.properties, r.items, r.dependencies], {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
    // Every command is its own undo step, however quickly they follow each other.
    captureTimeout: 0,
  });
  return { doc, undoManager };
}

/** Create a store backed by browser storage. Resolves once saved content is loaded. */
export async function openPlanStore(): Promise<{ store: PlanStore; persistence: PersistenceStatus }> {
  const store = createPlanStore();
  const persistence = await persist(store.doc);
  return { store, persistence };
}

function edit(store: PlanStore, change: () => void): void {
  store.doc.transact(change, LOCAL_ORIGIN);
}

/** Replace the board with `plan`. Undoable. */
export function loadPlan(store: PlanStore, plan: Plan): void {
  edit(store, () => writePlan(store.doc, plan));
}

/** Empty the board completely. Undoable. */
export function resetPlan(store: PlanStore): void {
  edit(store, () => writePlan(store.doc, { properties: {}, items: {}, dependencies: [] }));
}

/**
 * Drop one copy of a card on a cell or a holding lane. Returns false
 * when the drop changes nothing, so no undo step is recorded.
 */
export function dropCard(
  store: PlanStore,
  view: ViewSpec,
  card: CardRef,
  target: DropTarget,
  mode: DropMode = 'replace',
): boolean {
  const change = planDrop(readPlan(store.doc), view, card, target, mode);
  const item = root(store.doc).items.get(card.itemId);
  if (!change || !item) return false;
  edit(store, () => {
    if (change.sequence !== undefined) item.set('sequence', change.sequence);
    let values = item.get('values') as Y.Map<Y.Map<true>> | undefined;
    if (!values) {
      values = new Y.Map();
      item.set('values', values);
    }
    for (const [property, next] of Object.entries(change.values)) {
      const set = values.get(property);
      if (!set) {
        values.set(property, valueSet(next));
        continue;
      }
      // Apply as a set difference, so a concurrent edit to another value survives.
      for (const id of [...set.keys()]) if (!next.includes(id)) set.delete(id);
      for (const id of next) if (!set.has(id)) set.set(id, true);
    }
  });
  return true;
}

/**
 * A new, never-reused item ID (docs/decisions/0003). Uses getRandomValues,
 * which works in pages opened from disk, unlike randomUUID in some browsers.
 */
export function newItemId(): ItemId {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return 'i' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a card in a cell or holding lane, with that spot's values (see
 * valuesForNewItem). Returns its ID, or null for a blank title. One undo step.
 */
export function createItem(
  store: PlanStore,
  view: ViewSpec,
  target: DropTarget,
  title: string,
  parent: ItemId | null = null,
): ItemId | null {
  const clean = cleanTitle(title);
  if (clean === null) return null;
  const { sequence, values } = valuesForNewItem(readPlan(store.doc), view, target);
  const id = newItemId();
  edit(store, () =>
    root(store.doc).items.set(id, itemToY({ id, title: clean, description: '', parent, sequence, values })),
  );
  return id;
}

/** Rename a card. Returns false (and records no undo step) for a blank or unchanged title. */
export function renameItem(store: PlanStore, id: ItemId, title: string): boolean {
  const clean = cleanTitle(title);
  const item = root(store.doc).items.get(id);
  if (clean === null || !item || item.get('title') === clean) return false;
  edit(store, () => item.set('title', clean));
  return true;
}

/**
 * Delete cards, everything inside any groups among them, and every
 * dependency touching those (questions.md Q17). One undo step restores all
 * of it. Returns how many cards were deleted.
 */
export function deleteItems(store: PlanStore, ids: Iterable<ItemId>): number {
  const doomed = deletionOf(readPlan(store.doc), ids);
  if (doomed.items.length === 0) return 0;
  const r = root(store.doc);
  edit(store, () => {
    for (const dep of doomed.dependencies) r.dependencies.delete(dependencyKey(dep));
    for (const id of doomed.items) r.items.delete(id);
  });
  return doomed.items.length;
}

/** Title a new group starts with; the UI opens it for renaming straight away. */
export const NEW_GROUP_TITLE = 'New group';

/**
 * ⌘G (requirement 11, questions.md Q15). With exactly one existing group in
 * the selection, the other cards join it; otherwise the selection goes into
 * a new group that takes the values its children share, so it lands where
 * they were. Returns the group, and whether it's new. One undo step.
 */
export function groupItems(store: PlanStore, ids: Iterable<ItemId>): { group: ItemId; created: boolean } | null {
  const plan = readPlan(store.doc);
  const grouping = planGroup(plan, ids);
  if (!grouping) return null;
  const items = root(store.doc).items;
  if (grouping.kind === 'join') {
    edit(store, () => {
      for (const id of grouping.members) items.get(id)?.set('parent', grouping.group);
    });
    return { group: grouping.group, created: false };
  }
  const id = newItemId();
  const { sequence, values } = sharedValues(plan, grouping.members);
  edit(store, () => {
    items.set(id, itemToY({ id, title: NEW_GROUP_TITLE, description: '', parent: grouping.parent, sequence, values }));
    for (const member of grouping.members) items.get(member)?.set('parent', id);
  });
  return { group: id, created: true };
}

/**
 * ⇧⌘G: remove the selected groups, moving their children up one level with
 * their own values. A group's dependencies are re-pointed at its children
 * (questions.md Q21). Returns the children that moved up. One undo step.
 */
export function ungroupItems(store: PlanStore, ids: Iterable<ItemId>): ItemId[] {
  const ungroup = planUngroup(readPlan(store.doc), ids);
  if (!ungroup) return [];
  const r = root(store.doc);
  edit(store, () => {
    for (const { item, parent } of ungroup.moves) r.items.get(item)?.set('parent', parent);
    for (const dep of ungroup.removed) r.dependencies.delete(dependencyKey(dep));
    for (const dep of ungroup.added) r.dependencies.set(dependencyKey(dep), { from: dep.from, to: dep.to });
    for (const group of ungroup.groups) r.items.delete(group);
  });
  return ungroup.moves.map((m) => m.item);
}

/**
 * Move cards to another level of the tree, keeping their values: out of a
 * group through the breadcrumb (requirement 11). Moves that would make a
 * card its own ancestor are skipped (ADR 0004). Returns the cards moved.
 * One undo step.
 */
export function moveToParent(store: PlanStore, ids: Iterable<ItemId>, parent: ItemId | null): ItemId[] {
  const plan = readPlan(store.doc);
  if (parent !== null && !plan.items[parent]) return [];
  const moving = [...new Set(ids)].filter(
    (id) => plan.items[id] && plan.items[id].parent !== parent && !wouldCreateCycle(plan, id, parent),
  );
  if (moving.length === 0) return [];
  const items = root(store.doc).items;
  edit(store, () => {
    for (const id of moving) items.get(id)?.set('parent', parent);
  });
  return moving;
}

export function undo(store: PlanStore): void {
  store.undoManager.undo();
}

export function redo(store: PlanStore): void {
  store.undoManager.redo();
}

export interface StoreSnapshot {
  plan: Plan;
  empty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * A cached snapshot plus a change subscription, shaped for React's
 * useSyncExternalStore. A command fires several Yjs events (the update,
 * then the undo stack change); they're coalesced into one refresh per
 * microtask. Yjs listeners are attached only while someone is subscribed.
 */
export function snapshotSource(store: PlanStore) {
  const take = (): StoreSnapshot => ({
    plan: readPlan(store.doc),
    empty: isEmpty(store.doc),
    canUndo: store.undoManager.canUndo(),
    canRedo: store.undoManager.canRedo(),
  });
  let current: StoreSnapshot | null = null;
  let scheduled = false;
  const listeners = new Set<() => void>();
  const refresh = () => {
    scheduled = false;
    if (listeners.size === 0) return;
    current = take();
    listeners.forEach((l) => l());
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(refresh);
  };
  const undoEvents = ['stack-item-added', 'stack-item-popped', 'stack-cleared'] as const;
  return {
    getSnapshot: (): StoreSnapshot => (current ??= take()),
    subscribe: (listener: () => void) => {
      if (listeners.size === 0) {
        store.doc.on('update', schedule);
        undoEvents.forEach((event) => store.undoManager.on(event, schedule));
        current = take(); // may have changed while nobody was listening
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        store.doc.off('update', schedule);
        undoEvents.forEach((event) => store.undoManager.off(event, schedule));
        current = null;
      };
    },
  };
}
