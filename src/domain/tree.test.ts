import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { childCounts, topLevelItems, wouldCreateCycle } from './tree.ts';

const p = plan(
  item('epic'),
  item('feature', { parent: 'epic' }),
  item('task-a', { parent: 'feature' }),
  item('task-b', { parent: 'feature' }),
  item('solo'),
);

describe('group tree', () => {
  it('counts direct children only', () => {
    expect(childCounts(p)).toEqual(
      new Map([
        ['epic', 1],
        ['feature', 2],
      ]),
    );
  });

  it('detects moves that would create a cycle', () => {
    expect(wouldCreateCycle(p, 'epic', 'task-a')).toBe(true);
    expect(wouldCreateCycle(p, 'epic', 'epic')).toBe(true);
    expect(wouldCreateCycle(p, 'task-a', 'solo')).toBe(false);
    expect(wouldCreateCycle(p, 'feature', null)).toBe(false);
  });

  it('shows only roots at the top level', () => {
    expect(topLevelItems(p).sort()).toEqual(['epic', 'solo']);
  });

  it('surfaces orphans and cycle members instead of hiding them', () => {
    const bad = plan(
      item('orphan', { parent: 'missing' }),
      item('a', { parent: 'b' }),
      item('b', { parent: 'a' }),
      item('child-of-a', { parent: 'a' }),
    );
    expect(topLevelItems(bad).sort()).toEqual(['a', 'b', 'orphan']);
    // Cycle members are on the board, so they don't also count as hidden children.
    expect(childCounts(bad)).toEqual(new Map([['a', 1]]));
  });
});
