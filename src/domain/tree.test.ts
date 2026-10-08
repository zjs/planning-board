import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { ancestry, canNest, childCounts, childrenOf, loopRepairs, topLevelItems, wouldCreateCycle, type TreeNode } from './tree.ts';

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

describe('childrenOf and ancestry', () => {
  const p = plan(
    item('epic'),
    item('story', { parent: 'epic' }),
    item('task', { parent: 'story' }),
    item('orphan', { parent: 'gone' }),
    item('a', { parent: 'b' }),
    item('b', { parent: 'a' }),
  );

  it('lists one level at a time, surfacing orphans and cycles at the top', () => {
    expect(childrenOf(p, null).sort()).toEqual(['a', 'b', 'epic', 'orphan']);
    expect(childrenOf(p, 'epic')).toEqual(['story']);
    expect(childrenOf(p, 'a')).toEqual([]);
    expect(childrenOf(p, 'task')).toEqual([]);
  });

  it('gives the breadcrumb path to a card', () => {
    expect(ancestry(p, 'task')).toEqual(['epic', 'story', 'task']);
    expect(ancestry(p, 'epic')).toEqual(['epic']);
    expect(ancestry(p, 'orphan')).toEqual(['orphan']);
    expect(ancestry(p, 'a')).toEqual(['a']);
    expect(ancestry(p, 'nope')).toEqual([]);
  });
});

describe('canNest', () => {
  const p = plan(item('epic'), item('story', { parent: 'epic' }), item('task', { parent: 'story' }), item('other'));

  it('lets a card go inside any other card, plain or a group', () => {
    expect(canNest(p, 'other', 'epic')).toBe(true);
    expect(canNest(p, 'other', 'task')).toBe(true);
    expect(canNest(p, 'task', 'epic')).toBe(true);
  });

  it('refuses itself, its own group, anything inside it, and missing cards', () => {
    expect(canNest(p, 'epic', 'epic')).toBe(false);
    expect(canNest(p, 'story', 'epic')).toBe(false);
    expect(canNest(p, 'epic', 'task')).toBe(false);
    expect(canNest(p, 'gone', 'epic')).toBe(false);
    expect(canNest(p, 'epic', 'gone')).toBe(false);
  });
});

describe('loop repair (ADR 0004)', () => {
  const stamp = (previous: string | null, counter: number, client: number) => ({ previous, counter, client });

  it('finds nothing to repair in a tree without loops', () => {
    expect(loopRepairs({ a: { parent: null }, b: { parent: 'a' }, c: { parent: 'missing' } }).size).toBe(0);
  });

  it('sends the card whose move has the higher stamp back to the group it left', () => {
    const nodes: Record<string, TreeNode> = {
      home: { parent: null },
      tax: { parent: 'invoices', move: stamp('home', 5, 1) },
      invoices: { parent: 'tax', move: stamp(null, 5, 2) },
    };
    expect([...loopRepairs(nodes)]).toEqual([['invoices', null]]);
    nodes.invoices!.move = stamp(null, 4, 9);
    expect([...loopRepairs(nodes)]).toEqual([['tax', 'home']]);
  });

  it('breaks ties between moves with no stamp by card ID', () => {
    expect([...loopRepairs({ a: { parent: 'b' }, b: { parent: 'a' } })]).toEqual([['b', null]]);
  });

  it("goes to the top level when the group it left is gone, or would make a loop again", () => {
    expect([...loopRepairs({ a: { parent: 'b', move: stamp('gone', 2, 1) }, b: { parent: 'a', move: stamp(null, 1, 1) } })]).toEqual([['a', null]]);
    // c left b, but b is now inside c's loop.
    expect([...loopRepairs({ c: { parent: 'd', move: stamp('b', 3, 1) }, d: { parent: 'c', move: stamp(null, 1, 1) }, b: { parent: 'd' } })]).toEqual([['c', null]]);
  });

  it('settles longer loops and several loops, and counts deleted cards', () => {
    const repairs = loopRepairs({
      a: { parent: 'b', move: stamp(null, 1, 1) },
      b: { parent: 'c', move: stamp(null, 2, 1) },
      c: { parent: 'a', move: stamp('x', 3, 1) },
      x: { parent: null }, // a deleted group still counts: c hides with it
      p: { parent: 'q', move: stamp(null, 7, 1) },
      q: { parent: 'p', move: stamp(null, 7, 2) },
    });
    expect(Object.fromEntries(repairs)).toEqual({ c: 'x', q: null });
  });
});
