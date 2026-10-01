import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import {
  chain,
  dependencyLoops,
  directLinks,
  hasLink,
  linkProblem,
  linkProblems,
  linkProblemsInside,
  outOfOrder,
  visibleLinks,
} from './dependencies.ts';
import { SEQUENCE, SIZE, SYSTEM, TIME, type Dependency, type Plan } from './model.ts';
import type { ViewSpec } from './view.ts';

function withLinks(p: Plan, ...pairs: [string, string][]): Plan {
  return { ...p, dependencies: pairs.map(([from, to]): Dependency => ({ from, to })) };
}

const keys = (deps: Dependency[]) => deps.map((d) => `${d.from}>${d.to}`).sort();

describe('linkProblem', () => {
  const p = withLinks(plan(item('a'), item('b'), item('c')), ['a', 'b']);

  it('allows a new link, including one that closes a loop (Q37)', () => {
    expect(linkProblem(p, 'b', 'c')).toBeNull();
    expect(linkProblem(p, 'b', 'a')).toBeNull();
  });

  it('refuses a self-link, a duplicate, or a missing card, in plain words', () => {
    expect(linkProblem(p, 'a', 'a')).toBe("A card can't come before itself.");
    expect(linkProblem(p, 'a', 'b')).toBe('Those cards are already linked.');
    expect(linkProblem(p, 'a', 'gone')).toBe('One of those cards no longer exists.');
    expect(hasLink(p, 'a', 'b')).toBe(true);
    expect(hasLink(p, 'b', 'a')).toBe(false);
  });
});

describe('focus (Q39)', () => {
  // a → b → c → d, e → c, and a separate f → g.
  const p = withLinks(
    plan(...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => item(id))),
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'd'],
    ['e', 'c'],
    ['f', 'g'],
  );

  it('hover shows a card’s direct links', () => {
    expect(keys(directLinks(p, 'b'))).toEqual(['a>b', 'b>c']);
  });

  it('selection shows the whole chain upstream and downstream, but not other branches feeding its dependents', () => {
    expect(keys(chain(p, 'b'))).toEqual(['a>b', 'b>c', 'c>d']);
    expect(keys(chain(p, 'c'))).toEqual(['a>b', 'b>c', 'c>d', 'e>c']);
    expect(keys(chain(p, 'g'))).toEqual(['f>g']);
  });

  it('terminates on loops', () => {
    const loop = withLinks(plan(item('a'), item('b')), ['a', 'b'], ['b', 'a']);
    expect(keys(chain(loop, 'a'))).toEqual(['a>b', 'b>a']);
  });
});

describe('visibleLinks (Q38)', () => {
  // epic contains s1 and s2; s1 contains t1. x and y are top-level.
  const p = withLinks(
    plan(
      item('epic'),
      item('s1', { parent: 'epic' }),
      item('s2', { parent: 'epic' }),
      item('t1', { parent: 's1' }),
      item('x'),
      item('y'),
    ),
    ['x', 't1'],
    ['x', 's2'],
    ['s1', 's2'],
    ['x', 'y'],
  );
  const top = new Set(['epic', 'x', 'y']);

  it('draws a link to a hidden card to its nearest group on screen, sharing one line', () => {
    expect(visibleLinks(p, p.dependencies, top)).toEqual([
      { from: 'x', to: 'epic', links: [{ from: 'x', to: 't1' }, { from: 'x', to: 's2' }] },
      { from: 'x', to: 'y', links: [{ from: 'x', to: 'y' }] },
    ]);
  });

  it('skips a link that stays inside one group, and one to a card that isn’t on screen', () => {
    const insideEpic = new Set(['s1', 's2']);
    expect(visibleLinks(p, p.dependencies, insideEpic)).toEqual([
      { from: 's1', to: 's2', links: [{ from: 's1', to: 's2' }] },
    ]);
  });

  it('uses the deepest card on screen', () => {
    const zoomed = new Set(['s1', 's2', 't1', 'x']);
    expect(visibleLinks(p, [{ from: 'x', to: 't1' }], zoomed)).toEqual([
      { from: 'x', to: 't1', links: [{ from: 'x', to: 't1' }] },
    ]);
  });
});

describe('focus on a group', () => {
  const p = withLinks(
    plan(item('epic'), item('s1', { parent: 'epic' }), item('x'), item('y'), item('z')),
    ['x', 's1'],
    ['y', 'x'],
    ['epic', 'z'],
  );

  it('includes the links of the cards inside it (requirement 13)', () => {
    expect(keys(directLinks(p, 'epic'))).toEqual(['epic>z', 'x>s1']);
    expect(keys(chain(p, 'epic'))).toEqual(['epic>z', 'x>s1', 'y>x']);
  });
});

