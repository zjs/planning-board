import { describe, expect, it } from 'vitest';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { SYSTEM, TIME, type Plan } from '../domain/model.ts';
import {
  axisNames,
  axisOptions,
  canZoomLane,
  chooseAxis,
  swapAxes,
  toViewSpec,
  validChoice,
  zoomLane,
} from './axes.ts';

const p = plan(item('a'));

function withTeam(base: Plan): Plan {
  return {
    ...base,
    properties: {
      ...base.properties,
      pteam: { kind: 'select', id: 'pteam', name: 'Team', levels: ['Team'], multi: false, values: {} },
      pokr: { kind: 'select', id: 'pokr', name: 'OKR', levels: ['OKR'], multi: true, values: {} },
    },
  };
}

describe('axisOptions', () => {
  it('offers every level of every property: built-ins first, then custom properties by name', () => {
    expect(axisOptions(withTeam(p)).map((o) => [o.id, o.label, o.none])).toEqual([
      ['sequence', 'Sequence', 'No position'],
      ['system', 'System (area)', 'No area'],
      ['system:1', 'System (component)', 'No component'],
      ['size', 'Size', 'No size'],
      ['time', 'Time (quarter)', 'No quarter'],
      ['time:1', 'Time (release)', 'No release'],
      ['pokr', 'OKR', 'No OKR'],
      ['pteam', 'Team', 'No team'],
    ]);
  });
});

describe('chooseAxis', () => {
  it('sets the chosen axis', () => {
    expect(chooseAxis(p, { x: 'sequence', y: 'system' }, 'x', 'time')).toMatchObject({ x: 'time', y: 'system' });
  });

  it("swaps when picking the other axis's property, at any level", () => {
    expect(chooseAxis(p, { x: 'sequence', y: 'system' }, 'x', 'system')).toMatchObject({ x: 'system', y: 'sequence' });
    expect(chooseAxis(p, { x: 'sequence', y: 'system' }, 'y', 'sequence')).toMatchObject({ x: 'system', y: 'sequence' });
    expect(chooseAxis(p, { x: 'time', y: 'system' }, 'x', 'system:1')).toMatchObject({ x: 'system:1', y: 'time' });
  });

  it('clears the lane zoom of an axis that changes', () => {
    const zoomed = { x: 'time', y: 'system', yWithin: 'id' };
    expect(chooseAxis(p, zoomed, 'y', 'size')).toEqual({ x: 'time', y: 'size', yWithin: null });
    expect(chooseAxis(p, zoomed, 'x', 'size')).toMatchObject({ x: 'size', yWithin: 'id' });
  });
});

describe('lane zoom', () => {
  it('shows a zoomed axis one level down, within the value', () => {
    const choice = zoomLane({ x: 'time', y: 'system' }, 'y', 'id');
    expect(toViewSpec(p, choice).y).toEqual({ property: SYSTEM, level: 1, within: 'id' });
    expect(axisNames(p, choice, 'y')).toEqual({ label: 'System (component)', none: 'No component' });
    expect(swapAxes(choice)).toEqual({ x: 'system', y: 'time', xWithin: 'id', yWithin: null });
  });

  it('only zooms lanes that have something below them, one level per axis', () => {
    expect(canZoomLane(p, { x: 'time', y: 'system' }, 'y', 'id')).toBe(true);
    expect(canZoomLane(p, { x: 'time', y: 'system:1' }, 'y', 'id/sso')).toBe(false);
    expect(canZoomLane(p, { x: 'time', y: 'size' }, 'y', 'm')).toBe(false);
    expect(canZoomLane(p, { x: 'time', y: 'system', yWithin: 'id' }, 'y', 'pay')).toBe(false);
  });

  it('drops a zoom whose value no longer exists', () => {
    const choice = { x: 'time', y: 'system', yWithin: 'gone' };
    expect(validChoice(p, choice)).toEqual({ x: 'time', y: 'system', xWithin: null, yWithin: null });
    const ok = { x: 'time', y: 'system', xWithin: null, yWithin: 'id' };
    expect(validChoice(p, ok)).toBe(ok);
  });
});

describe('validChoice', () => {
  it('shows a custom property as an axis', () => {
    const choice = { x: 'pteam', y: 'time:1' };
    expect(validChoice(withTeam(p), choice)).toBe(choice);
    expect(toViewSpec(withTeam(p), choice)).toEqual({ x: { property: 'pteam', level: 0 }, y: { property: TIME, level: 1 } });
  });

  it('falls back when a property or level is gone, and drops that axis’s lane zoom', () => {
    expect(validChoice(p, { x: 'pteam', y: 'system', yWithin: 'id' })).toEqual({
      x: 'sequence',
      y: 'system',
      xWithin: null,
      yWithin: 'id',
    });
    expect(validChoice(p, { x: 'system', y: 'pteam' })).toMatchObject({ x: 'system', y: 'sequence' });
    expect(validChoice(p, { x: 'size:3', y: 'gone' })).toMatchObject({ x: 'sequence', y: 'system' });
  });

  it('never shows one property on both axes', () => {
    expect(validChoice(p, { x: 'system', y: 'system:1' })).toMatchObject({ x: 'system', y: 'sequence' });
  });
});
