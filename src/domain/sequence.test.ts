import { describe, expect, it } from 'vitest';
import { compareOrderKeys } from './model.ts';
import { gapKeys } from './sequence.ts';

describe('gapKeys', () => {
  it('gives one key before, between, and after the columns, strictly in order', () => {
    const columns = ['a0', 'a1', 'a1V', 'b00'];
    const gaps = gapKeys(columns);
    expect(gaps).toHaveLength(columns.length + 1);
    const merged = [gaps[0], columns[0], gaps[1], columns[1], gaps[2], columns[2], gaps[3], columns[3], gaps[4]] as string[];
    expect([...merged].sort(compareOrderKeys)).toEqual(merged);
    expect(new Set(merged).size).toBe(merged.length);
  });

  it('gives one starting key when there are no columns yet', () => {
    expect(gapKeys([])).toHaveLength(1);
  });

  it('keeps working as gaps are repeatedly split', () => {
    let columns = ['a0', 'a1'];
    for (let i = 0; i < 50; i++) {
      columns = [...columns, gapKeys(columns)[1]!].sort(compareOrderKeys);
    }
    expect(new Set(columns).size).toBe(52);
  });
});
