import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { cardAttributes } from './attributes.ts';
import { SEQUENCE, SIZE, SYSTEM, TIME } from './model.ts';
import type { ViewSpec } from './view.ts';

const seqBySystem: ViewSpec = { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } };
const timeBySize: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SIZE, level: 0 } };

describe('cardAttributes', () => {
  it('shows non-axis values, size then time then system', () => {
    const p = plan(item('a', { values: { [TIME]: ['q1/r2'], [SIZE]: ['m'], [SYSTEM]: ['id/sso'] } }));
    // Time is an axis at quarter level, but the release is more precise, so it still shows.
    expect(cardAttributes(p, p.items['a']!, timeBySize).map((a) => a.property)).toEqual([TIME, SYSTEM]);
    expect(cardAttributes(p, p.items['a']!, seqBySystem)).toEqual([
      { property: SIZE, text: 'M', title: 'Size: M', value: 'm' },
      { property: TIME, text: 'Q1/R2', title: 'Time: Q1 › Q1/R2', value: 'q1/r2' },
      // System is an axis, but at area level; the component is more precise, so it still shows.
      { property: SYSTEM, text: 'ID/SSO', title: 'System: ID › ID/SSO', value: 'id/sso' },
    ]);
  });

  it('hides axis values that the axis already shows exactly', () => {
    const p = plan(item('a', { values: { [TIME]: ['q1'], [SYSTEM]: ['id'] } }));
    expect(cardAttributes(p, p.items['a']!, { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } })).toEqual(
      [],
    );
  });

  it('summarizes several values as the first plus a count, with all of them in the tooltip', () => {
    const p = plan(item('a', { values: { [SYSTEM]: ['id/sso', 'pay/ledger', 'id'] } }));
    expect(cardAttributes(p, p.items['a']!, timeBySize)).toEqual([
      // Tree order, not storage order, so the first value shown is stable.
      // ⇧-click selects by the value shown first.
      { property: SYSTEM, text: 'ID +2', title: 'System: ID, ID › ID/SSO, PAY › PAY/LEDGER', value: 'id' },
    ]);
  });

  it('skips properties without values, or with unknown values', () => {
    const p = plan(item('a', { values: { [SIZE]: [], [TIME]: ['nope'] } }));
    expect(cardAttributes(p, p.items['a']!, seqBySystem)).toEqual([]);
  });
});
