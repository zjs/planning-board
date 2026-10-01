import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { levelForIssueType, levelProperty, levelWeight, withBuiltIns } from './builtins.ts';
import { groupConflicts } from './conflicts.ts';
import { mismatches } from './mismatches.ts';
import { LEVEL, type Plan } from './model.ts';
import { planFileText, readPlanFile } from './planJson.ts';

const withLevels = (...items: Parameters<typeof plan>): Plan => {
  const p = plan(...items);
  return { ...p, properties: { ...p.properties, [LEVEL]: levelProperty() } };
};

describe('withBuiltIns', () => {
  it('adds Level to a plan saved before it existed, with no values on any card', () => {
    const old = plan(item('a'));
    const upgraded = withBuiltIns(old);
    expect(upgraded.properties[LEVEL]).toEqual(levelProperty());
    expect(upgraded.items).toBe(old.items);
  });

  it('leaves an empty board empty, and a plan that already has Level alone', () => {
    const empty: Plan = { properties: {}, items: {}, dependencies: [] };
    expect(withBuiltIns(empty)).toBe(empty);
    const renamed = withLevels(item('a'));
    (renamed.properties[LEVEL] as { name: string }).name = 'Tier';
    expect(withBuiltIns(renamed)).toBe(renamed);
  });

  it('opening a plan file from before levels gives it the property; saving keeps it', () => {
    const text = planFileText(plan(item('a')));
    expect(text).not.toContain('"level"');
    const opened = readPlanFile(text);
    if (!opened.ok) throw new Error(opened.summary);
    expect(opened.plan.properties[LEVEL]).toBeDefined();
    expect(planFileText(opened.plan)).toContain('"level"');
  });
});

describe('levels', () => {
  it('maps Jira issue types: initiatives, epics, and work items as stories', () => {
    expect(['Initiative', 'Epic', 'Story', 'task', 'Bug', 'Sub-task', 'Spike', ''].map(levelForIssueType)).toEqual([
      'initiative',
      'epic',
      'story',
      'story',
      'story',
      'story',
      null,
      null,
    ]);
  });

  it('weighs a card by how many levels it sits above the lowest', () => {
    const p = withLevels(
      item('i', { values: { [LEVEL]: ['initiative'] } }),
      item('e', { values: { [LEVEL]: ['epic'] } }),
      item('s', { values: { [LEVEL]: ['story'] } }),
      item('none'),
    );
    expect(['i', 'e', 's', 'none'].map((id) => levelWeight(p, p.items[id]!))).toEqual([2, 1, 0, 0]);
  });

  it('flags a child at or above its group’s level, and nothing when either has none (Q32)', () => {
    const p = withLevels(
      item('epic', { values: { [LEVEL]: ['epic'] } }),
      item('story', { parent: 'epic', values: { [LEVEL]: ['story'] } }),
      item('peer', { parent: 'epic', values: { [LEVEL]: ['epic'] } }),
      item('boss', { parent: 'epic', values: { [LEVEL]: ['initiative'] } }),
      item('undecided', { parent: 'epic' }),
    );
    const flagged = groupConflicts(p).filter((c) => c.kind === 'group-level').map((c) => 'child' in c && c.child);
    expect(flagged.sort()).toEqual(['boss', 'peer']);
    expect(mismatches(p).onCard.get('boss')).toEqual(["Initiative, at or above its group's Epic"]);
  });
});
