import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { SEQUENCE, SIZE, SYSTEM, TIME, type SelectProperty } from './model.ts';
import { laneKeyOf, layoutView, shownInside, type CardRef, type ViewLayout, type ViewSpec } from './view.ts';

const seqBySystem: ViewSpec = { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } };
const timeBySystem: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };

/** Cell contents as "row/column: items" strings, for readable assertions. */
function cellMap(layout: ViewLayout): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  layout.rows.forEach((row, r) =>
    layout.columns.forEach((column, c) => {
      // Faded "via children" copies are marked, so tests show which copies are solid.
      const ids = layout.cells[r]![c]!.map((ref) => (ref.via ? `${ref.itemId} (via)` : ref.itemId));
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

  it('treats a value shallower than a zoomed view level, or unknown, as missing', () => {
    const layout = layoutView(
      plan(
        item('quarter-only', { values: { [TIME]: ['q1'], [SYSTEM]: ['id'] } }),
        item('release', { values: { [TIME]: ['q1/r2'], [SYSTEM]: ['id'] } }),
        item('dangling', { values: { [TIME]: ['q9'], [SYSTEM]: ['id'] } }),
      ),
      { x: { property: TIME, level: 1, within: 'q1' }, y: { property: SYSTEM, level: 0 } },
    );
    expect(cellMap(layout)).toEqual({ 'id / q1/r2': ['release'] });
    // The quarter-only card waits for a release; the unknown value is outside the zoom, so it's hidden (Q18).
    expect(layout.holding.rows[0]!.map((ref) => ref.itemId)).toEqual(['quarter-only']);
  });

  it('shows only the children of the card zoomed into (requirement 12)', () => {
    const p = plan(
      item('epic', { values: { [TIME]: ['q1'], [SYSTEM]: ['id'] } }),
      item('child', { parent: 'epic', values: { [TIME]: ['q2'], [SYSTEM]: ['pay'] } }),
      item('grandchild', { parent: 'child', values: { [TIME]: ['q2'], [SYSTEM]: ['pay'] } }),
      item('other', { values: { [TIME]: ['q2'], [SYSTEM]: ['pay'] } }),
    );
    expect(cellMap(layoutView(p, { ...timeBySystem, root: 'epic' }))).toEqual({ 'pay / q2': ['child'] });
    expect(allHolding(layoutView(p, { ...timeBySystem, root: 'other' }))).toEqual([]);
    expect(cellMap(layoutView(p, { ...timeBySystem, root: null }))).toEqual({
      'id / q1': ['epic'],
      'pay / q2': ['other', 'epic (via)'],
    });
  });

  it('shows groups as one card and hides their children', () => {
    const layout = layoutView(
      plan(
        item('epic', { values: { [TIME]: ['q1'], [SYSTEM]: ['id'] } }),
        item('child', { parent: 'epic', values: { [TIME]: ['q2'], [SYSTEM]: ['pay'] } }),
      ),
      timeBySystem,
    );
    expect(cellMap(layout)).toEqual({ 'id / q1': ['epic'], 'pay / q2': ['epic (via)'] });
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

  it('zooms into one lane: its children become lanes, coarse cards wait, the rest are hidden (Q18)', () => {
    const layout = layoutView(
      plan(
        item('sso', { values: { [SYSTEM]: ['id/sso'], [TIME]: ['q1'] } }),
        item('both', { values: { [SYSTEM]: ['id/mfa', 'pay/ledger'], [TIME]: ['q1'] } }),
        item('area-only', { values: { [SYSTEM]: ['id'], [TIME]: ['q2'] } }),
        item('billing', { values: { [SYSTEM]: ['pay/ledger'], [TIME]: ['q1'] } }),
        item('untagged', { values: { [TIME]: ['q1'] } }),
      ),
      { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 1, within: 'id' } },
    );
    // Identity's components, in tree order; Payments' ledger isn't a lane.
    expect(layout.rows.map((l) => l.key)).toEqual(['id/mfa', 'id/sso']);
    // A card also in Billing shows only in its Identity lane.
    expect(cellMap(layout)).toEqual({ 'id/mfa / q1': ['both'], 'id/sso / q1': ['sso'] });
    // "Identity, no component yet" waits in the holding lane under its quarter.
    expect(layout.holding.columns[1]).toEqual([{ itemId: 'area-only', x: 'q2', y: null }]);
    expect(allHolding(layout).map((r) => r.itemId)).toEqual(['area-only']);
  });

  it('adds faded "via children" copies of a group where only its descendants reach (Q16)', () => {
    const layout = layoutView(
      plan(
        item('epic', { values: { [TIME]: ['q1'], [SYSTEM]: ['id'] } }),
        // Same cell as the group: no faded copy there.
        item('same', { parent: 'epic', values: { [TIME]: ['q1'], [SYSTEM]: ['id/sso'] } }),
        // No quarter of its own: taken to be in its group's Q1.
        item('undated', { parent: 'epic', values: { [SYSTEM]: ['pay'] } }),
        item('story', { parent: 'epic', values: { [TIME]: ['q2'] } }),
        // Two levels down, inheriting Q2 from 'story' and adding Payments.
        item('deep', { parent: 'story', values: { [SYSTEM]: ['pay/ledger'] } }),
      ),
      timeBySystem,
    );
    expect(cellMap(layout)).toEqual({
      'id / q1': ['epic'],
      // 'story' has Q2 and no area of its own, so it's taken to be in its group's Identity.
      'id / q2': ['epic (via)'],
      'pay / q1': ['epic (via)'],
      'pay / q2': ['epic (via)'],
    });
  });

  it('shows only faded copies of a group outside a lane zoom, where its children are inside', () => {
    const layout = layoutView(
      plan(
        item('epic', { values: { [TIME]: ['q1'], [SYSTEM]: ['pay'] } }),
        item('child', { parent: 'epic', values: { [TIME]: ['q2'], [SYSTEM]: ['id/sso'] } }),
      ),
      { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 1, within: 'id' } },
    );
    expect(cellMap(layout)).toEqual({ 'id/sso / q2': ['epic (via)'] });
    expect(allHolding(layout)).toEqual([]);
  });
});

describe('nested axes (ADR 0012)', () => {
  const releases: ViewSpec = { x: { property: TIME, level: 1 }, y: { property: SYSTEM, level: 0 } };
  const p = plan(
    item('quarter-only', { values: { [TIME]: ['q1'], [SYSTEM]: ['id'] } }),
    item('release', { values: { [TIME]: ['q1/r2'], [SYSTEM]: ['id'] } }),
    item('dangling', { values: { [TIME]: ['q9'], [SYSTEM]: ['id'] } }),
    item('undated', { values: { [SYSTEM]: ['pay'] } }),
  );

  it("gives each parent a band over its children, then a lane of its own for its plain value", () => {
    const layout = layoutView(p, releases);
    expect(layout.columns.map((l) => [l.key, l.kind ?? 'value'])).toEqual([
      ['q1/r1', 'value'],
      ['q1/r2', 'value'],
      ['q1', 'parent'],
      ['q2/r1', 'value'],
      ['q2', 'parent'],
    ]);
    expect(layout.bands.x).toEqual([
      { key: 'q1', label: 'Q1', depth: 0, start: 0, end: 3, collapsed: false },
      { key: 'q2', label: 'Q2', depth: 0, start: 3, end: 5, collapsed: false },
    ]);
    expect(layout.bands.y).toEqual([]);
    // The quarter-only card is in Q1's own lane; only cards with no known value wait at the edge.
    expect(cellMap(layout)).toEqual({ 'id / q1/r2': ['release'], 'id / q1': ['quarter-only'] });
    expect(allHolding(layout).map((r) => r.itemId).sort()).toEqual(['dangling', 'undated']);
  });

  it('a collapsed parent is one lane holding everything inside it', () => {
    const layout = layoutView(p, { ...releases, x: { ...releases.x, collapsed: ['q1'] } });
    expect(layout.columns.map((l) => [l.key, l.kind, l.inner])).toEqual([
      ['q1', 'collapsed', 2],
      ['q2/r1', undefined, undefined],
      ['q2', 'parent', undefined],
    ]);
    expect(layout.bands.x[0]).toMatchObject({ key: 'q1', start: 0, end: 1, collapsed: true });
    expect(cellMap(layout)).toEqual({ 'id / q1': ['release', 'quarter-only'].sort((a, b) => a.localeCompare(b)) });
  });

  it('nests rows the same way, with a component in two areas shown in each', () => {
    const layout = layoutView(
      plan(item('both', { sequence: 'a0', values: { [SYSTEM]: ['id/sso', 'pay'] } })),
      { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 1 } },
    );
    expect(layout.rows.map((l) => l.key)).toEqual(['id/mfa', 'id/sso', 'id', 'pay/ledger', 'pay']);
    expect(cellMap(layout)).toEqual({ 'id/sso / a0': ['both'], 'pay / a0': ['both'] });
  });
});

