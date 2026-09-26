import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { allConflicts, contentionConflicts, dependencyConflicts, groupConflicts } from './conflicts.ts';
import { SIZE, SYSTEM, TIME, type Plan } from './model.ts';
import { parsePlanJson } from './planJson.ts';
import sample from '../seed/sample-plan.json';

function withDeps(p: Plan, ...pairs: [string, string][]): Plan {
  return { ...p, dependencies: pairs.map(([from, to]) => ({ from, to })) };
}

describe('dependencyConflicts', () => {
  it('flags a prerequisite placed strictly after its dependent, in sequence and in time', () => {
    const p = withDeps(
      plan(
        item('pre', { sequence: 'a2', values: { [TIME]: ['q2'] } }),
        item('dep', { sequence: 'a1', values: { [TIME]: ['q1/r2'] } }),
      ),
      ['pre', 'dep'],
    );
    expect(dependencyConflicts(p)).toEqual([
      { kind: 'dependency-order', axis: 'sequence', prerequisite: 'pre', dependent: 'dep' },
      { kind: 'dependency-order', axis: 'time', prerequisite: 'pre', dependent: 'dep' },
    ]);
  });

  it('catches an order that is certain even when one side is dated only to the quarter', () => {
    const p = withDeps(
      plan(item('pre', { values: { [TIME]: ['q2'] } }), item('dep', { values: { [TIME]: ['q1/r1'] } })),
      ['pre', 'dep'],
    );
    expect(dependencyConflicts(p, { timeLevel: 1 })).toEqual([
      { kind: 'dependency-order', axis: 'time', prerequisite: 'pre', dependent: 'dep' },
    ]);
    // Q1 overall vs Q1/R1: might be fine, so no conflict.
    const unsure = withDeps(
      plan(item('pre', { values: { [TIME]: ['q1'] } }), item('dep', { values: { [TIME]: ['q1/r1'] } })),
      ['pre', 'dep'],
    );
    expect(dependencyConflicts(unsure, { timeLevel: 1 })).toEqual([]);
  });

  it('allows the same column or bucket, and skips items without a value', () => {
    const p = withDeps(
      plan(
        item('a', { sequence: 'a1', values: { [TIME]: ['q1/r2'] } }),
        item('b', { sequence: 'a1', values: { [TIME]: ['q1/r1'] } }),
        item('c'),
      ),
      ['a', 'b'],
      ['a', 'c'],
    );
    expect(dependencyConflicts(p)).toEqual([]);
    // At release level, r2 before r1 is a violation.
    expect(dependencyConflicts(p, { timeLevel: 1 })).toEqual([
      { kind: 'dependency-order', axis: 'time', prerequisite: 'a', dependent: 'b' },
    ]);
  });
});

describe('contentionConflicts', () => {
  const busy = plan(
    item('a', { values: { [SYSTEM]: ['id/sso'], [TIME]: ['q1'] } }),
    item('b', { values: { [SYSTEM]: ['id/sso', 'id/mfa'], [TIME]: ['q1/r2'] } }),
    item('c', { values: { [SYSTEM]: ['id/sso'], [TIME]: ['q2'] } }),
    item('d', { values: { [SYSTEM]: ['id'], [TIME]: ['q1'] } }), // area only: not counted
    item('e', { values: { [SYSTEM]: ['id/sso'] } }), // unscheduled: not counted
  );

  it('reports nothing until a limit is set', () => {
    expect(contentionConflicts(busy)).toEqual([]);
  });

  it('counts work items per component per bucket against its limit', () => {
    expect(contentionConflicts(busy, { limits: { 'id/sso': 1 } })).toEqual([
      { kind: 'contention', component: 'id/sso', bucket: 'q1', items: ['a', 'b'], limit: 1 },
    ]);
    expect(contentionConflicts(busy, { defaultLimit: 2 })).toEqual([]);
  });

  it('counts a group only where none of its children refine it', () => {
    const refined = plan(
      item('g', { values: { [SYSTEM]: ['id/sso'], [TIME]: ['q1'] } }),
      item('k', { parent: 'g', values: { [SYSTEM]: ['id/sso'], [TIME]: ['q1'] } }),
    );
    expect(contentionConflicts(refined, { defaultLimit: 1 })).toEqual([]);
    // Children not tagged yet: the group's own estimate counts.
    const rough = plan(
      item('g', { values: { [SYSTEM]: ['id/sso'], [TIME]: ['q1'] } }),
      item('k', { parent: 'g' }),
      item('other', { values: { [SYSTEM]: ['id/sso'], [TIME]: ['q1'] } }),
    );
    expect(contentionConflicts(rough, { defaultLimit: 1 })).toEqual([
      { kind: 'contention', component: 'id/sso', bucket: 'q1', items: ['g', 'other'], limit: 1 },
    ]);
  });
});

describe('groupConflicts', () => {
  it('flags a child larger than, dated apart from, or in a different area than its group', () => {
    const p = plan(
      item('g', { values: { [SIZE]: ['m'], [TIME]: ['q1'], [SYSTEM]: ['id'] } }),
      item('big', { parent: 'g', values: { [SIZE]: ['l'] } }),
      item('late', { parent: 'g', values: { [TIME]: ['q2'] } }),
      item('elsewhere', { parent: 'g', values: { [SYSTEM]: ['id/sso', 'pay/ledger'] } }),
      item('fine', { parent: 'g', values: { [SIZE]: ['s'], [TIME]: ['q1/r2'], [SYSTEM]: ['id/mfa'] } }),
      item('unknown', { parent: 'g' }),
    );
    expect(groupConflicts(p)).toEqual([
      { kind: 'group-size', group: 'g', child: 'big' },
      { kind: 'group-time', group: 'g', child: 'late' },
      { kind: 'group-system', group: 'g', child: 'elsewhere' },
    ]);
  });

  it('ignores values that no longer exist, and parent cycles', () => {
    const dangling = plan(item('g', { values: { [TIME]: ['q1'] } }), item('k', { parent: 'g', values: { [TIME]: ['q9/r9'] } }));
    expect(groupConflicts(dangling)).toEqual([]);
    const cycle = plan(item('a', { parent: 'b', values: { [SIZE]: ['l'] } }), item('b', { parent: 'a', values: { [SIZE]: ['s'] } }));
    expect(groupConflicts(cycle)).toEqual([]);
  });

  it('does not flag a child dated more loosely than its group', () => {
    const p = plan(item('g', { values: { [TIME]: ['q1/r1'] } }), item('k', { parent: 'g', values: { [TIME]: ['q1'] } }));
    expect(groupConflicts(p)).toEqual([]);
  });
});

describe('sample plan', () => {
  it('contains the deliberate conflicts the seed generator plants', () => {
    const parsed = parsePlanJson(sample);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const kinds = allConflicts(parsed.plan).map((c) => (c.kind === 'dependency-order' ? `${c.kind}:${c.axis}` : c.kind));
    expect(kinds).toContain('dependency-order:sequence');
    expect(kinds).toContain('group-size');
    expect(kinds).not.toContain('contention'); // no limits by default
  });
});
