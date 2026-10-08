import { describe, expect, it } from 'vitest';
import samplePlan from '../seed/sample-plan.json';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { SEQUENCE, SYSTEM, type Plan } from './model.ts';
import { parsePlanJson, planFileText, planToJson, readPlanFile, type PlanJson } from './planJson.ts';

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

  it('reads related links (Q44) once each, in either order, and writes each pair sorted', () => {
    const result = parsePlanJson(
      base({
        items: [
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' },
        ],
        related: [
          ['b', 'a'],
          ['a', 'b'],
        ],
      }),
    );
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.plan.related).toEqual([{ a: 'a', b: 'b' }]);
    expect(planToJson(result.plan).related).toEqual([['a', 'b']]);
    const bad = parsePlanJson(base({ items: [{ id: 'a', title: 'A' }], related: [['a', 'a'], ['a', 'zzz']] }));
    expect(bad.ok ? [] : bad.errors).toEqual(["related[0]: an item can't be related to itself", 'related[1]: unknown item in ["a", "zzz"]']);
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

  it('reads a rank (Q46), and reports one that is not an order key', () => {
    const result = parsePlanJson(base({ items: [{ id: 'a', title: 'A', rank: 'a1' }] }));
    expect(result.ok && result.plan.items['a']!.rank).toBe('a1');
    expect(errorsOf(base({ items: [{ id: 'a', title: 'A', rank: 'not a key!' }] }))).toEqual(['items[0].rank: must be an order key']);
  });

  it('writes a rank only when a card has one, and reads it back', () => {
    const result = parsePlanJson(base({ items: [{ id: 'a', title: 'A', rank: 'a1' }, { id: 'b', title: 'B' }] }));
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const text = planFileText(result.plan);
    expect(text).toContain('"rank": "a1"');
    const again = parsePlanJson(JSON.parse(text));
    expect(again.ok && again.plan.items['a']!.rank).toBe('a1');
    expect(again.ok && again.plan.items['b']!.rank).toBeUndefined();
  });

  it('rejects order keys outside the base-62 digit set', () => {
    for (const key of ['a0 ', 'a0~', 'a0-']) {
      expect(errorsOf(base({ items: [{ id: 'a', title: 'A', sequence: key }] }))).toEqual([
        `items[0].sequence: "${key}" is not a valid order key`,
      ]);
    }
  });

  it('accepts a repeated identical value on a single-valued property', () => {
    const result = parsePlanJson(base({ items: [{ id: 'a', title: 'A', values: { size: ['m', 'm'] } }] }));
    expect(result.ok && result.plan.items['a']!.values).toEqual({ size: ['m'] });
  });

  it('reports wrongly typed fields instead of dropping them', () => {
    const json = base({ items: [{ id: 'a', title: 'A' }] }) as unknown as Record<string, unknown[]>;
    json.items = [{ id: 'a', title: 'A', parent: 42, description: 7 }];
    json.properties![0] = { ...(json.properties![0] as object), multi: 'true' };
    expect(errorsOf(json)).toEqual([
      'properties[0].multi: must be true or false',
      'items[0].description: must be a string',
      'items[0].parent: must be an item id or null',
    ]);
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

describe('planToJson', () => {
  const sample = () => {
    const result = parsePlanJson(samplePlan);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    return result.plan;
  };

  it('is the exact inverse of parsePlanJson on the sample plan', () => {
    const plan = sample();
    const again = parsePlanJson(JSON.parse(planFileText(plan)));
    if (!again.ok) throw new Error(again.errors.join('\n'));
    // Dependencies and related links are sets; the file lists them sorted.
    const sorted = (deps: Plan['dependencies']) => [...deps].sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
    const sortedRelated = (links: Plan['related']) => [...links].sort((a, b) => (a.a + a.b < b.a + b.b ? -1 : 1));
    expect(plan.related.length).toBeGreaterThan(0);
    expect({ ...again.plan, dependencies: sorted(again.plan.dependencies), related: sortedRelated(again.plan.related) }).toEqual({
      ...plan,
      dependencies: sorted(plan.dependencies),
      related: sortedRelated(plan.related),
    });
    expect(planFileText(again.plan)).toBe(planFileText(plan));
  });

  it('keeps descriptions, Jira keys, parents, sequence keys and dependencies', () => {
    const p = plan(
      item('epic', { title: 'Epic', description: 'Why', externalKey: 'PAY-1', sequence: 'a0', values: { system: ['id', 'pay'] } }),
      item('story', { parent: 'epic', externalKey: 'PAY-2', values: { size: ['m'], time: ['q1/r1'] } }),
    );
    p.dependencies = [{ from: 'story', to: 'epic' }];
    const json = planToJson(p);
    expect(json.items).toEqual([
      { id: 'epic', title: 'Epic', description: 'Why', externalKey: 'PAY-1', sequence: 'a0', values: { system: ['id', 'pay'] } },
      { id: 'story', title: 'story', externalKey: 'PAY-2', parent: 'epic', values: { size: 'm', time: 'q1/r1' } },
    ]);
    expect(json.dependencies).toEqual([['story', 'epic']]);
    const back = parsePlanJson(json);
    if (!back.ok) throw new Error(back.errors.join('\n'));
    expect(back.plan.items).toEqual(p.items);
    expect(back.plan.dependencies).toEqual(p.dependencies);
  });

  it('writes values in display order, whatever order they were stored in', () => {
    const system = planToJson(plan()).properties.find((x) => x.id === SYSTEM)!;
    expect(system.values).toEqual([
      { id: 'id', label: 'ID', children: [{ id: 'id/mfa', label: 'ID/MFA' }, { id: 'id/sso', label: 'ID/SSO' }] },
      { id: 'pay', label: 'PAY', children: [{ id: 'pay/ledger', label: 'PAY/LEDGER' }] },
    ]);
    expect(system.multi).toBe(true);
  });

  it('leaves out what a file could not hold, instead of writing an invalid file', () => {
    const p = plan(
      item('a', { parent: 'gone', values: { system: ['id', 'deleted'], size: [], nope: ['x'] } }),
      item('b', { parent: 'a' }),
    );
    const json = planToJson(p);
    expect(json.items).toEqual([
      { id: 'a', title: 'a', values: { system: ['id'] } },
      { id: 'b', title: 'b', parent: 'a' },
    ]);
    expect(parsePlanJson(json).ok).toBe(true);
  });

  it('lists children right after their group', () => {
    const p = plan(item('z-top'), item('child', { parent: 'a-group' }), item('a-group'));
    expect(planToJson(p).items.map((i) => i.id)).toEqual(['a-group', 'child', 'z-top']);
  });
});

describe('readPlanFile', () => {
  it('opens a valid file', () => {
    expect(readPlanFile(JSON.stringify(base())).ok).toBe(true);
  });

  it("keeps the plan's name, which older readers ignore (ADR 0021)", () => {
    const plan = readPlanFile(JSON.stringify(base()));
    if (!plan.ok) throw new Error('should open');
    expect(plan.name).toBeUndefined();
    const text = planFileText(plan.plan, 'Q3 roadmap');
    expect(Object.keys(JSON.parse(text) as object).slice(0, 3)).toEqual(['format', 'version', 'name']);
    const named = readPlanFile(text);
    expect(named.ok && named.name).toBe('Q3 roadmap');
    expect(parsePlanJson(JSON.parse(text)).ok).toBe(true);
    expect(planFileText(plan.plan)).not.toContain('"name": "Q3');
  });

  it('explains text that is not JSON, or not a plan', () => {
    const notJson = readPlanFile('{ nope');
    expect(!notJson.ok && notJson.summary).toBe("This isn't a plan file: its text isn't valid JSON.");
    const other = readPlanFile('{"name": "package"}');
    expect(!other.ok && other.summary).toBe("This isn't a Planning Board plan file.");
    expect(!other.ok && other.details).toEqual([]);
  });

  it('says when a file is from a newer version', () => {
    const newer = readPlanFile(JSON.stringify({ ...base(), version: 2 }));
    expect(!newer.ok && newer.summary).toMatch(/newer version of Planning Board \(file version 2\)/);
  });

  it('counts the problems in a broken plan and lists every one', () => {
    const broken = readPlanFile(JSON.stringify(base({ items: [{ id: 'a', title: 'A', parent: 'ghost', externalKey: 7 } as never] })));
    expect(!broken.ok && broken.summary).toBe('This plan file has 2 problems, so it wasn\'t opened.');
    expect(!broken.ok && broken.details).toEqual(['items[0].externalKey: must be a string', 'item "a": unknown parent "ghost"']);
  });
});
