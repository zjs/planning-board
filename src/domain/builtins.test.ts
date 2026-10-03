import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { blankPlan, levelForIssueType, levelProperty, levelWeight, withBuiltIns } from './builtins.ts';
import { groupConflicts } from './conflicts.ts';
import { mismatches } from './mismatches.ts';
import { LEVEL, SEQUENCE, SIZE, SYSTEM, TIME, type Plan } from './model.ts';
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

describe('blankPlan (Q51)', () => {
  it('has every built-in property and no cards', () => {
    const blank = blankPlan();
    expect(Object.keys(blank.properties).sort()).toEqual([LEVEL, SEQUENCE, SIZE, SYSTEM, TIME].sort());
    expect(blank.items).toEqual({});
    expect(blank.dependencies).toEqual([]);
    expect(withBuiltIns(blank)).toBe(blank);
  });

  it('gives Size and Level their usual values, and System and Time none', () => {
    const blank = blankPlan();
    const labels = (id: string) => {
      const p = blank.properties[id];
      return p?.kind === 'select' ? Object.values(p.values).sort((a, b) => (a.order < b.order ? -1 : 1)).map((v) => v.label) : null;
    };
    expect(labels(SIZE)).toEqual(['XS', 'S', 'M', 'L', 'XL']);
    expect(labels(LEVEL)).toEqual(['Initiative', 'Epic', 'Story']);
    expect(labels(SYSTEM)).toEqual([]);
    expect(labels(TIME)).toEqual([]);
    expect(blank.properties[SYSTEM]).toMatchObject({ levels: ['Area', 'Component'], multi: true });
    expect(blank.properties[TIME]).toMatchObject({ levels: ['Quarter', 'Release'], multi: false });
  });

  it('saves to a plan file and opens again unchanged', () => {
    const blank = blankPlan();
    const opened = readPlanFile(planFileText(blank));
    if (!opened.ok) throw new Error(opened.summary);
    expect(opened.plan).toEqual(blank);
  });

  it('is a fresh plan each time, so editing one never changes the next', () => {
    const first = blankPlan();
    (first.properties[SYSTEM] as { levels: string[] }).levels.push('Subsystem');
    expect(blankPlan().properties[SYSTEM]).toMatchObject({ levels: ['Area', 'Component'] });
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
