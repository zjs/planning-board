import { describe, expect, it } from 'vitest';
import { SEQUENCE, SYSTEM } from './model.ts';
import { parsePlanJson, type PlanJson } from './planJson.ts';

function base(patch: Partial<PlanJson> = {}): PlanJson {
  return {
    format: 'planning-board',
    version: 1,
    properties: [
      {
        id: SYSTEM,
        name: 'System',
        levels: ['Area', 'Component'],
        multi: true,
        values: [
          { id: 'id', label: 'Identity', children: [{ id: 'id/sso', label: 'SSO' }, { id: 'id/mfa', label: 'MFA' }] },
          { id: 'pay', label: 'Payments' },
        ],
      },
      { id: 'size', name: 'Size', levels: ['Size'], values: [{ id: 's', label: 'S' }, { id: 'm', label: 'M' }] },
    ],
    items: [],
    ...patch,
  };
}

function errorsOf(json: unknown): string[] {
  const result = parsePlanJson(json);
  return result.ok ? [] : result.errors;
}

describe('parsePlanJson', () => {
  it('builds value hierarchies with sibling order from array order', () => {
    const result = parsePlanJson(base());
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const system = result.plan.properties[SYSTEM];
    if (system?.kind !== 'select') throw new Error('system missing');
    expect(system.values['id/sso']!.parent).toBe('id');
    expect(system.values['id/sso']!.order < system.values['id/mfa']!.order).toBe(true);
    expect(system.values['id']!.order < system.values['pay']!.order).toBe(true);
    expect(result.plan.properties[SEQUENCE]?.kind).toBe('sequence');
  });

  it('reads items, accepting a single value or an array', () => {
    const result = parsePlanJson(
      base({
        items: [
          { id: 'a', title: 'A', values: { system: ['id/sso', 'pay', 'pay'], size: 'm' } },
          { id: 'b', title: 'B', parent: 'a' },
        ],
        dependencies: [['a', 'b']],
      }),
    );
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.plan.items['a']!.values).toEqual({ system: ['id/sso', 'pay'], size: ['m'] });
    expect(result.plan.items['b']!.parent).toBe('a');
    expect(result.plan.dependencies).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('turns numeric sequences into ordered keys, sharing a key for equal numbers', () => {
    const result = parsePlanJson(
      base({
        items: [
          { id: 'late', title: 'L', sequence: 10 },
          { id: 'early', title: 'E', sequence: 2 },
          { id: 'early2', title: 'E2', sequence: 2 },
          { id: 'none', title: 'N' },
        ],
      }),
    );
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const seq = (id: string) => result.plan.items[id]!.sequence;
    expect(seq('early')).toBe(seq('early2'));
    expect(seq('early')! < seq('late')!).toBe(true);
    expect(seq('none')).toBeNull();
  });

  it('keeps string order keys as they are', () => {
    const result = parsePlanJson(base({ items: [{ id: 'a', title: 'A', sequence: 'a0V' }] }));
    expect(result.ok && result.plan.items['a']!.sequence).toBe('a0V');
  });

  it('rejects unknown versions outright', () => {
    expect(errorsOf({ ...base(), version: 2 })).toEqual(['unsupported version 2; expected 1']);
  });

  it('reports every problem in one pass', () => {
    const errors = errorsOf(
      base({
        items: [
          { id: 'a', title: 'A', values: { system: ['nope'], size: ['s', 'm'], color: 'red' } },
          { id: 'a', title: 'dup' },
          { id: 'b', title: 'B', parent: 'ghost', sequence: '!!' },
          { id: 'c', title: 'C', parent: 'd' },
          { id: 'd', title: 'D', parent: 'c' },
        ],
        dependencies: [
          ['a', 'zzz'],
          ['a', 'a'],
        ],
      }),
    );
    expect(errors).toEqual([
      'items[0].values.system: unknown value "nope"',
      'items[0].values.size: property holds one value',
      'items[0].values: unknown property "color"',
      'items[1]: duplicate item id "a"',
      'items[2].sequence: "!!" is not a valid order key',
      'item "b": unknown parent "ghost"',
      'item "c": parent chain loops back to itself',
      'item "d": parent chain loops back to itself',
      'dependencies[0]: unknown item in ["a", "zzz"]',
      "dependencies[1]: an item can't depend on itself",
    ]);
  });

  it('rejects mixing numeric and key sequences', () => {
    expect(
      errorsOf(
        base({
          items: [
            { id: 'a', title: 'A', sequence: 1 },
            { id: 'b', title: 'B', sequence: 'a0' },
          ],
        }),
      ),
    ).toEqual(['sequence: use either numbers or order keys throughout, not both']);
  });

  it('rejects values nested deeper than the declared levels, and redefining sequence', () => {
    const errors = errorsOf({
      ...base(),
      properties: [
        { id: 'size', name: 'Size', levels: ['Size'], values: [{ id: 's', label: 'S', children: [{ id: 'x', label: 'X' }] }] },
        { id: 'sequence', name: 'Seq', levels: ['x'], values: [] },
      ],
    });
    expect(errors).toEqual([
      'properties[0].values[0].children[0]: deeper than the 1 declared levels',
      'properties[1]: "sequence" is built in and can\'t be redefined',
    ]);
  });
});