describe('dependencyLoops (Q37)', () => {
  it('finds every link on a cycle, and only those', () => {
    const p = withLinks(
      plan(...['a', 'b', 'c', 'd', 'e'].map((id) => item(id))),
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
      ['c', 'd'],
      ['d', 'e'],
    );
    expect(keys(dependencyLoops(p))).toEqual(['a>b', 'b>c', 'c>a']);
  });

  it('finds a two-card loop, and nothing in a plain chain', () => {
    expect(keys(dependencyLoops(withLinks(plan(item('a'), item('b')), ['a', 'b'], ['b', 'a'])))).toEqual(['a>b', 'b>a']);
    expect(dependencyLoops(withLinks(plan(item('a'), item('b'), item('c')), ['a', 'b'], ['b', 'c']))).toEqual([]);
  });

  it('copes with a long chain without overflowing', () => {
    const ids = Array.from({ length: 5000 }, (_, i) => `n${i}`);
    const pairs = ids.slice(1).map((id, i): [string, string] => [ids[i]!, id]);
    const p = withLinks(plan(...ids.map((id) => item(id))), ...pairs, [ids.at(-1)!, ids[0]!]);
    expect(dependencyLoops(p)).toHaveLength(5000);
  });
});

describe('outOfOrder (requirement 16)', () => {
  const seqView: ViewSpec = { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } };
  const quarterView: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };
  const releaseView: ViewSpec = { x: { property: TIME, level: 1 }, y: { property: SYSTEM, level: 0 } };
  const sizeView: ViewSpec = { x: { property: SIZE, level: 0 }, y: { property: SYSTEM, level: 0 } };

  it('flags a prerequisite to the right of its dependent in a sequence view', () => {
    const p = withLinks(plan(item('a', { sequence: 'a2' }), item('b', { sequence: 'a1' }), item('c')), ['a', 'b'], ['a', 'c']);
    expect([...outOfOrder(p, seqView)]).toEqual([['a->b', { kind: 'order', axis: 'sequence' }]]);
    expect(outOfOrder(p, sizeView).size).toBe(0);
  });

  it('judges time at the level the view shows (Q12)', () => {
    // Both in Q1, but in releases r2 before r1: only a release view sees the problem.
    const p = withLinks(plan(item('a', { values: { [TIME]: ['q1/r2'] } }), item('b', { values: { [TIME]: ['q1/r1'] } })), ['a', 'b']);
    expect(outOfOrder(p, quarterView).size).toBe(0);
    expect([...outOfOrder(p, releaseView).values()]).toEqual([{ kind: 'order', axis: 'time' }]);
  });

  it('flags a later quarter, but not an uncertain order', () => {
    const later = withLinks(plan(item('a', { values: { [TIME]: ['q2'] } }), item('b', { values: { [TIME]: ['q1/r1'] } })), ['a', 'b']);
    expect(outOfOrder(later, releaseView).size).toBe(1);
    const unsure = withLinks(plan(item('a', { values: { [TIME]: ['q1'] } }), item('b', { values: { [TIME]: ['q1/r1'] } })), ['a', 'b']);
    expect(outOfOrder(unsure, releaseView).size).toBe(0);
  });
});

describe('linkProblems and group counts (requirement 18)', () => {
  const seqView: ViewSpec = { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } };
  const p = withLinks(
    plan(
      item('epic', { title: 'Epic' }),
      item('s1', { title: 'Story one', parent: 'epic', sequence: 'a3' }),
      item('s2', { title: 'Story two', parent: 'epic', sequence: 'a1' }),
      item('x', { title: 'X' }),
      item('y', { title: 'Y' }),
    ),
    ['s1', 's2'],
    ['x', 'y'],
    ['y', 'x'],
  );

  it('flags out-of-order links in this view and loops in every view', () => {
    const problems = linkProblems(p, seqView);
    expect([...problems.keys()].sort()).toEqual(['s1->s2', 'x->y', 'y->x']);
  });

  it('counts a flagged link on every group around either card, in plain words', () => {
    const inside = linkProblemsInside(p, linkProblems(p, seqView));
    expect([...inside]).toEqual([['epic', ['“Story one” must come before “Story two”, but it\'s to its right in the sequence.']]]);
  });
});
