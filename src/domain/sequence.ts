import { generateKeyBetween } from 'fractional-indexing';
import type { OrderKey } from './model.ts';

/**
 * Order keys for the gaps around sorted sequence columns: one before the
 * first, one between each pair, one after the last. Dropping a card in a gap
 * gives it that key, which opens a new column there without renumbering any
 * other item (questions.md Q8).
 */
export function gapKeys(sortedKeys: readonly OrderKey[]): OrderKey[] {
  const gaps: OrderKey[] = [];
  for (let i = 0; i <= sortedKeys.length; i++) {
    gaps.push(generateKeyBetween(sortedKeys[i - 1] ?? null, sortedKeys[i] ?? null));
  }
  return gaps;
}
