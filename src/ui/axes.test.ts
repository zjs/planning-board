import { describe, expect, it } from 'vitest';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { SYSTEM } from '../domain/model.ts';
import { axisNames, canZoomLane, chooseAxis, swapAxes, toViewSpec, validChoice, zoomLane } from './axes.ts';

describe('chooseAxis', () => {
  it('sets the chosen axis', () => {
    expect(chooseAxis({ x: 'sequence', y: 'system' }, 'x', 'time')).toMatchObject({ x: 'time', y: 'system' });
  });

  it("swaps when picking the other axis's property, at any level", () => {
    expect(chooseAxis({ x: 'sequence', y: 'system' }, 'x', 'system')).toMatchObject({ x: 'system', y: 'sequence' });
    expect(chooseAxis({ x: 'sequence', y: 'system' }, 'y', 'sequence')).toMatchObject({ x: 'system', y: 'sequence' });
    expect(chooseAxis({ x: 'time', y: 'system' }, 'x', 'component')).toMatchObject({ x: 'component', y: 'time' });
  });

  it('clears the lane zoom of an axis that changes', () => {
    const zoomed = { x: 'time', y: 'system', yWithin: 'id' };
    expect(chooseAxis(zoomed, 'y', 'size')).toEqual({ x: 'time', y: 'size', yWithin: null });
    expect(chooseAxis(zoomed, 'x', 'size')).toMatchObject({ x: 'size', yWithin: 'id' });
  });
});

describe('lane zoom', () => {
  const p = plan(item('a'));

  it('shows a zoomed axis one level down, within the value', () => {
    const choice = zoomLane({ x: 'time', y: 'system' }, 'y', 'id');
    expect(toViewSpec(choice).y).toEqual({ property: SYSTEM, level: 1, within: 'id' });
    expect(axisNames(choice, 'y')).toEqual({ label: 'System (component)', none: 'No component' });
    expect(swapAxes(choice)).toEqual({ x: 'system', y: 'time', xWithin: 'id', yWithin: null });
  });

  it('only zooms lanes that have something below them, one level per axis', () => {
    expect(canZoomLane(p, { x: 'time', y: 'system' }, 'y', 'id')).toBe(true);
    expect(canZoomLane(p, { x: 'time', y: 'component' }, 'y', 'id/sso')).toBe(false);
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
