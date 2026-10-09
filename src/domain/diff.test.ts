import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { describeChange, titlesFrom, valueLabel } from './describe.ts';
import { changedItems, planDiff } from './diff.ts';
import { SIZE, SYSTEM, TIME, type Plan } from './model.ts';

const base = () =>
  plan(
    item('epic', { title: 'Passwordless login', values: { [TIME]: ['q1'] } }),
    item('story', { title: 'Passkey enrolment', parent: 'epic', values: { [SYSTEM]: ['id/sso'] } }),
    item('sub', { title: 'Recovery codes', parent: 'story' }),
    item('tax', { title: 'Tax engine', values: { [SIZE]: ['s'] } }),
  );

const without = (p: Plan, ...ids: string[]): Plan => ({ ...p, items: Object.fromEntries(Object.entries(p.items).filter(([id]) => !ids.includes(id))) });

describe('the plan diff (ADR 0020)', () => {
  it('finds nothing between a plan and itself', () => {
    expect(planDiff(base(), base())).toEqual([]);
  });

  it('reports each kind of card change as ids and values', () => {
    const before = base();
    const after = base();
    after.items.tax = { ...after.items.tax!, title: 'Tax engine migration', description: 'Move to the new engine', sequence: 'a1', parent: 'epic', values: { [SIZE]: ['m'] } };
    after.items.new = item('new', { title: 'Invoice redesign' });
    expect(planDiff(before, after)).toEqual([
      { kind: 'renamed', item: 'tax', from: 'Tax engine', to: 'Tax engine migration' },
      { kind: 'described', item: 'tax' },
      { kind: 'group', item: 'tax', from: null, to: 'epic' },
      { kind: 'sequence', item: 'tax', from: null, to: 'a1' },
      { kind: 'values', item: 'tax', property: SIZE, from: ['s'], to: ['m'] },
      { kind: 'added', item: 'new', title: 'Invoice redesign' },
    ]);
  });

  it('reports a deleted group once, with the cards that went with it, and their links with them', () => {
    const before = base();
    before.dependencies = [{ from: 'story', to: 'tax' }];
    before.related = [{ a: 'epic', b: 'tax' }];
    // Links to deleted cards drop out of a plan's snapshot, and come back with them.
    const after = { ...without(before, 'epic', 'story', 'sub'), dependencies: [], related: [] };
    expect(planDiff(before, after)).toEqual([{ kind: 'deleted', item: 'epic', title: 'Passwordless login', with: ['story', 'sub'] }]);
    expect(planDiff(after, before, new Set(['epic', 'story', 'sub']))).toEqual([
      { kind: 'restored', item: 'epic', title: 'Passwordless login', with: ['story', 'sub'] },
    ]);
  });

  it('tells a card brought back from a new one, by whether it was seen before', () => {
    const gone = without(base(), 'epic', 'story', 'sub');
    expect(planDiff(gone, base(), new Set(['epic', 'story', 'sub']))).toEqual([
      { kind: 'restored', item: 'epic', title: 'Passwordless login', with: ['story', 'sub'] },
    ]);
    expect(planDiff(gone, base()).map((c) => c.kind)).toEqual(['added', 'added', 'added']);
  });

  it('reports links, dependencies and related, both ways', () => {
    const after = base();
    after.dependencies = [{ from: 'epic', to: 'tax' }];
    after.related = [{ a: 'story', b: 'tax' }];
    const changes = planDiff(base(), after);
    expect(changes).toEqual([
      { kind: 'linked', from: 'epic', to: 'tax' },
      { kind: 'linked', from: 'story', to: 'tax', related: true },
    ]);
    expect(planDiff(after, base()).map((c) => c.kind)).toEqual(['unlinked', 'unlinked']);
    expect(changedItems(changes[0]!)).toEqual(['epic', 'tax']);
  });

  it('reports properties and their values added, renamed, moved and deleted', () => {
    const after = base();
    const system = after.properties[SYSTEM]!;
    if (system.kind !== 'select') throw new Error();
    const values = { ...system.values };
    values['pay/tax'] = { id: 'pay/tax', label: 'Tax', parent: 'pay', order: 'b0' };
    values.pay = { ...values.pay!, label: 'Payments' };
    values['id/mfa'] = { ...values['id/mfa']!, order: 'z0' };
    delete values['pay/ledger'];
    after.properties[SYSTEM] = { ...system, name: 'Components', values };
    after.properties.team = { kind: 'select', id: 'team', name: 'Team', levels: ['Team'], multi: false, values: {} };
    expect(planDiff(base(), after)).toEqual([
      { kind: 'property', property: SYSTEM, op: 'renamed', name: 'Components', was: 'System' },
      { kind: 'value', property: SYSTEM, value: 'id/mfa', op: 'moved', label: 'ID/MFA' },
      { kind: 'value', property: SYSTEM, value: 'pay', op: 'renamed', label: 'Payments', was: 'PAY' },
      { kind: 'value', property: SYSTEM, value: 'pay/ledger', op: 'deleted', label: 'PAY/LEDGER' },
      { kind: 'value', property: SYSTEM, value: 'pay/tax', op: 'added', label: 'Tax' },
      { kind: 'property', property: 'team', op: 'added', name: 'Team' },
    ]);
  });
});

