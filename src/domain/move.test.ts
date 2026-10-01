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

describe('planDrop with levels and lane zoom', () => {
  const byComponent: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 1, within: 'id' } };

  it('refining replaces the coarser value instead of keeping both', () => {
    const p = plan(item('a', { values: { [SYSTEM]: ['id', 'pay/ledger'], [TIME]: ['q1'] } }));
    // From "No component" (it only has Identity) into the SSO lane.
    expect(planDrop(p, byComponent, { itemId: 'a', x: 'q1', y: null }, { x: 'q1', y: 'id/sso' })).toEqual({
      values: { [SYSTEM]: ['pay/ledger', 'id/sso'] },
    });
    // Adding a value inside an existing one works the same way at any level.
    const q = plan(item('b', { values: { [SYSTEM]: ['id'] } }));
    const components: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 1 } };
    expect(planDrop(q, components, { itemId: 'b', x: null, y: null }, { x: null, y: 'id/mfa' }, 'add')).toEqual({
      values: { [SYSTEM]: ['id/mfa'] },
    });
  });

  it("in a zoomed lane, the holding lane means 'inside, nothing more precise' (Q22)", () => {
    const p = plan(item('a', { values: { [SYSTEM]: ['id/sso', 'pay'], [TIME]: ['q1'] } }));
    expect(planDrop(p, byComponent, { itemId: 'a', x: 'q1', y: 'id/sso' }, { x: 'q1', y: null })).toEqual({
      values: { [SYSTEM]: ['pay', 'id'] },
    });
    // Still inside through another component: nothing coarser is added.
    const q = plan(item('b', { values: { [SYSTEM]: ['id/sso', 'id/mfa'] } }));
    expect(planDrop(q, byComponent, { itemId: 'b', x: null, y: 'id/sso' }, { x: null, y: null })).toEqual({
      values: { [SYSTEM]: ['id/mfa'] },
    });
    // Single-valued: a release zoomed within Q1 goes back to Q1.
    const r = plan(item('c', { values: { [TIME]: ['q1/r2'] } }));
    const byRelease: ViewSpec = { x: { property: TIME, level: 1, within: 'q1' }, y: { property: SIZE, level: 0 } };
    expect(planDrop(r, byRelease, { itemId: 'c', x: 'q1/r2', y: null }, { x: null, y: null })).toEqual({
      values: { [TIME]: ['q1'] },
    });
  });
});

describe('planDrop on a nested axis (ADR 0012)', () => {
  const components: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 1 } };

  it("a parent's own lane gives the copy the plain parent value (Q22's rule)", () => {
    const p = plan(item('a', { values: { [SYSTEM]: ['id/sso', 'pay/ledger'], [TIME]: ['q1'] } }));
    expect(planDrop(p, components, { itemId: 'a', x: 'q1', y: 'id/sso' }, { x: 'q1', y: 'id' })).toEqual({
      values: { [SYSTEM]: ['pay/ledger', 'id'] },
    });
    const releases: ViewSpec = { x: { property: TIME, level: 1 }, y: { property: SIZE, level: 0 } };
    const r = plan(item('c', { values: { [TIME]: ['q1/r2'] } }));
    expect(planDrop(r, releases, { itemId: 'c', x: 'q1/r2', y: null }, { x: 'q1', y: null })).toEqual({
      values: { [TIME]: ['q1'] },
    });
  });

  it('moving within a collapsed lane keeps the precise value; moving into one gives the plain parent', () => {
    const folded: ViewSpec = { ...components, y: { ...components.y, collapsed: ['id'] } };
    const p = plan(item('a', { values: { [SYSTEM]: ['id/sso'], [TIME]: ['q1'] } }), item('b', { values: { [SYSTEM]: ['pay/ledger'] } }));
    expect(planDrop(p, folded, { itemId: 'a', x: 'q1', y: 'id' }, { x: 'q2', y: 'id' })).toEqual({ values: { [TIME]: ['q2'] } });
    expect(planDrop(p, folded, { itemId: 'b', x: null, y: 'pay/ledger' }, { x: null, y: 'id' })).toEqual({
      values: { [SYSTEM]: ['id'] },
    });
    // A single-valued axis: a release card stays in its release when moved along the other axis.
    const releases: ViewSpec = { x: { property: TIME, level: 1, collapsed: ['q1'] }, y: { property: SIZE, level: 0 } };
    const r = plan(item('c', { values: { [TIME]: ['q1/r2'], [SIZE]: ['s'] } }));
    expect(planDrop(r, releases, { itemId: 'c', x: 'q1', y: 's' }, { x: 'q1', y: 'm' })).toEqual({ values: { [SIZE]: ['m'] } });
  });
});

