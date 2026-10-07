import { describe, expect, it } from 'vitest';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { SYSTEM } from '../domain/model.ts';
import { AREA_COLORS, areaKey, areaPalette, cardAreas } from './areas.ts';

describe('area colors', () => {
  it('numbers the areas in their order, for the headers and the key', () => {
    const p = plan();
    expect([...areaPalette(p)]).toEqual([
      ['id', 0],
      ['pay', 1],
    ]);
    expect(areaKey(p)).toEqual([
      { id: 'id', label: 'ID', index: 0 },
      { id: 'pay', label: 'PAY', index: 1 },
    ]);
  });

  it('colors a card by its first area, and its tooltip says when there are more', () => {
    const p = plan(
      item('one', { values: { [SYSTEM]: ['pay/ledger'] } }),
      item('both', { values: { [SYSTEM]: ['id/sso', 'pay', 'id/mfa'] } }),
      item('none'),
    );
    const areas = cardAreas(p);
    expect(areas.get('one')).toEqual({ index: 1, title: 'Area: PAY' });
    expect(areas.get('both')).toEqual({ index: 0, title: 'Area: ID, and 1 more' });
    expect(areas.has('none')).toBe(false);
  });

  it('reuses the colors after the eighth area', () => {
    expect(AREA_COLORS).toBe(8);
    const p = plan();
    const system = p.properties[SYSTEM]!;
    if (system.kind !== 'select') throw new Error('System is a select property');
    for (let i = 0; i < 9; i++) system.values[`area${i}`] = { id: `area${i}`, label: `Area ${i}`, parent: null, order: `b${i}` };
    // ID and PAY come first, so the ninth added area, the eleventh in all, shares the third one's color.
    expect(areaPalette(p).get('area0')).toBe(2);
    expect(areaPalette(p).get('area8')).toBe(2);
  });
});
