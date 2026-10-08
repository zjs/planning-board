// The plan store and every command that changes it. UI code calls these and
// never touches Yjs itself (CLAUDE.md, storage rule).

import * as Y from 'yjs';
import { withBuiltIns } from '../domain/builtins.ts';
import { planFromDraft, type Draft, type ImportResult, type ValueChoices } from '../domain/csvImport.ts';
import { hasLink, hasRelated, linkProblem, relatedProblem } from '../domain/dependencies.ts';
import { planGroup, planUngroup, sharedValues } from '../domain/groups.ts';
import { planValueEdit, type ValueEdit } from '../domain/inspector.ts';
import { cleanTitle, deletionOf, nextRank, valuesForChild, valuesForNewItem } from '../domain/items.ts';
import type { Dependency, ItemId, Plan, PropertyId, Related, SelectProperty, ValueId } from '../domain/model.ts';
import { relatedPair } from '../domain/model.ts';
import { planDrop, planDrops, type DropMode, type DropTarget } from '../domain/move.ts';
import {
  cardsWithProperty,
  isBuiltIn,
  levelNameProblem,
  orderAtEnd,
  planValueDelete,
  planValueMove,
  propertyNameProblem,
  reorderKey,
  valueLabelProblem,
  type CardValueChange,
} from '../domain/properties.ts';
import { planChanges } from '../domain/changes.ts';
import { loopRepairs, wouldCreateCycle } from '../domain/tree.ts';
import type { CardRef, ViewSpec } from '../domain/view.ts';
import { persist, type PersistenceStatus } from '../store/persistence.ts';
import { syncTabs } from '../store/tabs.ts';
import { indexedDbSyncStore, memorySyncStore, RelayProvider } from '../store/relay.ts';
import { FIRST_PLAN, planDatabase, syncDatabase, type PlanId, type SharedPlan } from './plans.ts';

export type { PersistenceStatus };
import {
  clearItemValues,
  dependencyKey,
  isEmpty,
  itemToY,
  latestMoveCounter,
  moveItem,
  planNameOf,
  readTree,
  propertyToY,
  readPlan,
  relatedKey,
  root,
  setPlanName,
  valueNodeToY,
  writeItemValues,
  writePlan,
  writtenByNewer,
} from '../store/schema.ts';

/** Marks edits made through commands, so undo tracks them and not loads from storage. */
const LOCAL_ORIGIN = { source: 'local-command' };

export interface PlanStore {
  doc: Y.Doc;
  undoManager: Y.UndoManager;
  /**
   * A plan opened with a view link, or written by a newer build: nothing on
   * this computer changes it. Every write path checks this one flag, so a
   * button left enabled by mistake still can't write (sprint 11).
   */
  readOnly: boolean;
}

export function createPlanStore(doc: Y.Doc = new Y.Doc()): PlanStore {
  const r = root(doc);
  const undoManager = new Y.UndoManager([r.properties, r.items, r.dependencies, r.related], {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
    // Every command is its own undo step, however quickly they follow each other.
    captureTimeout: 0,
  });
  return { doc, undoManager, readOnly: false };
}

/** Why a plan opened read-only, if it did. */
export type ReadOnlyReason = 'view-link' | 'newer-build';

/** One plan, open: its store, whether it's saving, its relay connection if it's shared, and how to close it (ADR 0021). */
export interface OpenPlan {
  id: PlanId;
  store: PlanStore;
  persistence: PersistenceStatus;
  /** The relay connection, for a shared plan (ADR 0017). */
  connection: Connection | null;
  readOnly: ReadOnlyReason | null;
  close: () => Promise<void>;
}

/** A shared plan's connection to its relay, as the board sees it. */
export type Connection = RelayProvider;
export type { ConnectionStatus, RelayProblem } from '../store/relay.ts';

/**
 * Open one of the browser's plans, backed by its own database. Resolves once
 * saved content is loaded. A shared plan also connects to its relay, which
 * goes on catching up in the background.
 */
