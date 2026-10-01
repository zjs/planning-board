import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { chain, directLinks, hasLink, linkProblem, visibleLinks } from './dependencies.ts';
import type { Dependency, Plan } from './model.ts';

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
