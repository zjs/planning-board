// Finding cards by typing (questions.md Q50, ADR 0014). Pure queries: which
// cards a query matches, which of them are on the board, and which are hidden
// inside collapsed groups. Finding dims the rest; it never hides or moves a card.

import type { Item, ItemId, Plan } from './model.ts';
import type { CardRef, ViewLayout } from './view.ts';

/** Lowercase, without accents, so "resume" finds "Résumé". */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Folded words: runs of letters and digits, so "PAY-12" is "pay" and "12". */
function wordsOf(text: string): string[] {
  return foldText(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** The words of a query, folded. An empty list means nothing is being found. */
export function queryWords(query: string): string[] {
  return wordsOf(query);
}

/**
 * Every word typed starts a word somewhere in the card's title, key or
 * description, so "sso" finds "SSO session timeout" but not "processor".
 */
export function itemMatches(item: Item, words: readonly string[]): boolean {
  if (words.length === 0) return false;
  const own = wordsOf([item.title, item.externalKey ?? '', item.description].join(' '));
  return words.every((word) => own.some((w) => w.startsWith(word)));
}

export interface Found {
  /**
   * Every match, in board order, each once. A match inside a folded group
   * follows the card it's folded into.
   */
  matches: ItemId[];
  /** The matches with a copy on the board. */
  shown: ReadonlySet<ItemId>;
  /** Matches inside collapsed groups, by the card on the board they're tucked into. */
  inside: ReadonlyMap<ItemId, ItemId[]>;
}

/** Every copy, faded group copies and the cards they frame included, in board order. */
function boardOrder(layout: ViewLayout): ItemId[] {
  const refs: CardRef[] = [
    ...layout.cells.flat(2),
    ...layout.holding.rows.flat(),
    ...layout.holding.columns.flat(),
    ...layout.holding.corner,
  ];
  return [...new Set(refs.flatMap((ref) => [ref.itemId, ...(ref.inner ?? []).map((r) => r.itemId)]))];
}

/**
 * The cards matching `words`, and where each one is: on the board, or folded
 * into a group that is. An expanded group isn't on the board (its children
 * are), so it isn't counted as a match there.
 */
export function findOnBoard(plan: Plan, layout: ViewLayout, words: readonly string[]): Found {
  const order = boardOrder(layout);
  const onBoard = new Set(order);
  const shown = new Set<ItemId>();
  const inside = new Map<ItemId, ItemId[]>();
  if (words.length === 0) return { matches: [], shown, inside };
  for (const item of Object.values(plan.items)) {
    if (!itemMatches(item, words)) continue;
    if (onBoard.has(item.id)) {
      shown.add(item.id);
      continue;
    }
    // The nearest group around it that's on the board, guarding against a broken (looping) tree.
    const seen = new Set<ItemId>([item.id]);
    let at = item.parent;
    while (at !== null && !onBoard.has(at) && !seen.has(at)) {
      seen.add(at);
      at = plan.items[at]?.parent ?? null;
    }
    if (at === null || !onBoard.has(at)) continue;
    inside.set(at, [...(inside.get(at) ?? []), item.id]);
  }
  const matches: ItemId[] = [];
  for (const id of order) {
    if (shown.has(id)) matches.push(id);
    const folded = inside.get(id);
    if (folded) matches.push(...folded.sort((a, b) => (plan.items[a]?.title ?? '').localeCompare(plan.items[b]?.title ?? '')));
  }
  return { matches, shown, inside };
}

/** The match after (or before) `current`, wrapping around; the first or last when there's none yet. */
export function stepMatch(matches: readonly ItemId[], current: ItemId | null, by: 1 | -1): ItemId | null {
  if (matches.length === 0) return null;
  const at = current === null ? -1 : matches.indexOf(current);
  if (at === -1) return by === 1 ? matches[0]! : matches[matches.length - 1]!;
  return matches[(at + by + matches.length) % matches.length]!;
}