export async function openPlanStore(id: PlanId = FIRST_PLAN, shared?: SharedPlan): Promise<OpenPlan> {
  const store = createPlanStore();
  const { status, close } = await persist(store.doc, planDatabase(id));
  let readOnly: ReadOnlyReason | null = shared && !shared.secret ? 'view-link' : writtenByNewer(store.doc) ? 'newer-build' : null;
  store.readOnly = readOnly !== null;
  ensureBuiltIns(store);
  // The same plan open in another tab follows along (sprint 10, slice 3).
  const stopTabs = syncTabs(store.doc, planDatabase(id));
  // A loop two tabs made at once, or one left in storage, is settled now and whenever one appears (ADR 0004).
  repairLoops(store);
  const stopLoops = watchLoops(store);
  const connection = shared
    ? new RelayProvider({
        doc: store.doc,
        relay: shared.relay,
        room: shared.room,
        viewKey: shared.viewKey,
        ...(shared.secret ? { secret: shared.secret } : {}),
        ...(shared.pending ? { create: true } : {}),
        sync: typeof indexedDB === 'undefined' ? memorySyncStore() : indexedDbSyncStore(syncDatabase(id)),
      })
    : null;
  const opened: OpenPlan = {
    id,
    store,
    persistence: status,
    connection,
    readOnly,
    close: async () => {
      connection?.destroy();
      stopLoops();
      stopTabs();
      store.undoManager.destroy();
      await close();
    },
  };
  // What arrives from the relay may come from a newer build: then this copy only reads. Checked before the
  // board hears of the change, since this listener was added first.
  connection?.subscribe(() => {
    if (readOnly === null && writtenByNewer(store.doc)) {
      readOnly = 'newer-build';
      opened.readOnly = readOnly;
      store.readOnly = true;
    }
  });
  return opened;
}

/**
 * How many changes on this computer the relay doesn't have yet, counted as
 * the cards they touch, plus any property changed (requirement 35). It
 * compares the plan with what the relay is known to hold, so it's right
 * across tabs, undo and repairs, and survives a reload.
 */
export function unsharedChanges(store: PlanStore, connection: Connection): number {
  if (connection.unshared() === null) return 0;
  const shared = new Y.Doc();
  Y.applyUpdate(shared, connection.sharedState());
  const changes = planChanges(readPlan(shared), readPlan(store.doc));
  return changes.cards + changes.properties;
}

/** The plan's name as its document keeps it (ADR 0021), if it has one. */
export function planName(store: PlanStore): string | null {
  return planNameOf(store.doc);
}

/** Call `listener` whenever the plan's name changes in its document: renamed here, in another tab, or by someone else. */
export function watchPlanName(store: PlanStore, listener: (name: string) => void): () => void {
  const meta = root(store.doc).meta;
  const observer = (event: Y.YMapEvent<unknown>) => {
    const name = planNameOf(store.doc);
    if (event.keysChanged.has('name') && name !== null) listener(name);
  };
  meta.observe(observer);
  return () => meta.unobserve(observer);
}

/**
 * Replace a shared plan's content with another plan, such as a backup from a
 * file (Q58). Unlike `startPlan`, it's one undo step, and everyone sharing
 * the plan sees the change.
 */
export function replacePlan(store: PlanStore, plan: Plan): void {
  edit(store, () => writePlan(store.doc, plan));
}

/** Name the plan in its document. Not an undo step. */
export function namePlan(store: PlanStore, name: string): void {
  if (store.readOnly) return;
  setPlanName(store.doc, name);
}

/** Whether the plan has no properties and no cards: nothing would be lost in replacing it. */
export function isEmptyPlan(store: PlanStore): boolean {
  return isEmpty(store.doc);
}

/**
 * Fill a new plan (Q66): a file, an import, the sample, or a blank plan.
 * It isn't an undo step: the plan didn't exist before, so there's nothing
 * to go back to but deleting it.
 */
