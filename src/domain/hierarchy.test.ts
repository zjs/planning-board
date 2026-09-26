import { describe, expect, it } from 'vitest';
import { system, time } from './__fixtures__/tiny-plan.ts';
import { ancestorAtLevel, depthOf, pathTo, valuesAtLevel } from './hierarchy.ts';

describe('hierarchy', () => {
  it('walks a value up to the top level', () => {
    expect(pathTo(system, 'id/sso').map((n) => n.id)).toEqual(['id', 'id/sso']);
    expect(depthOf(system, 'id/sso')).toBe(1);
    expect(depthOf(system, 'id')).toBe(0);
    expect(depthOf(system, 'nope')).toBe(-1);
  });

  it('finds the ancestor at a level, or null when the value is shallower or unknown', () => {
    expect(ancestorAtLevel(system, 'pay/ledger', 0)).toBe('pay');
    expect(ancestorAtLevel(system, 'pay/ledger', 1)).toBe('pay/ledger');
    expect(ancestorAtLevel(time, 'q2', 1)).toBeNull();
    expect(ancestorAtLevel(system, 'nope', 0)).toBeNull();
  });

  it('lists values at a level in tree order', () => {
    expect(valuesAtLevel(system, 0).map((n) => n.id)).toEqual(['id', 'pay']);
    expect(valuesAtLevel(system, 1).map((n) => n.id)).toEqual(['id/mfa', 'id/sso', 'pay/ledger']);
    expect(valuesAtLevel(system, 2)).toEqual([]);
  });

  it('survives a cycle in the value tree', () => {
    const looped = {
      ...system,
      values: {
        a: { id: 'a', label: 'A', parent: 'b', order: 'a' },
        b: { id: 'b', label: 'B', parent: 'a', order: 'a' },
      },
    };
    expect(pathTo(looped, 'a').map((n) => n.id)).toEqual(['b', 'a']);
  });
});