describe('laneKeyOf', () => {
  const axis = { property: TIME, level: 1 };
  it('maps a value to its lane: its ancestor at the level, its own lane if coarser, or a collapsed parent', () => {
    const time = plan().properties[TIME] as SelectProperty;
    expect(laneKeyOf(time, 'q1/r2', axis)).toBe('q1/r2');
    expect(laneKeyOf(time, 'q1', axis)).toBe('q1');
    expect(laneKeyOf(time, 'q1/r2', { ...axis, collapsed: ['q1'] })).toBe('q1');
    expect(laneKeyOf(time, 'q9', axis)).toBeNull();
    // A top-level or zoomed axis keeps the old rule: coarser values have no lane.
    expect(laneKeyOf(time, 'q1', { ...axis, within: 'q1' })).toBeNull();
    expect(laneKeyOf(time, 'q1/r2', { property: TIME, level: 0 })).toBe('q1');
  });
});


describe('children in context (Q33)', () => {
  const p = plan(
    item('epic', { values: { [TIME]: ['q1'], [SYSTEM]: ['id'] } }),
    item('story', { parent: 'epic', values: { [TIME]: ['q2'], [SYSTEM]: ['id'] } }),
    item('task', { parent: 'story', values: { [SYSTEM]: ['pay'] } }),
    item('inherits', { parent: 'epic' }),
    item('other', { values: { [TIME]: ['q2'], [SYSTEM]: ['pay'] } }),
    item('lone', { parent: 'other', values: { [TIME]: ['q1'], [SYSTEM]: ['pay'] } }),
  );
  const refs = (layout: ViewLayout) =>
    layout.cells.flat(2).concat(allHolding(layout)).filter((r) => !r.via);

  it('a frame lists the cards that put the group in that cell, with their own lanes', () => {
    const layout = layoutView(p, timeBySystem);
    const frame = layout.cells.flat(2).find((r) => r.itemId === 'epic' && r.via === 'children' && r.x === 'q2' && r.y === 'id')!;
    // The story is dated Q2 itself, but takes Identity as its own value too.
    expect(frame.inner).toEqual([{ itemId: 'story', x: 'q2', y: 'id' }]);
    // The task has only its own area; its date comes from the story above it.
    const pay = layout.cells.flat(2).find((r) => r.itemId === 'epic' && r.via === 'children' && r.y === 'pay')!;
    expect(pay.inner).toEqual([{ itemId: 'task', x: null, y: 'pay' }]);
  });

  it('expanding a group shows its children in its place, marked with it, at any depth', () => {
    const layout = layoutView(p, { ...timeBySystem, expanded: ['epic'] });
    expect(refs(layout).map((r) => [r.itemId, r.parent ?? null]).sort()).toEqual([
      ['inherits', 'epic'],
      ['other', null],
      ['story', 'epic'],
    ]);
    const deeper = layoutView(p, { ...timeBySystem, expanded: ['epic', 'story'] });
    expect(refs(deeper).map((r) => [r.itemId, r.parent ?? null]).sort()).toEqual([
      ['inherits', 'epic'],
      ['other', null],
      ['task', 'story'],
    ]);
  });

  it('zooming into several groups shows all their children, each marked with its group', () => {
    const layout = layoutView(p, { ...timeBySystem, roots: ['epic', 'other'] });
    expect(refs(layout).map((r) => [r.itemId, r.parent]).sort()).toEqual([
      ['inherits', 'epic'],
      ['lone', 'other'],
      ['story', 'epic'],
    ]);
    // One root is the usual zoom: no marks needed.
    expect(refs(layoutView(p, { ...timeBySystem, roots: ['epic'] })).every((r) => r.parent === undefined)).toBe(true);
  });
});

describe('shownInside', () => {
  const p = plan(item('init'), item('epic', { parent: 'init' }), item('story', { parent: 'epic' }), item('other'));

  it('is true for the level the view shows, and inside expanded groups on it', () => {
    expect(shownInside(p, timeBySystem, null)).toBe(true);
    expect(shownInside(p, timeBySystem, 'init')).toBe(false);
    expect(shownInside(p, { ...timeBySystem, expanded: ['init'] }, 'init')).toBe(true);
    // An expanded epic inside a folded initiative isn't on the board.
    expect(shownInside(p, { ...timeBySystem, expanded: ['epic'] }, 'epic')).toBe(false);
    expect(shownInside(p, { ...timeBySystem, expanded: ['init', 'epic'] }, 'epic')).toBe(true);
  });

  it('follows a zoom', () => {
    expect(shownInside(p, { ...timeBySystem, root: 'init' }, 'init')).toBe(true);
    expect(shownInside(p, { ...timeBySystem, root: 'init' }, null)).toBe(false);
    expect(shownInside(p, { ...timeBySystem, roots: ['init', 'other'] }, 'other')).toBe(true);
  });
});