export function startPlan(store: PlanStore, plan: Plan): void {
  if (store.readOnly) return;
  store.doc.transact(() => writePlan(store.doc, plan));
  store.undoManager.clear();
}

/**
 * Add any built-in property a board saved before it existed is missing,
 * such as Level (Q32), with no values on any card. It's part of opening
 * the board, not an edit, so it isn't an undo step. An empty board stays
 * empty. Returns whether anything was added.
 */
export function ensureBuiltIns(store: PlanStore): boolean {
  if (store.readOnly || isEmpty(store.doc)) return false;
  const plan = readPlan(store.doc);
  const missing = Object.values(withBuiltIns(plan).properties).filter((p) => !plan.properties[p.id]);
  if (missing.length === 0) return false;
  const properties = root(store.doc).properties;
  store.doc.transact(() => {
    for (const property of missing) properties.set(property.id, propertyToY(property));
  });
  return true;
}

/** Marks loop repairs (ADR 0004): not anyone's edit, so undo never tracks them. */
const REPAIR_ORIGIN = { source: 'loop-repair' };

/**
 * Settle any loop of groups that two people's moves made together (ADR
 * 0004), by writing the new parents every computer works out alike.
 * Outside undo. Returns how many cards moved.
 */
export function repairLoops(store: PlanStore): number {
  // A view-only copy leaves repairs to those who can write; its board stays readable meanwhile (ADR 0004).
  if (store.readOnly) return 0;
  const repairs = loopRepairs(readTree(store.doc));
  if (repairs.size === 0) return 0;
  const items = root(store.doc).items;
  store.doc.transact(() => {
    for (const [id, parent] of repairs) items.get(id)?.set('parent', parent);
  }, REPAIR_ORIGIN);
  return repairs.size;
}

/**
 * Repair loops whenever the document changes other than by a repair: after
 * an edit from another tab or person, and after undo, which can restore a
 * group someone has since moved inside. Batched to once per task. Returns a
 * function that stops.
 */
export function watchLoops(store: PlanStore): () => void {
  let queued = false;
  const onUpdate = (_update: Uint8Array, origin: unknown) => {
    if (origin === REPAIR_ORIGIN || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      repairLoops(store);
    });
  };
  store.doc.on('update', onUpdate);
  return () => store.doc.off('update', onUpdate);
}

/** Move cards to new groups in one transaction, all with the same move stamp (ADR 0004). */
function moveItems(store: PlanStore, moves: Iterable<readonly [ItemId, ItemId | null]>): void {
  const items = root(store.doc).items;
  const counter = latestMoveCounter(store.doc) + 1;
  for (const [id, parent] of moves) {
    const item = items.get(id);
    if (item) moveItem(item, parent, counter, store.doc.clientID);
  }
}

function edit(store: PlanStore, change: () => void): void {
  if (store.readOnly) return;
  store.doc.transact(change, LOCAL_ORIGIN);
}

/** Replace the board with `plan`. Undoable. */
export function loadPlan(store: PlanStore, plan: Plan): void {
  edit(store, () => writePlan(store.doc, plan));
}

/**
 * Replace the board with an imported CSV (requirement 28, questions.md
 * Q26): the draft's cards, built with the value table's choices. Every
 * card keeps its Jira key. One undo step brings the old board back.
 */
export function importPlan(
  store: PlanStore,
  draft: Draft,
  choices: ValueChoices,
  quarterOrder: readonly string[],
): ImportResult {
  const result = importedPlan(draft, choices, quarterOrder);
  loadPlan(store, result.plan);
  return result;
}

/** The plan an import makes, with new IDs, for a plan of its own (Q66). */
export function importedPlan(draft: Draft, choices: ValueChoices, quarterOrder: readonly string[]): ImportResult {
  return planFromDraft(draft, choices, randomId, quarterOrder);
}

