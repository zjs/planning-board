import { describe, expect, it } from 'vitest';
import { valuesAtLevel } from '../domain/hierarchy.ts';
import { SEQUENCE, SIZE, SYSTEM, TIME, type Plan } from '../domain/model.ts';
import { parsePlanJson } from '../domain/planJson.ts';
import { childCounts } from '../domain/tree.ts';
import { layoutView } from '../domain/view.ts';
import sample from './sample-plan.json';

function load(): Plan {
  const result = parsePlanJson(sample);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.plan;
}

// Guards the shape sprint 0 asks for, so regenerating can't quietly drift.
describe('sample plan', () => {
  const plan = load();
  const items = Object.values(plan.items);
  const share = (pred: (i: (typeof items)[number]) => boolean) => items.filter(pred).length / items.length;

  it('has about 150 items across 3–4 areas and about 15 components', () => {
    expect(items.length).toBeGreaterThanOrEqual(140);
    expect(items.length).toBeLessThanOrEqual(160);
    const system = plan.properties[SYSTEM];
    if (system?.kind !== 'select') throw new Error('no system');
    expect(valuesAtLevel(system, 0).length).toBeGreaterThanOrEqual(3);
    expect(valuesAtLevel(system, 0).length).toBeLessThanOrEqual(4);
    expect(valuesAtLevel(system, 1).length).toBe(15);
  });

  it('is deliberately sparse: sizes and quarters on about half the items, some untagged', () => {
    expect(share((i) => (i.values[SIZE]?.length ?? 0) > 0)).toBeCloseTo(0.5, 1);
    expect(share((i) => (i.values[TIME]?.length ?? 0) > 0)).toBeCloseTo(0.5, 1);
    expect(share((i) => (i.values[SYSTEM]?.length ?? 0) === 0)).toBeGreaterThan(0.05);
    expect(items.filter((i) => (i.values[SYSTEM]?.length ?? 0) > 1).length).toBeGreaterThanOrEqual(10);
  });

  it('has groups nested 2–3 deep and cross-area dependency chains', () => {
    const depth = (id: string): number => {
      const parent = plan.items[id]!.parent;
      return parent === null ? 0 : 1 + depth(parent);
    };
    expect(Math.max(...items.map((i) => depth(i.id)))).toBe(2);
    expect(childCounts(plan).size).toBeGreaterThanOrEqual(4);
    const area = (id: string) => plan.items[id]!.values[SYSTEM]?.[0]?.split('/')[0];
    const crossArea = plan.dependencies.filter((d) => area(d.from) && area(d.to) && area(d.from) !== area(d.to));
    expect(crossArea.length).toBeGreaterThanOrEqual(5);
  });

  it('fills both exit-criteria views with cards and a holding area', () => {
    for (const x of [SEQUENCE, TIME]) {
      const layout = layoutView(plan, { x: { property: x, level: 0 }, y: { property: SYSTEM, level: 0 } });
      const placed = layout.cells.flat(2).length;
      expect(placed).toBeGreaterThan(30);
      expect(layout.holding.length).toBeGreaterThan(5);
    }
  });
});
