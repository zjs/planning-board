// A shared plan as a file (requirement 37, ADR 0022), for companies where no
// relay is allowed: the whole board, sealed with the plan's key, sent by
// email or a shared drive. The key travels separately, in the plan's link
// (Q72), so a file on its own can't be read.
//
//   magic "PBCH" · version · room · sealed board · sealed history (or empty)

import * as Y from 'yjs';
import { FrameReader, FrameWriter } from './frames.ts';
import { fromBase64Url, seal, unseal } from './keys.ts';

export const CHANGES_FILE_VERSION = 1;
export const CHANGES_FILE_EXTENSION = 'pbchanges';
const MAGIC = new TextEncoder().encode('PBCH');

/** A changes file, read but not yet opened: which plan it's for, and its sealed contents. */
export interface ChangesFile {
  room: string;
  board: Uint8Array;
  /** The plan's history (ADR 0020), sealed; empty from builds before sprint 13, or a plan with none. */
  history: Uint8Array;
}

export type ChangesFileProblem = 'not-a-changes-file' | 'newer-version';

/** The whole of `doc`, and of its history if given, as a changes file for `room`, sealed with the plan's key (base64url). */
export function writeChangesFile(doc: Y.Doc, room: string, viewKey: string, history?: Y.Doc): Uint8Array {
  const key = fromBase64Url(viewKey);
  const board = seal(key, room, 'file', Y.encodeStateAsUpdate(doc));
  const sealedHistory = history ? seal(key, room, 'history-file', Y.encodeStateAsUpdate(history)) : new Uint8Array();
  const body = new FrameWriter(CHANGES_FILE_VERSION).bytes(new TextEncoder().encode(room)).bytes(board).bytes(sealedHistory).done();
  const out = new Uint8Array(MAGIC.length + body.length);
  out.set(MAGIC);
  out.set(body, MAGIC.length);
  return out;
}

/** Read a changes file's room and sealed board, without its key. */
export function readChangesFile(bytes: Uint8Array): ChangesFile | ChangesFileProblem {
  if (bytes.length <= MAGIC.length || MAGIC.some((b, i) => bytes[i] !== b)) return 'not-a-changes-file';
  try {
    const r = new FrameReader(bytes.subarray(MAGIC.length));
    if (r.kind !== CHANGES_FILE_VERSION) return r.kind > CHANGES_FILE_VERSION ? 'newer-version' : 'not-a-changes-file';
    const room = new TextDecoder().decode(r.bytes());
    const board = r.bytes();
    const history = r.more() ? r.bytes() : new Uint8Array();
    return { room, board, history };
  } catch {
    return 'not-a-changes-file';
  }
}

/** Open a changes file's board with the plan's key, as one Yjs update; null if the key doesn't open it. */
export function openChangesFile(file: ChangesFile, viewKey: string): Uint8Array | null {
  try {
    return unseal(fromBase64Url(viewKey), file.room, 'file', file.board);
  } catch {
    return null;
  }
}

/** Open a changes file's history with the plan's key, as one Yjs update; null if it has none, or the key doesn't open it. */
export function openChangesHistory(file: ChangesFile, viewKey: string): Uint8Array | null {
  if (file.history.length === 0) return null;
  try {
    return unseal(fromBase64Url(viewKey), file.room, 'history-file', file.history);
  } catch {
    return null;
  }
}