/** Empty the board completely. Undoable. */
export function resetPlan(store: PlanStore): void {
  edit(store, () => writePlan(store.doc, { properties: {}, items: {}, dependencies: [], related: [] }));
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
    for (const [property, next] of Object.entries(change.values)) writeValues(store, item, property, next);
  });
  return true;
}

/**
 * Drop several selected cards together, dragged by one copy (questions.md
 * Q48): every card gets the drop's values (see planDrops). Returns how many
 * cards changed. One undo step.
 */
export function dropCards(
  store: PlanStore,
  view: ViewSpec,
  dragged: CardRef,
  ids: Iterable<ItemId>,
  target: DropTarget,
  mode: DropMode = 'replace',
): number {
  const changes = planDrops(readPlan(store.doc), view, dragged, ids, target, mode);
  const items = root(store.doc).items;
  if (changes.length === 0) return 0;
  edit(store, () => {
    for (const [id, change] of changes) {
      const item = items.get(id);
      if (!item) continue;
      if (change.sequence !== undefined) item.set('sequence', change.sequence);
      for (const [property, next] of Object.entries(change.values)) writeValues(store, item, property, next);
    }
  });
  return changes.length;
}

/** Whether a property holds several values on a card (fixed when the property is made). */
function isMulti(store: PlanStore, property: PropertyId): boolean {
  return root(store.doc).properties.get(property)?.get('multi') === true;
}

/** Set one property's values on an item, writing only what changed (ADR 0016). Call inside a transaction. */
function writeValues(store: PlanStore, item: Y.Map<unknown>, property: PropertyId, next: readonly ValueId[]): void {
  writeItemValues(item, property, isMulti(store, property), next);
}

/** Mark a card deleted (ADR 0016): readers hide it and everything inside it, and undo clears the mark. */
function tombstone(item: Y.Map<unknown> | undefined): void {
  item?.set('deleted', true);
}

function writeCardChanges(store: PlanStore, property: PropertyId, cards: readonly CardValueChange[]): void {
  const items = root(store.doc).items;
  for (const { item, values } of cards) {
    const map = items.get(item);
    if (map) writeValues(store, map, property, values);
  }
}

/**
 * A new, never-reused item ID (docs/decisions/0003). Uses getRandomValues,
 * which works in pages opened from disk, unlike randomUUID in some browsers.
 */
export function newItemId(): ItemId {
  return randomId('i');
}

/** Random IDs, for items, custom properties, and values alike (ADR 0009). */
function randomId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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
  const plan = readPlan(store.doc);
  const { sequence, values } = valuesForNewItem(plan, view, target);
  const id = newItemId();
  const rank = nextRank(plan);
  edit(store, () =>
    root(store.doc).items.set(id, itemToY({ id, title: clean, description: '', parent, sequence, rank, values }, plan)),
  );
  return id;
}

/**
 * Add a card inside `parent`, which becomes a group if it wasn't one, with
 * the parent's values on the view's axes (`valuesForChild`). One undo step.
 */
