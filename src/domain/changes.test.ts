import { describe, expect, it } from 'vitest';
import { planChanges } from './changes.ts';
import type { Item, Plan } from './model.ts';

const item = (id: string, title = id): Item => ({ id, title, description: '', parent: null, sequence: null, values: {} });
const plan = (items: Item[], extra: Partial<Plan> = {}): Plan => ({
  properties: {},
  items: Object.fromEntries(items.map((i) => [i.id, i])),
  dependencies: [],
  related: [],
  ...extra,
});

describe('changes between two versions of a plan', () => {
  it('counts each card once, however much of it changed', () => {
    const before = plan([item('a'), item('b'), item('c')]);
    const after = plan([{ ...item('a', 'Renamed'), parent: 'b' }, item('b'), item('d')]);
    // a changed, c removed, d added.
    expect(planChanges(before, after)).toEqual({ cards: 3, properties: 0 });
  });

  it('counts the cards at both ends of a link that came or went', () => {
    const before = plan([item('a'), item('b'), item('c')], { related: [{ a: 'b', b: 'c' }] });
    const after = plan([item('a'), item('b'), item('c')], { dependencies: [{ from: 'a', to: 'b' }] });
    expect(planChanges(before, after).cards).toBe(3);
  });

  it('counts nothing when the plan is the same', () => {
    const p = plan([item('a')], { dependencies: [] });
    expect(planChanges(p, structuredClone(p))).toEqual({ cards: 0, properties: 0 });
  });

  it('counts properties apart from cards', () => {
    const before = plan([]);
    const after = plan([], {
      properties: { team: { id: 'team', name: 'Team', kind: 'select', multi: false, levels: ['Team'], values: {}, builtIn: false } as never },
    });
    expect(planChanges(before, after)).toEqual({ cards: 0, properties: 1 });
  });
});
