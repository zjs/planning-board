// The plan store and every command that changes it. UI code calls these and
// never touches Yjs itself (CLAUDE.md, storage rule).

import * as Y from 'yjs';
import type { Plan } from '../domain/model.ts';
import { planDrop, type DropMode, type DropTarget } from '../domain/move.ts';
import type { CardRef, ViewSpec } from '../domain/view.ts';
import { persist, type PersistenceStatus } from '../store/persistence.ts';

export type { PersistenceStatus };
import { isEmpty, readPlan, root, valueSet, writePlan } from '../store/schema.ts';

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
