import { generateKeyBetween } from 'fractional-indexing';
import type { OrderKey } from './model.ts';
import { compareOrderKeys } from './model.ts';

/**
 * Whether `key` is a well-formed fractional order key. fractional-indexing's
 * own check only looks at the key's head and tail, so also require its
 * base-62 digit set; anything else would sort wrongly against generated keys.
 */
export function isOrderKey(key: string): boolean {
  if (!/^[0-9A-Za-z]+$/.test(key)) return false;
  try {
    generateKeyBetween(key, null);
    return true;
  } catch {
    return false;
  }
}

/**
 * Order keys for the gaps around sorted sequence columns: one before the
 * first, one between each pair, one after the last. Dropping a card in a gap
 * gives it that key, which opens a new column there without renumbering any
 * other item (questions.md Q8).
 *
 * `allKeys` are every sequence key in the plan, including hidden group
 * children, so a gap never lands exactly on a key that's already in use.
 */
export function gapKeys(laneKeys: readonly OrderKey[], allKeys: readonly OrderKey[] = laneKeys): OrderKey[] {
  const all = [...new Set([...allKeys, ...laneKeys])].filter(isOrderKey).sort(compareOrderKeys);
  const after = (key: OrderKey | null) => all.find((k) => key === null || k > key) ?? null;
  const gaps: OrderKey[] = [];
  for (let i = 0; i <= laneKeys.length; i++) {
    const lo = laneKeys[i - 1] ?? null;
    gaps.push(generateKeyBetween(lo !== null && isOrderKey(lo) ? lo : null, after(lo)));
  }
  return gaps;
}
