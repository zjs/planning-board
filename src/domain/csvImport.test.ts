import { describe, expect, it } from 'vitest';
import { JIRA_EXPORT } from './__fixtures__/jira-export.ts';
import { parseCsv } from './csv.ts';
import {
  cleanHeader,
  columnGroups,
  defaultChoices,
  detectMapping,
  draftFromCsv,
  planFromDraft,
  quarterChoices,
  sizeForPoints,
  type Mapping,
} from './csvImport.ts';
import { SIZE, SYSTEM, TIME, type SelectProperty } from './model.ts';
import { parsePlanJson, planToJson } from './planJson.ts';

const table = parseCsv(JIRA_EXPORT);
const groups = columnGroups(table.header);

function counter() {
  let n = 0;
  return (prefix: string) => `${prefix}${++n}`;
}

describe('mapping', () => {
  it('groups repeated headers', () => {
    expect(groups.find((g) => g.name === 'Component/s')).toEqual({ name: 'Component/s', columns: [7, 8] });
  });

  it('recognizes Jira’s usual headers, and leaves Status, Priority, and Issue Type out (Q29)', () => {
    expect(detectMapping(groups)).toEqual({
      Summary: { kind: 'title' },
      'Issue key': { kind: 'key' },
      'Issue id': { kind: 'id' },
      'Issue Type': { kind: 'ignore' },
      Status: { kind: 'ignore' },
      'Project name': { kind: 'project' },
      Priority: { kind: 'ignore' },
      'Component/s': { kind: 'components' },
      'Fix Version/s': { kind: 'versions' },
      Labels: { kind: 'property', multi: true },
      'Custom field (Story Points)': { kind: 'points' },
      Parent: { kind: 'parent' },
      'Custom field (Team)': { kind: 'property', multi: false },
      Description: { kind: 'description' },
      'Outward issue link (Blocks)': { kind: 'blocks' },
      'Inward issue link (Blocks)': { kind: 'blockedBy' },
    });
  });

  it('recognizes team-managed and older header spellings', () => {
    const other = detectMapping(columnGroups(['Summary', 'Key', 'Fix versions', 'Story point estimate', 'Custom field (Epic Link)', 'Components']));
    expect(Object.values(other).map((m) => m.kind)).toEqual(['title', 'key', 'versions', 'points', 'parent', 'components']);
  });

  it('maps a field only once, except parents and custom properties', () => {
    const twice = detectMapping(columnGroups(['Summary', 'Summary ', 'Parent', 'Epic Link']));
    expect(Object.values(twice).map((m) => m.kind)).toEqual(['title', 'ignore', 'parent', 'parent']);
  });

  it('cleans "Custom field (…)" headers', () => {
    expect(cleanHeader('Custom field (Story Points)')).toBe('Story Points');
    expect(cleanHeader('Labels')).toBe('Labels');
  });
});

describe('draftFromCsv', () => {
  const draft = draftFromCsv(table, detectMapping(groups));

  it('reads one draft card per titled row, skipping rows with no title', () => {
    expect(draft.items.map((i) => i.key)).toEqual(['PAY-1', 'PAY-2', 'PAY-3', 'PAY-4', 'PAY-6']);
    expect(draft.skipped).toEqual([{ row: 6, reason: 'no title' }]);
  });

  it('collects repeated columns, and keeps multi-line descriptions', () => {
    const story = draft.items[2]!;
    expect(story.components).toEqual(['SSO', 'Admin Console']);
    expect(draft.items[1]!.properties['Labels']).toEqual(['identity', 'enterprise']);
    expect(draft.items[1]!.description).toBe('Upload a metadata XML file.\nValidate it first.');
    expect(story.parents).toEqual(['10001']);
    expect(story.blockedBy).toEqual(['PAY-2']);
  });

  it('names custom properties after their columns', () => {
    expect(draft.properties).toEqual([
      { column: 'Labels', name: 'Labels', multi: true },
      { column: 'Custom field (Team)', name: 'Team', multi: false },
    ]);
  });

  it('never gives a custom property a built-in’s name', () => {
    const mapping: Mapping = { Summary: { kind: 'title' }, System: { kind: 'property' }, 'Custom field (System)': { kind: 'property' } };
    const d = draftFromCsv(parseCsv('Summary,System,Custom field (System)\nA,x,y'), mapping);
    expect(d.properties.map((p) => p.name)).toEqual(['System (Jira)', 'System 2']);
  });
});

describe('value table', () => {
  it('buckets story points (Q28)', () => {
    expect(['0', '1', '2', '3', '5', '8', '13', '21', '0.5', '2,5', 'lots', ''].map(sizeForPoints)).toEqual([
      'xs', 'xs', 's', 's', 'm', 'l', 'xl', 'xl', 'xs', 's', null, null,
    ]);
  });

  it('lists quarters from this one on', () => {
    expect(quarterChoices(new Date(2026, 8, 30), 3)).toEqual(['Q3 2026', 'Q4 2026', 'Q1 2027']);
  });

  it('starts components in an area named after their project, and versions undated (Q27)', () => {
    const choices = defaultChoices(draftFromCsv(table, detectMapping(groups)));
    expect(choices).toEqual({
      areas: { SSO: 'Payments', 'Admin Console': 'Payments', Invoicing: 'Payments' },
      quarters: { '2027.1': null, '2027.2': null },
      sizes: { '1': 'xs', '3': 's', '5': 'm', '8': 'l', '13': 'xl' },
    });
  });
});