export function createChild(store: PlanStore, view: ViewSpec, parent: ItemId, title: string): ItemId | null {
  const clean = cleanTitle(title);
  const plan = readPlan(store.doc);
  const item = plan.items[parent];
  if (clean === null || !item) return null;
  const { sequence, values } = valuesForChild(item, view);
  const id = newItemId();
  const rank = nextRank(plan);
  edit(store, () =>
    root(store.doc).items.set(id, itemToY({ id, title: clean, description: '', parent, sequence, rank, values }, plan)),
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
 * Change one property on every selected card, from the inspector (Q35).
 * Returns how many cards changed; no change records no undo step.
 */
export function editCardValues(store: PlanStore, ids: Iterable<ItemId>, property: PropertyId, change: ValueEdit): number {
  const cards = planValueEdit(readPlan(store.doc), [...ids], property, change);
  if (cards.length === 0) return 0;
  edit(store, () => writeCardChanges(store, property, cards));
  return cards.length;
}

/** Replace a card's description. Trailing whitespace is dropped; an unchanged one records no undo step. */
export function setDescription(store: PlanStore, id: ItemId, text: string): boolean {
  const item = root(store.doc).items.get(id);
  const clean = text.replace(/\s+$/, '');
  if (!item || (item.get('description') ?? '') === clean) return false;
  edit(store, () => item.set('description', clean));
  return true;
}

/**
 * Delete cards and everything inside any groups among them (questions.md
 * Q17). Cards are marked deleted rather than removed (ADR 0016), so an edit
 * someone makes to one at the same moment survives, and a card added to a
 * deleted group hides with it. Links to deleted cards stay stored and
 * hidden, and come back with the cards. One undo step restores all of it.
 * Returns how many cards were deleted.
 */
export function deleteItems(store: PlanStore, ids: Iterable<ItemId>): number {
  const doomed = deletionOf(readPlan(store.doc), ids);
  if (doomed.items.length === 0) return 0;
  const r = root(store.doc);
  edit(store, () => {
    for (const id of doomed.items) tombstone(r.items.get(id));
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
    edit(store, () => moveItems(store, grouping.members.map((id) => [id, grouping.group] as const)));
    return { group: grouping.group, created: false };
  }
  const id = newItemId();
  const { sequence, values } = sharedValues(plan, grouping.members);
  edit(store, () => {
    items.set(id, itemToY({ id, title: NEW_GROUP_TITLE, description: '', parent: grouping.parent, sequence, rank: nextRank(plan), values }, plan));
    moveItems(store, grouping.members.map((member) => [member, id] as const));
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
    moveItems(store, ungroup.moves.map(({ item, parent }) => [item, parent] as const));
    for (const dep of ungroup.removed) r.dependencies.delete(dependencyKey(dep));
    for (const dep of ungroup.added) r.dependencies.set(dependencyKey(dep), { from: dep.from, to: dep.to });
    for (const link of ungroup.relatedRemoved) r.related.delete(relatedKey(link));
    for (const link of ungroup.relatedAdded) r.related.set(relatedKey(link), { a: link.a, b: link.b });
    for (const group of ungroup.groups) tombstone(r.items.get(group));
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
  edit(store, () => moveItems(store, moving.map((id) => [id, parent] as const)));
  return moving;
}

/**
 * Add a custom property (requirement 26): flat for now (questions.md Q25),
 * holding one value per card or several. Returns its ID, or null when the
 * name is blank or taken. One undo step.
 */
export function createProperty(store: PlanStore, name: string, multi: boolean): PropertyId | null {
  if (propertyNameProblem(readPlan(store.doc), name) !== null) return null;
  const clean = cleanTitle(name)!;
  const id = randomId('p');
  const property: SelectProperty = { kind: 'select', id, name: clean, levels: [clean], multi, values: {} };
  edit(store, () => root(store.doc).properties.set(id, propertyToY(property)));
  return id;
}

/**
 * Rename a property. A flat property's one level shares its name, so it's
 * renamed too. Returns false (no undo step) for a blank, taken, or
 * unchanged name.
 */
export function renameProperty(store: PlanStore, id: PropertyId, name: string): boolean {
  const plan = readPlan(store.doc);
  const property = plan.properties[id];
  const clean = cleanTitle(name);
  const map = root(store.doc).properties.get(id);
  if (!property || !map || clean === null || clean === property.name) return false;
  if (propertyNameProblem(plan, clean, id) !== null) return false;
  edit(store, () => {
    map.set('name', clean);
    if (property.kind === 'select' && property.levels.length === 1 && property.levels[0] === property.name) {
      map.set('levels', [clean]);
    }
  });
  return true;
}

/**
 * Delete a custom property and every card's values for it. Built-in
 * properties can't be deleted (requirement 25). Returns how many cards
 * lost a value, or null if nothing was deleted. One undo step.
 */
export function deleteProperty(store: PlanStore, id: PropertyId): number | null {
  const plan = readPlan(store.doc);
  const r = root(store.doc);
  if (isBuiltIn(id) || !plan.properties[id]) return null;
  const affected = cardsWithProperty(plan, id);
  edit(store, () => {
    r.items.forEach((item) => clearItemValues(item, id));
    r.properties.delete(id);
  });
  return affected.length;
}

/** The Yjs map of a select property's values: one map per value (ADR 0016). */
function valuesMap(store: PlanStore, property: PropertyId): Y.Map<Y.Map<unknown>> | null {
  const map = root(store.doc).properties.get(property);
  const values = map?.get('values');
  return values instanceof Y.Map ? (values as Y.Map<Y.Map<unknown>>) : null;
}

/**
 * Add a value at the end of its siblings: a top-level value, or one under
 * `parent` (a component in an area). IDs are random and never reused, so a
 * renamed value keeps its cards (ADR 0009). Returns the new value's ID, or
 * null for a blank or duplicate name. One undo step.
 */
export function addValue(
  store: PlanStore,
  propertyId: PropertyId,
  label: string,
  parent: ValueId | null = null,
): ValueId | null {
  const property = readPlan(store.doc).properties[propertyId];
  const values = valuesMap(store, propertyId);
  if (property?.kind !== 'select' || !values) return null;
  if (parent !== null && !property.values[parent]) return null;
  if (valueLabelProblem(property, label, parent) !== null) return null;
  const id = randomId('v');
  const node = { label: cleanTitle(label)!, parent, order: orderAtEnd(property, parent) };
  edit(store, () => values.set(id, valueNodeToY(node)));
  return id;
}

/** Rename a value. Its ID stays, so its cards keep it. Returns false for a blank, clashing, or unchanged label. */
export function renameValue(store: PlanStore, propertyId: PropertyId, valueId: ValueId, label: string): boolean {
  const property = readPlan(store.doc).properties[propertyId];
  const values = valuesMap(store, propertyId);
  const node = property?.kind === 'select' ? property.values[valueId] : undefined;
  const clean = cleanTitle(label);
  if (property?.kind !== 'select' || !values || !node || clean === null || clean === node.label) return false;
  if (valueLabelProblem(property, clean, node.parent, valueId) !== null) return false;
  edit(store, () => values.get(valueId)?.set('label', clean));
  return true;
}

/** Move a value one place up or down among its siblings. Returns false at either end. */
export function reorderValue(store: PlanStore, propertyId: PropertyId, valueId: ValueId, direction: 'up' | 'down'): boolean {
  const property = readPlan(store.doc).properties[propertyId];
  const values = valuesMap(store, propertyId);
  if (property?.kind !== 'select' || !values) return false;
  const node = property.values[valueId];
  const order = reorderKey(property, valueId, direction);
  if (!node || order === null) return false;
  edit(store, () => values.get(valueId)?.set('order', order));
  return true;
}

/**
 * Move a value under another parent at the same level: a component to
 * another area, or a release to another quarter. It keeps its ID and its
 * cards (ADR 0009). Returns false if the move isn't allowed. One undo step.
 */
export function moveValue(store: PlanStore, propertyId: PropertyId, valueId: ValueId, parent: ValueId): boolean {
  const plan = readPlan(store.doc);
  const property = plan.properties[propertyId];
  const values = valuesMap(store, propertyId);
  const move = planValueMove(plan, propertyId, valueId, parent);
  const node = property?.kind === 'select' ? property.values[valueId] : undefined;
  if (!move || !values || !node) return false;
  edit(store, () => {
    const map = values.get(valueId);
    map?.set('parent', parent);
    map?.set('order', move.order);
    writeCardChanges(store, propertyId, move.cards);
  });
  return true;
}

/**
 * Delete a value and everything below it. Its cards move to its parent
 * value, or lose it when it has none (questions.md Q4). Returns how many
 * cards moved and where, or null if nothing was deleted. One undo step.
 */
export function deleteValue(
  store: PlanStore,
  propertyId: PropertyId,
  valueId: ValueId,
): { cards: number; parent: ValueId | null } | null {
  const deletion = planValueDelete(readPlan(store.doc), propertyId, valueId);
  const values = valuesMap(store, propertyId);
  if (!deletion || !values) return null;
  edit(store, () => {
    writeCardChanges(store, propertyId, deletion.cards);
    // Marked, not removed (ADR 0016): a card someone tags with it meanwhile reads as untagged, and undo brings it back.
    for (const id of deletion.removed) values.get(id)?.set('deleted', true);
  });
  return { cards: deletion.cards.length, parent: deletion.parent };
}

/** Rename one level of a hierarchy, such as Area or Release. Returns false for a blank, clashing, or unchanged name. */
export function renameLevel(store: PlanStore, propertyId: PropertyId, index: number, name: string): boolean {
  const property = readPlan(store.doc).properties[propertyId];
  const map = root(store.doc).properties.get(propertyId);
  const clean = cleanTitle(name);
  if (property?.kind !== 'select' || !map || clean === null || property.levels[index] === undefined) return false;
  if (property.levels[index] === clean || levelNameProblem(property, index, clean) !== null) return false;
  edit(store, () => map.set('levels', property.levels.map((level, i) => (i === index ? clean : level))));
  return true;
}

/**
 * Link two cards: `from` must come before `to` (requirement 15, Q24).
 * Loops are allowed (Q37). Returns why it can't be made, or null once it
 * is. One undo step.
 */
export function addDependency(store: PlanStore, from: ItemId, to: ItemId): string | null {
  const problem = linkProblem(readPlan(store.doc), from, to);
  if (problem !== null) return problem;
  edit(store, () => root(store.doc).dependencies.set(dependencyKey({ from, to }), { from, to }));
  return null;
}

/** Remove a link. Returns false (no undo step) if there was none. */
export function removeDependency(store: PlanStore, from: ItemId, to: ItemId): boolean {
  return removeDependencies(store, [{ from, to }]) > 0;
}

/** Remove several links in one undo step: everything a clicked line stands for. Returns how many were removed. */
export function removeDependencies(store: PlanStore, links: readonly Dependency[]): number {
  const plan = readPlan(store.doc);
  const existing = links.filter((d) => hasLink(plan, d.from, d.to));
  if (existing.length === 0) return 0;
  edit(store, () => {
    for (const d of existing) root(store.doc).dependencies.delete(dependencyKey(d));
  });
  return existing.length;
}

/**
 * Relate two cards, with no order between them (Q44). Returns why it can't
 * be made, or null once it is. One undo step.
 */
export function addRelated(store: PlanStore, x: ItemId, y: ItemId): string | null {
  const problem = relatedProblem(readPlan(store.doc), x, y);
  if (problem !== null) return problem;
  const link = relatedPair(x, y);
  edit(store, () => root(store.doc).related.set(relatedKey(link), link));
  return null;
}

/** Remove a related link, in either order. Returns false (no undo step) if there was none. */
export function removeRelated(store: PlanStore, x: ItemId, y: ItemId): boolean {
  return removeRelatedLinks(store, [relatedPair(x, y)]) > 0;
}

/** Remove several related links in one undo step: everything a clicked line stands for. Returns how many. */
export function removeRelatedLinks(store: PlanStore, links: readonly Related[]): number {
  const plan = readPlan(store.doc);
  const existing = links.filter((l) => hasRelated(plan, l.a, l.b));
  if (existing.length === 0) return 0;
  edit(store, () => {
    for (const l of existing) root(store.doc).related.delete(relatedKey(relatedPair(l.a, l.b)));
  });
  return existing.length;
}

export function undo(store: PlanStore): void {
  if (!store.readOnly) store.undoManager.undo();
}

export function redo(store: PlanStore): void {
  if (!store.readOnly) store.undoManager.redo();
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