describe('changes in words', () => {
  const p = base();
  const say = (c: Parameters<typeof describeChange>[0]) => describeChange(c, p);

  it('names cards and values as they are now', () => {
    expect(say({ kind: 'values', item: 'tax', property: SIZE, from: ['s'], to: ['m'] })).toBe('set Size on “Tax engine” to M (was S)');
    expect(say({ kind: 'values', item: 'story', property: SYSTEM, from: [], to: ['id/sso', 'pay'] })).toBe('set System on “Passkey enrolment” to ID › ID/SSO, PAY');
    expect(say({ kind: 'values', item: 'tax', property: SIZE, from: ['s'], to: [] })).toBe('cleared Size on “Tax engine” (was S)');
    expect(say({ kind: 'group', item: 'tax', from: null, to: 'epic' })).toBe('put “Tax engine” inside “Passwordless login”');
    expect(say({ kind: 'group', item: 'story', from: 'epic', to: null })).toBe('moved “Passkey enrolment” out of “Passwordless login”');
    expect(say({ kind: 'linked', from: 'epic', to: 'tax' })).toBe('linked “Passwordless login” before “Tax engine”');
    expect(say({ kind: 'unlinked', from: 'epic', to: 'tax', related: true })).toBe('removed the related link between “Passwordless login” and “Tax engine”');
    expect(say({ kind: 'deleted', item: 'epic', title: 'Passwordless login', with: ['story', 'sub'] })).toBe('deleted “Passwordless login”, and 2 cards inside');
    expect(say({ kind: 'value', property: TIME, value: 'q3', op: 'added', label: 'Q3' })).toBe('added “Q3” to Time');
    expect(say({ kind: 'property', property: 'team', op: 'renamed', name: 'Squad', was: 'Team' })).toBe('renamed the property “Team” to “Squad”');
  });

  it('names a card the plan no longer has by the title history last gave it', () => {
    const titles = titlesFrom([{ kind: 'deleted', item: 'gone', title: 'Old idea' }]);
    expect(describeChange({ kind: 'sequence', item: 'gone', from: null, to: 'a0' }, p, (id) => titles.get(id))).toBe('moved “Old idea” in the sequence');
    expect(describeChange({ kind: 'sequence', item: 'gone', from: null, to: 'a0' }, p)).toBe('moved “a deleted card” in the sequence');
  });

  it('labels a value with its parents, and a deleted one as such', () => {
    expect(valueLabel(p, TIME, 'q1/r2')).toBe('Q1 › Q1/R2');
    expect(valueLabel(p, TIME, 'gone')).toBe('a deleted value');
  });
});
