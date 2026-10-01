import { describe, expect, it } from 'vitest';
import { item, plan, size, system } from './__fixtures__/tiny-plan.ts';
import { ownLinks, planValueEdit, selectionValues } from './inspector.ts';
import { SIZE, SYSTEM } from './model.ts';

describe('selectionValues', () => {
  it('gives the values every selected card shares, in tree order', () => {
    const p = plan(
      item('a', { values: { [SYSTEM]: ['pay/ledger', 'id/sso'] } }),
      item('b', { values: { [SYSTEM]: ['id/sso', 'pay/ledger'] } }),
    );
    expect(selectionValues(p, ['a', 'b'], system)).toEqual({ mixed: false, values: ['id/sso', 'pay/ledger'] });
  });

  it('says how many cards hold each value when they differ', () => {
    const p = plan(item('a', { values: { [SIZE]: ['s'] } }), item('b', { values: { [SIZE]: ['m'] } }), item('c'));
    expect(selectionValues(p, ['a', 'b', 'c'], size)).toEqual({
      mixed: true,
      counts: [
        { value: 's', count: 1 },
        { value: 'm', count: 1 },
      ],
    });
  });

  it('treats no value on every card as shared, and ignores unknown values', () => {
    const p = plan(item('a', { values: { [SIZE]: ['gone'] } }), item('b'));
    expect(selectionValues(p, ['a', 'b'], size)).toEqual({ mixed: false, values: [] });
  });
});

describe('planValueEdit', () => {
  it('sets a single value on every card that differs', () => {
    const p = plan(item('a', { values: { [SIZE]: ['s'] } }), item('b', { values: { [SIZE]: ['m'] } }));
    expect(planValueEdit(p, ['a', 'b'], SIZE, { kind: 'set', values: ['m'] })).toEqual([{ item: 'a', values: ['m'] }]);
    expect(planValueEdit(p, ['a', 'b'], SIZE, { kind: 'set', values: [] })).toEqual([
      { item: 'a', values: [] },
      { item: 'b', values: [] },
    ]);
  });

  it('adds a value, replacing its ancestor, and never duplicates', () => {
    const p = plan(item('a', { values: { [SYSTEM]: ['id'] } }), item('b', { values: { [SYSTEM]: ['id/sso'] } }));
    expect(planValueEdit(p, ['a', 'b'], SYSTEM, { kind: 'add', value: 'id/sso' })).toEqual([
      { item: 'a', values: ['id/sso'] },
    ]);
    // An ancestor of a value the card already has adds nothing.
    expect(planValueEdit(p, ['b'], SYSTEM, { kind: 'add', value: 'id' })).toEqual([]);
    expect(planValueEdit(p, ['a'], SYSTEM, { kind: 'add', value: 'pay' })).toEqual([{ item: 'a', values: ['id', 'pay'] }]);
  });

  it('removes a value only from the cards that have it', () => {
    const p = plan(item('a', { values: { [SYSTEM]: ['id/sso', 'pay'] } }), item('b', { values: { [SYSTEM]: ['pay'] } }));
    expect(planValueEdit(p, ['a', 'b'], SYSTEM, { kind: 'remove', value: 'id/sso' })).toEqual([
      { item: 'a', values: ['pay'] },
    ]);
  });

  it('ignores unknown values, cards and properties', () => {
    const p = plan(item('a'));
    expect(planValueEdit(p, ['a', 'nope'], SIZE, { kind: 'add', value: 'xxl' })).toEqual([]);
    expect(planValueEdit(p, ['a'], 'nope', { kind: 'set', values: ['s'] })).toEqual([]);
  });
});

describe('ownLinks', () => {
  it("lists a card's prerequisites and dependents, by title", () => {
    const p = {
      ...plan(item('a', { title: 'A' }), item('b', { title: 'B' }), item('c', { title: 'C' }), item('kid', { parent: 'a' })),
      dependencies: [
        { from: 'c', to: 'a' },
        { from: 'b', to: 'a' },
        { from: 'a', to: 'c' },
        { from: 'kid', to: 'b' },
      ],
    };
    expect(ownLinks(p, 'a')).toEqual({
      after: [
        { from: 'b', to: 'a' },
        { from: 'c', to: 'a' },
      ],
      before: [{ from: 'a', to: 'c' }],
    });
  });
});
