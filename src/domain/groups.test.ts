import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { planGroup, planUngroup, sharedValues } from './groups.ts';
import { SIZE, SYSTEM, TIME } from './model.ts';

describe('sharedValues', () => {
  it('keeps values every child has', () => {
    const p = plan(
      item('a', { values: { [SYSTEM]: ['id/sso', 'pay'], [SIZE]: ['m'] } }),
      item('b', { values: { [SYSTEM]: ['id/sso'], [SIZE]: ['m'] } }),
    );
    expect(sharedValues(p, ['a', 'b']).values).toEqual({ [SYSTEM]: ['id/sso'], [SIZE]: ['m'] });
  });

  it('falls back to the most precise shared ancestor', () => {
    const p = plan(
      item('a', { values: { [SYSTEM]: ['id/sso'], [TIME]: ['q1/r1'] } }),
      item('b', { values: { [SYSTEM]: ['id/mfa', 'pay/ledger'], [TIME]: ['q1/r2'] } }),
    );
    expect(sharedValues(p, ['a', 'b']).values).toEqual({ [SYSTEM]: ['id'], [TIME]: ['q1'] });
  });

  it('gives no value where children disagree or one has none', () => {
    const p = plan(
      item('a', { values: { [SYSTEM]: ['id'], [SIZE]: ['s'] } }),
      item('b', { values: { [SYSTEM]: ['pay'] } }),
    );
    expect(sharedValues(p, ['a', 'b']).values).toEqual({});
  });

  it('starts at the earliest child position, only if every child has one', () => {
    expect(sharedValues(plan(item('a', { sequence: 'a2' }), item('b', { sequence: 'a0' })), ['a', 'b']).sequence).toBe(
      'a0',
    );
    expect(sharedValues(plan(item('a', { sequence: 'a2' }), item('b')), ['a', 'b']).sequence).toBeNull();
  });
});

describe('planGroup', () => {
  const p = plan(
    item('epic'),
    item('story', { parent: 'epic' }),
    item('a'),
    item('b'),
    item('inner', { parent: 'story' }),
    item('c', { parent: 'epic' }),
    item('d', { parent: 'epic' }),
  );

  it('makes a new group, under the members’ shared parent', () => {
    expect(planGroup(p, ['a', 'b'])).toEqual({ kind: 'new', parent: null, members: ['a', 'b'] });
    expect(planGroup(p, ['a'])).toEqual({ kind: 'new', parent: null, members: ['a'] });
    expect(planGroup(p, ['c', 'd'])).toEqual({ kind: 'new', parent: 'epic', members: ['c', 'd'] });
    expect(planGroup(p, ['c', 'a'])).toEqual({ kind: 'new', parent: null, members: ['c', 'a'] });
    expect(planGroup(p, [])).toBeNull();
  });

  it('adds cards to the one existing group in the selection', () => {
    expect(planGroup(p, ['a', 'epic', 'b'])).toEqual({ kind: 'join', group: 'epic', members: ['a', 'b'] });
  });

  it('makes a new group when the selection holds two groups', () => {
    expect(planGroup(p, ['epic', 'story'])).toMatchObject({ kind: 'new', members: ['epic', 'story'] });
  });

  it('never nests a group inside its own contents', () => {
    // A group selected with its own ancestor makes two groups, so it's a new group, not a join.
    const nested = plan(item('outer'), item('mid', { parent: 'outer' }), item('leaf', { parent: 'mid' }));
    expect(planGroup(nested, ['mid', 'outer'])).toMatchObject({ kind: 'new', members: ['mid', 'outer'] });
  });
});

describe('planUngroup', () => {
  it('moves children up a level and re-points the group’s dependencies at each child (Q21)', () => {
    const p = {
      ...plan(
        item('top'),
        item('epic', { parent: 'top' }),
        item('a', { parent: 'epic' }),
        item('b', { parent: 'epic' }),
        item('x'),
      ),
      dependencies: [
        { from: 'x', to: 'epic' },
        { from: 'epic', to: 'x' },
        { from: 'x', to: 'a' },
      ],
    };
    expect(planUngroup(p, ['epic', 'x'])).toEqual({
      groups: ['epic'],
      moves: [
        { item: 'a', parent: 'top' },
        { item: 'b', parent: 'top' },
      ],
      removed: [
        { from: 'x', to: 'epic' },
        { from: 'epic', to: 'x' },
      ],
      // x -> a already exists, so it isn't added twice.
      added: [
        { from: 'x', to: 'b' },
        { from: 'a', to: 'x' },
        { from: 'b', to: 'x' },
      ],
      relatedRemoved: [],
      relatedAdded: [],
    });
  });

  it('collapses nested groups ungrouped together without losing cards or links', () => {
    const p = {
      ...plan(
        item('top'),
        item('epic', { parent: 'top' }),
        item('story', { parent: 'epic' }),
        item('inner', { parent: 'story' }),
        item('side', { parent: 'epic' }),
        item('g2'),
        item('c', { parent: 'g2' }),
        item('x'),
      ),
      dependencies: [
        { from: 'x', to: 'epic' },
        { from: 'epic', to: 'g2' },
      ],
    };
    const out = planUngroup(p, ['epic', 'story', 'g2'])!;
    expect(out.groups).toEqual(['epic', 'story', 'g2']);
    // inner skips past both dissolved groups to 'top'; c goes to the top level.
    expect(out.moves).toEqual([
      { item: 'side', parent: 'top' },
      { item: 'inner', parent: 'top' },
      { item: 'c', parent: null },
    ]);
    expect(out.added).toEqual([
      { from: 'x', to: 'inner' },
      { from: 'x', to: 'side' },
      { from: 'inner', to: 'c' },
      { from: 'side', to: 'c' },
    ]);
  });

  it('ignores cards that aren’t groups', () => {
    expect(planUngroup(plan(item('a')), ['a', 'zz'])).toBeNull();
  });
});