describe('planFromDraft', () => {
  const draft = draftFromCsv(table, detectMapping(groups));
  const choices = {
    ...defaultChoices(draft),
    areas: { SSO: 'Identity', 'Admin Console': 'Customer Experience', Invoicing: 'Billing' },
    quarters: { '2027.1': 'Q1 2027', '2027.2': null },
  };
  const result = planFromDraft(draft, choices, counter(), ['Q4 2026', 'Q1 2027', 'Q2 2027']);
  const { plan } = result;
  const byKey = (key: string) => Object.values(plan.items).find((i) => i.externalKey === key)!;
  const label = (property: string, id: string) => (plan.properties[property] as SelectProperty).values[id]!.label;

  it('makes cards with their Jira keys, titles, and descriptions', () => {
    expect(result.counts).toEqual({ cards: 5, groups: 1, dependencies: 1 });
    expect(byKey('PAY-2')).toMatchObject({ title: 'SAML metadata upload', description: 'Upload a metadata XML file.\nValidate it first.' });
  });

  it('puts components in the chosen areas, and versions in the chosen quarters as releases', () => {
    const system = plan.properties[SYSTEM] as SelectProperty;
    const areas = Object.values(system.values).filter((v) => v.parent === null).map((v) => v.label);
    expect(areas).toEqual(['Identity', 'Customer Experience', 'Billing']);
    expect(byKey('PAY-3').values[SYSTEM]!.map((v) => label(SYSTEM, v))).toEqual(['SSO', 'Admin Console']);
    const release = byKey('PAY-2').values[TIME]![0]!;
    expect(label(TIME, release)).toBe('2027.1');
    expect(label(TIME, (plan.properties[TIME] as SelectProperty).values[release]!.parent!)).toBe('Q1 2027');
    // 2027.2 wasn't given a quarter, so PAY-3 has no date.
    expect(byKey('PAY-3').values[TIME]).toBeUndefined();
  });

  it('turns story points into sizes', () => {
    expect(byKey('PAY-1').values[SIZE]).toEqual(['xl']);
    expect(byKey('PAY-6').values[SIZE]).toEqual(['xs']);
  });

  it('makes custom properties from the chosen columns', () => {
    const team = Object.values(plan.properties).find((p) => p.name === 'Team') as SelectProperty;
    expect(Object.values(team.values).map((v) => v.label)).toEqual(['Platform', 'Growth']);
    expect(team.multi).toBe(false);
    expect(byKey('PAY-3').values[team.id]!.map((v) => team.values[v]!.label)).toEqual(['Growth']);
  });

  it('makes groups from parent links, by issue ID or key', () => {
    const epic = byKey('PAY-1');
    expect(byKey('PAY-2').parent).toBe(epic.id);
    expect(byKey('PAY-3').parent).toBe(epic.id);
    // PAY-99 isn't in the file.
    expect(byKey('PAY-6').parent).toBeNull();
  });

  it('makes a dependency from each Blocks link, once, and skips links out of the file', () => {
    expect(plan.dependencies).toEqual([{ from: byKey('PAY-2').id, to: byKey('PAY-3').id }]);
  });

  it('says what it left out', () => {
    expect(result.notes).toEqual([
      'One version wasn’t given a quarter, so its cards have no date: 2027.2.',
      'One parent isn’t in the file, so its cards are at the top level: PAY-99.',
      'One “Blocks” link points to an issue that isn’t in the file, so it was left out.',
      '1 row has no title and was skipped (row 6).',
    ]);
  });

  it('gives a plan that a plan file can hold', () => {
    const back = parsePlanJson(planToJson(plan));
    expect(back.ok).toBe(true);
  });
});

describe('planFromDraft, awkward files', () => {
  it('breaks a parent loop, and says so', () => {
    const csv = 'Summary,Issue key,Parent\nA,X-1,X-2\nB,X-2,X-1';
    const t = parseCsv(csv);
    const d = draftFromCsv(t, detectMapping(columnGroups(t.header)));
    const r = planFromDraft(d, defaultChoices(d), counter());
    expect(Object.values(r.plan.items).filter((i) => i.parent !== null)).toHaveLength(1);
    expect(r.notes).toContain('One parent link would have made a loop, so it was left out.');
  });

  it('keeps the first of two rows with the same key', () => {
    const t = parseCsv('Summary,Issue key,Parent\nA,X-1,\nA again,X-1,\nB,X-2,X-1');
    const d = draftFromCsv(t, detectMapping(columnGroups(t.header)));
    const r = planFromDraft(d, defaultChoices(d), counter());
    const first = Object.values(r.plan.items).find((i) => i.title === 'A')!;
    expect(Object.values(r.plan.items).find((i) => i.title === 'B')!.parent).toBe(first.id);
    expect(r.notes).toContain('One row repeats a key another row already has; links to it go to the first one.');
  });

  it('imports a file with only titles', () => {
    const t = parseCsv('Summary\nOne\nTwo');
    const d = draftFromCsv(t, detectMapping(columnGroups(t.header)));
    const r = planFromDraft(d, defaultChoices(d), counter());
    expect(r.counts).toEqual({ cards: 2, groups: 0, dependencies: 0 });
    expect(r.notes).toEqual([]);
  });
});
