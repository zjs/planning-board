// Sending and merging changes files (requirement 37, ADR 0022): a shared plan
// travelling by email or a shared drive, where no relay is allowed.

import * as Y from 'yjs';
import { planChanges } from '../domain/changes.ts';
import { openChangesFile, readChangesFile, writeChangesFile, type ChangesFile } from '../store/changesFile.ts';
import { readPlan, writtenByNewer } from '../store/schema.ts';
import { plansForRoom, type PlanEntry, type SharedPlan } from './plans.ts';
import type { PlanStore } from './store.ts';

export { CHANGES_FILE_EXTENSION, type ChangesFile } from '../store/changesFile.ts';

/** Marks a merged file's changes: outside undo, since undoing them would delete others' work at the next send. */
export const FILE_ORIGIN = { source: 'changes-file' };

/** The whole board, as a changes file for its shared plan. */
export function changesFileFor(store: PlanStore, shared: SharedPlan): Uint8Array {
  return writeChangesFile(store.doc, shared.room, shared.viewKey);
}

/** Where a changes file goes: the plan it's for in this browser, or why it can't go anywhere. */
export type ChangesTarget =
  | { kind: 'plan'; entry: PlanEntry; file: ChangesFile }
  | { kind: 'not-a-changes-file' }
  | { kind: 'newer-version' }
  | { kind: 'no-plan' };

/** Read a file, and find the plan in this browser it's for. A plan held as an edit link wins over a view link. */
export function changesTarget(bytes: Uint8Array): ChangesTarget {
  const file = readChangesFile(bytes);
  if (typeof file === 'string') return { kind: file };
  const plans = plansForRoom(file.room);
  const entry = plans.find((p) => p.shared?.secret) ?? plans[0];
  return entry ? { kind: 'plan', entry, file } : { kind: 'no-plan' };
}

export type MergeResult = { kind: 'merged'; cards: number; properties: number } | { kind: 'wrong-key' } | { kind: 'read-only' };

/**
 * Merge a changes file into a plan. Merging the same file twice, or files in
 * any order, gives the same board. Its changes go on to the plan's relay, if
 * it has one, like any other change.
 */
export function mergeChanges(store: PlanStore, shared: SharedPlan, file: ChangesFile): MergeResult {
  if (store.readOnly) return { kind: 'read-only' };
  const update = file.room === shared.room ? openChangesFile(file, shared.viewKey) : null;
  if (!update) return { kind: 'wrong-key' };
  const before = readPlan(store.doc);
  try {
    Y.applyUpdate(store.doc, update, FILE_ORIGIN);
  } catch {
    return { kind: 'wrong-key' };
  }
  // A file from a newer build leaves this one only showing the plan, as the relay's changes would.
  if (writtenByNewer(store.doc)) store.readOnly = true;
  const changes = planChanges(before, readPlan(store.doc));
  return { kind: 'merged', ...changes };
}

/** What a merge did, in words for a notice. */
export function describeMerge(result: { cards: number; properties: number }): string {
  if (result.cards === 0 && result.properties === 0) return 'Merged: nothing new in that file.';
  const parts = [
    ...(result.cards > 0 ? [`${result.cards} ${result.cards === 1 ? 'card' : 'cards'}`] : []),
    ...(result.properties > 0 ? [`${result.properties} ${result.properties === 1 ? 'property' : 'properties'}`] : []),
  ];
  return `Merged: ${parts.join(' and ')} changed.`;
}
