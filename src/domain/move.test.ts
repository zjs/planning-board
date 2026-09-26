import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { SEQUENCE, SIZE, SYSTEM, TIME } from './model.ts';
import { planDrop } from './move.ts';
import type { ViewSpec } from './view.ts';

const seqBySystem: ViewSpec = { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } };
const timeBySystem: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };
const timeBySize: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SIZE, level: 0 } };

describe('planDrop into a cell', () => {
  it('sets both axis values', () => {
    const p = plan(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }), item('b', { sequence: 'a1' }));
    expect(planDrop(p, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { x: 'a1', y: 'pay' })).toEqual({
      sequence: 'a1',
      values: { [SYSTEM]: ['pay'] },
    });
  });

  it("is a no-op when a card alone in its column drops into the gap beside it", () => {
    const p = plan(
      item('a', { sequence: 'a1', values: { [SYSTEM]: ['id'] } }),
      item('b', { sequence: 'a0' }),
      item('c', { sequence: 'a2' }),
    );
    const card = { itemId: 'a', x: 'a1', y: 'id' };
    expect(planDrop(p, seqBySystem, card, { x: 'a1V', y: 'id' })).toBeNull();
    expect(planDrop(p, seqBySystem, card, { x: 'a0V', y: 'id' })).toBeNull();
    // Past a neighbor it's a real move.
    expect(planDrop(p, seqBySystem, card, { x: 'a2V', y: 'id' })).toEqual({ sequence: 'a2V', values: {} });
    // Sharing its column, stepping into the gap splits it off: also a real move.
    const shared = plan(item('a', { sequence: 'a1', values: { [SYSTEM]: ['id'] } }), item('b', { sequence: 'a1' }));
    expect(planDrop(shared, seqBySystem, { itemId: 'a', x: 'a1', y: 'id' }, { x: 'a1V', y: 'id' })).toEqual({
      sequence: 'a1V',
      values: {},
    });
  });

  it('is a no-op when dropped back where it was', () => {
    const p = plan(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id/sso'] } }));
    expect(planDrop(p, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { x: 'a0', y: 'id' })).toBeNull();
  });

  it('keeps precise values when only the other axis changes', () => {
    const p = plan(item('a', { values: { [TIME]: ['q1/r2'], [SYSTEM]: ['id/sso', 'id/mfa'] } }));
    expect(planDrop(p, timeBySystem, { itemId: 'a', x: 'q1', y: 'id' }, { x: 'q2', y: 'id' })).toEqual({
      values: { [TIME]: ['q2'] },
    });
    // Same quarter, different area: the release inside Q1 survives.
    expect(planDrop(p, timeBySystem, { itemId: 'a', x: 'q1', y: 'id' }, { x: 'q1', y: 'pay' })).toEqual({
      values: { [SYSTEM]: ['pay'] },
    });
  });

  it("moves only the dragged copy's lane of a multi-valued card", () => {
    const p = plan(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id/sso', 'id/mfa', 'pay/ledger'] } }));
    // Dragging the Identity copy to Payments: both Identity components go, Payments' component stays.
    expect(planDrop(p, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { x: 'a0', y: 'pay' })).toEqual({
      values: { [SYSTEM]: ['pay/ledger'] },
    });
  });

  it('adds a lane with the modifier instead of moving', () => {
    const p = plan(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id/sso'] } }));
    expect(
      planDrop(p, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { x: 'a0', y: 'pay' }, 'add'),
    ).toEqual({ values: { [SYSTEM]: ['id/sso', 'pay'] } });
    // Already in the lane: nothing to add.
    expect(
      planDrop(p, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { x: 'a0', y: 'id' }, 'add'),
    ).toBeNull();
  });

  it("replaces a holding-lane copy's row, or adds to it with the modifier (Q10)", () => {
    // Identity, no quarter: it sits in Identity's holding lane.
    const p = plan(item('a', { values: { [SYSTEM]: ['id/sso'] } }));
    const card = { itemId: 'a', x: null, y: 'id' };
    expect(planDrop(p, timeBySystem, card, { x: 'q2', y: 'pay' })).toEqual({
      values: { [TIME]: ['q2'], [SYSTEM]: ['pay'] },
    });
    expect(planDrop(p, timeBySystem, card, { x: 'q2', y: 'pay' }, 'add')).toEqual({
      values: { [TIME]: ['q2'], [SYSTEM]: ['id/sso', 'pay'] },
    });
    expect(planDrop(p, timeBySystem, card, { x: 'q2', y: 'id' })).toEqual({ values: { [TIME]: ['q2'] } });
  });

  it('replaces single-valued properties even from the holding area', () => {
    const p = plan(item('a', { values: { [SIZE]: ['s'] } }));
    expect(planDrop(p, timeBySize, { itemId: 'a', x: null, y: 's' }, { x: 'q1', y: 'l' })).toEqual({
      values: { [TIME]: ['q1'], [SIZE]: ['l'] },
    });
  });

  it('ignores the modifier for single-valued properties', () => {
    const p = plan(item('a', { values: { [TIME]: ['q1'], [SIZE]: ['s'] } }));
    expect(
      planDrop(p, timeBySize, { itemId: 'a', x: 'q1', y: 's' }, { x: 'q2', y: 's' }, 'add'),
    ).toEqual({ values: { [TIME]: ['q2'] } });
  });
});

describe('planDrop into a holding lane', () => {
  it("clears the column but keeps the row in a row's holding lane (Q11)", () => {
    const p = plan(item('a', { sequence: 'a0', values: { [TIME]: ['q1/r1'], [SYSTEM]: ['id'] } }));
    expect(planDrop(p, seqBySystem, { itemId: 'a', x: 'a0', y: 'id' }, { x: null, y: 'id' })).toEqual({
      sequence: null,
      values: {},
    });
    expect(planDrop(p, timeBySystem, { itemId: 'a', x: 'q1', y: 'id' }, { x: null, y: 'id' })).toEqual({
      values: { [TIME]: [] },
    });
  });

  it("removes only the dragged copy's row in a column's holding lane", () => {
    const p = plan(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id/sso', 'pay/ledger'] } }));
    expect(planDrop(p, seqBySystem, { itemId: 'a', x: 'a0', y: 'pay' }, { x: 'a0', y: null })).toEqual({
      values: { [SYSTEM]: ['id/sso'] },
    });
  });

  it('can move a card to another row while clearing its column', () => {
    const p = plan(item('a', { values: { [TIME]: ['q1'], [SYSTEM]: ['id'] } }));
    expect(planDrop(p, timeBySystem, { itemId: 'a', x: 'q1', y: 'id' }, { x: null, y: 'pay' })).toEqual({
      values: { [TIME]: [], [SYSTEM]: ['pay'] },
    });
  });

  it('sets only the lane axis when moving between holding lanes', () => {
    const p = plan(item('a', { values: { [TIME]: ['q1'] } }));
    expect(planDrop(p, timeBySystem, { itemId: 'a', x: 'q1', y: null }, { x: 'q2', y: null })).toEqual({
      values: { [TIME]: ['q2'] },
    });
    const q = plan(item('b', { values: { [SYSTEM]: ['id'] } }));
    expect(planDrop(q, timeBySystem, { itemId: 'b', x: null, y: 'id' }, { x: null, y: 'pay' })).toEqual({
      values: { [SYSTEM]: ['pay'] },
    });
  });

  it('clears both axes in the corner', () => {
    const p = plan(item('a', { values: { [TIME]: ['q1'], [SYSTEM]: ['id', 'pay'] } }));
    expect(planDrop(p, timeBySystem, { itemId: 'a', x: 'q1', y: 'pay' }, { x: null, y: null })).toEqual({
      values: { [TIME]: [], [SYSTEM]: ['id'] },
    });
  });

  it('removes a value even with the modifier held', () => {
    const p = plan(item('a', { values: { [TIME]: ['q1'], [SYSTEM]: ['id'] } }));
    expect(planDrop(p, timeBySystem, { itemId: 'a', x: 'q1', y: 'id' }, { x: null, y: 'pay' }, 'add')).toEqual({
      values: { [TIME]: [], [SYSTEM]: ['id', 'pay'] },
    });
  });

  it('opens a new sequence position from a gap in the holding lane', () => {
    const p = plan(item('a', { values: { [SYSTEM]: ['id'] } }), item('b', { sequence: 'a0' }));
    expect(planDrop(p, seqBySystem, { itemId: 'a', x: null, y: 'id' }, { x: 'a1', y: null })).toEqual({
      sequence: 'a1',
      values: { [SYSTEM]: [] },
    });
  });

  it('is a no-op when dropped back in the same lane, or for an unknown item', () => {
    const p = plan(item('a', { values: { [SYSTEM]: ['id'] } }));
    expect(planDrop(p, timeBySystem, { itemId: 'a', x: null, y: 'id' }, { x: null, y: 'id' })).toBeNull();
    expect(planDrop(p, timeBySystem, { itemId: 'zz', x: 'q1', y: 'id' }, { x: null, y: 'id' })).toBeNull();
  });
});
