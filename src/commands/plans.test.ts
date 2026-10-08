import { describe, expect, it } from 'vitest';
import {
  addPlan,
  expiredDeletes,
  fileSlug,
  findPlan,
  FIRST_PLAN,
  forgetPlan,
  hashFor,
  listPlans,
  markDeleted,
  nameFromFile,
  planDatabase,
  planFromHash,
  planOfDatabase,
  renamePlan,
  scopedKey,
  touchPlan,
  unmarkDeleted,
  type KeyValue,
} from './plans.ts';

function storage(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('the plans a browser keeps (ADR 0021)', () => {
  it("a browser with no list has today's board, as My plan", () => {
    const s = storage();
    expect(listPlans(s)).toEqual([{ id: FIRST_PLAN, name: 'My plan', created: 0, opened: 0 }]);
    expect(planDatabase(FIRST_PLAN)).toBe('planning-board:v2:default');
  });

  it('lists plans last opened first', () => {
    const s = storage();
    const a = addPlan('Sample plan', s, 10);
    const b = addPlan('Untitled plan', s, 20);
    expect(listPlans(s).map((e) => e.id)).toEqual([b.id, a.id, FIRST_PLAN]);
    touchPlan(FIRST_PLAN, s, 30);
    expect(listPlans(s).map((e) => e.id)).toEqual([FIRST_PLAN, b.id, a.id]);
  });

  it('renames, and remembers a name chosen by hand', () => {
    const s = storage();
    const a = addPlan('Untitled plan', s, 10);
    renamePlan(a.id, 'Sample plan', {}, s);
    expect(findPlan(a.id, s)).toMatchObject({ name: 'Sample plan' });
    expect(findPlan(a.id, s)?.named).toBeUndefined();
    renamePlan(a.id, 'Q3 roadmap', { byHand: true }, s);
    expect(findPlan(a.id, s)).toMatchObject({ name: 'Q3 roadmap', named: true });
  });

  it('a deleted plan is hidden until its Undo, then forgotten', () => {
    const s = storage();
    const a = addPlan('Scratch', s, 10);
    markDeleted(a.id, s, 100);
    expect(findPlan(a.id, s)).toBeNull();
    unmarkDeleted(a.id, s);
    expect(findPlan(a.id, s)).toMatchObject({ name: 'Scratch' });
    markDeleted(a.id, s, 100);
    expect(expiredDeletes(s, 100 + 30_000)).toEqual([]);
    expect(expiredDeletes(s, 100 + 61_000)).toEqual([a.id]);
    forgetPlan(a.id, s);
    expect(expiredDeletes(s, 100 + 61_000)).toEqual([]);
  });

  it('a damaged list starts again from the first plan', () => {
    const s = storage();
    s.setItem('planning-board:plans', '{not json');
    expect(listPlans(s).map((e) => e.id)).toEqual([FIRST_PLAN]);
  });

  it('names databases, links and viewer state per plan; the first plan keeps the old names', () => {
    expect(planDatabase('p1')).toBe('planning-board:v2:plan:p1');
    expect(planOfDatabase('planning-board:v2:plan:p1')).toBe('p1');
    expect(planOfDatabase('planning-board:v2:default')).toBe(FIRST_PLAN);
    expect(planOfDatabase('planning-board:v1:default')).toBeNull();
    expect(planFromHash(hashFor('p1'))).toBe('p1');
    expect(planFromHash('')).toBeNull();
    expect(scopedKey('planning-board:view', FIRST_PLAN)).toBe('planning-board:view');
    expect(scopedKey('planning-board:view', 'p1')).toBe('planning-board:view:p1');
  });

  it('turns names into file names and back', () => {
    expect(fileSlug('Q3 roadmap: Billing & Identity')).toBe('q3-roadmap-billing-identity');
    expect(fileSlug('Café')).toBe('cafe');
    expect(fileSlug('!!!')).toBe('planning-board');
    expect(nameFromFile('jira-export.csv')).toBe('jira-export');
    expect(nameFromFile('.json')).toBe('Untitled plan');
  });
});
