import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { SEQUENCE, SIZE, SYSTEM, TIME } from './model.ts';
import { layoutView, type CardRef, type ViewLayout, type ViewSpec } from './view.ts';

const seqBySystem: ViewSpec = { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } };
const timeBySystem: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };

/** Cell contents as "row/column: items" strings, for readable assertions. */
function cellMap(layout: ViewLayout): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  layout.rows.forEach((row, r) =>
    layout.columns.forEach((column, c) => {
      const ids = layout.cells[r]![c]!.map((ref) => ref.itemId);
      if (ids.length) out[`${row.key} / ${column.key}`] = ids;
    }),
  );
  return out;
}

/** Every copy in any holding lane. */
function allHolding(layout: ViewLayout): CardRef[] {
  return [...layout.holding.rows.flat(), ...layout.holding.columns.flat(), ...layout.holding.corner];
}

describe('layoutView', () => {
  it('places items by both axes, rolling deep values up to the view level', () => {
    const layout = layoutView(
      plan(
        item('login', { sequence: 'a0', values: { [SYSTEM]: ['id/sso'] } }),
        item('ledger', { sequence: 'a1', values: { [SYSTEM]: ['pay/ledger'] } }),
      ),
      seqBySystem,
    );
    expect(layout.rows.map((l) => l.key)).toEqual(['id', 'pay']);
    expect(layout.columns.map((l) => l.key)).toEqual(['a0', 'a1']);
    expect(cellMap(layout)).toEqual({ 'id / a0': ['login'], 'pay / a1': ['ledger'] });
    expect(allHolding(layout)).toEqual([]);
  });

  it('offers gaps around sequence lanes only', () => {
    const layout = layoutView(
      plan(item('x', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }), item('y', { sequence: 'a1', values: { [SYSTEM]: ['id'] } })),
      seqBySystem,
    );
    expect(layout.gaps.y).toBeNull();
    const [before, between, after] = layout.gaps.x!;
    expect(layout.gaps.x).toHaveLength(3);
    expect(before! < 'a0' && 'a0' < between! && between! < 'a1' && 'a1' < after!).toBe(true);
    expect(layoutView(plan(), seqBySystem).gaps.x).toHaveLength(1);
  });

  it('never labels sequence lanes', () => {
    const layout = layoutView(plan(item('x', { sequence: 'a0', values: { [SYSTEM]: ['id'] } })), seqBySystem);
    expect(layout.columns.every((lane) => lane.label === null)).toBe(true);
    expect(layout.rows.map((lane) => lane.label)).toEqual(['ID', 'PAY']);
  });

  it('keeps empty value lanes so they stay droppable', () => {
    const layout = layoutView(plan(), timeBySystem);
    expect(layout.columns.map((l) => l.key)).toEqual(['q1', 'q2']);
    expect(layout.rows.map((l) => l.key)).toEqual(['id', 'pay']);
  });

  it('shows a multi-valued item once in each matching lane, and once per lane after roll-up', () => {
    const layout = layoutView(
      plan(item('sso-billing', { sequence: 'a0', values: { [SYSTEM]: ['id/sso', 'id/mfa', 'pay/ledger'] } })),
      seqBySystem,
    );
    expect(cellMap(layout)).toEqual({ 'id / a0': ['sso-billing'], 'pay / a0': ['sso-billing'] });
    expect(layout.cells[0]![0]).toEqual([{ itemId: 'sso-billing', x: 'a0', y: 'id' }]);
    expect(layout.cells[1]![0]).toEqual([{ itemId: 'sso-billing', x: 'a0', y: 'pay' }]);
  });

  it('puts an item missing an axis value in the holding lane for the value it has', () => {
    const layout = layoutView(
      plan(
        item('no-system', { sequence: 'a0' }),
        item('no-sequence', { values: { [SYSTEM]: ['id', 'pay/ledger'] } }),
        item('empty-array', { sequence: 'a0', values: { [SYSTEM]: [] } }),
        item('neither'),
        item('placed', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }),
      ),
      seqBySystem,
    );
    // Rows are id, pay; the one column is a0.
    expect(layout.holding.rows).toEqual([
      [{ itemId: 'no-sequence', x: null, y: 'id' }],
      [{ itemId: 'no-sequence', x: null, y: 'pay' }],
    ]);
    expect(layout.holding.columns).toEqual([
      [
        { itemId: 'empty-array', x: 'a0', y: null },
        { itemId: 'no-system', x: 'a0', y: null },
      ],
    ]);
    expect(layout.holding.corner).toEqual([{ itemId: 'neither', x: null, y: null }]);
    expect(cellMap(layout)).toEqual({ 'id / a0': ['placed'] });
  });

  it('treats a value shallower than the view level, or unknown, as missing', () => {
    const layout = layoutView(
      plan(
        item('quarter-only', { values: { [TIME]: ['q1'], [SYSTEM]: ['id'] } }),
        item('release', { values: { [TIME]: ['q1/r2'], [SYSTEM]: ['id'] } }),
        item('dangling', { values: { [TIME]: ['q9'], [SYSTEM]: ['id'] } }),
      ),
      { x: { property: TIME, level: 1 }, y: { property: SYSTEM, level: 0 } },
    );
    expect(cellMap(layout)).toEqual({ 'id / q1/r2': ['release'] });
    expect(layout.holding.rows[0]!.map((ref) => ref.itemId).sort()).toEqual(['dangling', 'quarter-only']);
  });

  it('shows groups as one card and hides their children', () => {
    const layout = layoutView(
      plan(
        item('epic', { values: { [TIME]: ['q1'], [SYSTEM]: ['id'] } }),
        item('child', { parent: 'epic', values: { [TIME]: ['q2'], [SYSTEM]: ['pay'] } }),
      ),
      timeBySystem,
    );
    expect(cellMap(layout)).toEqual({ 'id / q1': ['epic'] });
    expect(allHolding(layout)).toEqual([]);
  });

  it('orders cards in a cell by sequence, then title, with unsequenced cards last', () => {
    const layout = layoutView(
      plan(
        item('c', { title: 'Alpha', values: { [SIZE]: ['m'], [SYSTEM]: ['id'] } }),
        item('b', { title: 'Zulu', sequence: 'a0', values: { [SIZE]: ['m'], [SYSTEM]: ['id'] } }),
        item('a', { title: 'Mike', sequence: 'a0', values: { [SIZE]: ['m'], [SYSTEM]: ['id'] } }),
        item('d', { title: 'Bravo', sequence: 'Zz', values: { [SIZE]: ['m'], [SYSTEM]: ['id'] } }),
      ),
      { x: { property: SIZE, level: 0 }, y: { property: SYSTEM, level: 0 } },
    );
    // 'Zz' < 'a0' in byte order, which is what fractional keys rely on.
    expect(cellMap(layout)).toEqual({ 'id / m': ['d', 'a', 'b', 'c'] });
  });

  it('works when sequence is on the Y axis', () => {
    const layout = layoutView(
      plan(item('x', { sequence: 'a1', values: { [SIZE]: ['s'] } }), item('y', { sequence: 'a0', values: { [SIZE]: ['l'] } })),
      { x: { property: SIZE, level: 0 }, y: { property: SEQUENCE, level: 0 } },
    );
    expect(cellMap(layout)).toEqual({ 'a0 / l': ['y'], 'a1 / s': ['x'] });
  });

  it('returns an empty layout for an unknown property instead of throwing', () => {
    const layout = layoutView(plan(item('x')), { x: { property: 'nope', level: 0 }, y: { property: SYSTEM, level: 0 } });
    expect(layout.columns).toEqual([]);
    expect(layout.holding.corner.map((ref) => ref.itemId)).toEqual(['x']);
  });
});
