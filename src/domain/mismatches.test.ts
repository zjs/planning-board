import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { mismatches } from './mismatches.ts';
import { SIZE, SYSTEM, TIME } from './model.ts';

describe('mismatches', () => {
  const p = plan(
    item('epic', { title: 'Epic', values: { [SIZE]: ['m'], [TIME]: ['q1'], [SYSTEM]: ['id'] } }),
    item('big', { title: 'Big', parent: 'epic', values: { [SIZE]: ['l'] } }),
    item('story', { title: 'Story', parent: 'epic', values: { [TIME]: ['q1/r1'] } }),
    item('late', { title: 'Late', parent: 'story', values: { [TIME]: ['q2'] } }),
    item('elsewhere', { title: 'Elsewhere', parent: 'epic', values: { [SYSTEM]: ['pay/ledger'] } }),
    item('fine', { title: 'Fine', parent: 'epic', values: { [SIZE]: ['s'], [SYSTEM]: ['id/sso'] } }),
    item('partly', { title: 'Partly', parent: 'epic', values: { [SYSTEM]: ['id/mfa', 'pay/ledger'] } }),
  );
  const out = mismatches(p);

  it('explains each card that doesn’t fit its own group', () => {
    expect(out.onCard.get('big')).toEqual(["Sized L, larger than its group's M"]);
    expect(out.onCard.get('late')).toEqual(["Dated Q2, outside its group's Q1 › Q1/R1"]);
    expect(out.onCard.get('elsewhere')).toEqual(["In PAY › PAY/LEDGER, outside its group's ID"]);
    expect(out.onCard.has('fine')).toBe(false);
    expect(out.onCard.has('story')).toBe(false);
    // Only the areas outside the group are named.
    expect(out.onCard.get('partly')).toEqual(["In PAY › PAY/LEDGER, outside its group's ID"]);
  });

  it('counts everything inside a group, however deep, so a collapsed group shows it (req. 18)', () => {
    expect(out.inside.get('epic')).toHaveLength(4);
    expect(out.inside.get('epic')).toContain("Late (in Story): Dated Q2, outside its group's Q1 › Q1/R1");
    expect(out.inside.get('story')).toEqual(["Late: Dated Q2, outside its group's Q1 › Q1/R1"]);
    expect(out.inside.has('fine')).toBe(false);
  });
});
