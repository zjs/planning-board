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
    expect(cardAttributes(p, p.items['a']!, seqBySystem)).toEqual([
      { property: SIZE, text: 'M', title: 'Size: M' },
      { property: TIME, text: 'Q1/R2', title: 'Time: Q1 › Q1/R2' },
    ]);
  });

  it('summarizes several values as the first plus a count, with all of them in the tooltip', () => {
    const p = plan(item('a', { values: { [SYSTEM]: ['id/sso', 'pay/ledger', 'id'] } }));
    expect(cardAttributes(p, p.items['a']!, timeBySize)).toEqual([
      { property: SYSTEM, text: 'ID/SSO +2', title: 'System: ID › ID/SSO, PAY › PAY/LEDGER, ID' },
    ]);
  });

  it('skips properties without values, or with unknown values', () => {
    const p = plan(item('a', { values: { [SIZE]: [], [TIME]: ['nope'] } }));
    expect(cardAttributes(p, p.items['a']!, seqBySystem)).toEqual([]);
  });
});
