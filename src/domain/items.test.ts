import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { cleanTitle, deletionOf, newItemSpot, valuesForChild, valuesForNewItem } from './items.ts';
import { SEQUENCE, SIZE, SYSTEM, TIME } from './model.ts';
import { layoutView, type ViewSpec } from './view.ts';

const timeBySystem: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };
const seqBySize: ViewSpec = { x: { property: SEQUENCE, level: 0 }, y: { property: SIZE, level: 0 } };

describe('valuesForNewItem', () => {
  it("takes the cell's values on both axes", () => {
    expect(valuesForNewItem(plan(), timeBySystem, { x: 'q2', y: 'pay' })).toEqual({
      sequence: null,
      values: { [TIME]: ['q2'], [SYSTEM]: ['pay'] },
    });
  });

  it('takes only the named axis in a holding lane, and nothing in the corner', () => {
    expect(valuesForNewItem(plan(), timeBySystem, { x: null, y: 'id' })).toEqual({
      sequence: null,
      values: { [SYSTEM]: ['id'] },
    });
    expect(valuesForNewItem(plan(), timeBySystem, { x: null, y: null })).toEqual({ sequence: null, values: {} });
  });

  it("takes the plain parent in a parent's own lane on a nested axis (Q22's rule)", () => {
    const nested: ViewSpec = { x: { property: TIME, level: 1 }, y: { property: SYSTEM, level: 1 } };
    expect(valuesForNewItem(plan(), nested, { x: 'q1/r2', y: 'id' })).toEqual({
      sequence: null,
      values: { [TIME]: ['q1/r2'], [SYSTEM]: ['id'] },
    });
  });

  it('takes a sequence position, including a new one from a gap', () => {
    const p = plan(item('a', { sequence: 'a0' }));
    expect(valuesForNewItem(p, seqBySize, { x: 'a0', y: 's' })).toEqual({
      sequence: 'a0',
      values: { [SIZE]: ['s'] },
    });
    expect(valuesForNewItem(p, seqBySize, { x: 'a1', y: null }).sequence).toBe('a1');
  });
});

describe('newItemSpot (Q51)', () => {
  const seqBySystem: ViewSpec = { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } };

  it('keeps a cell or holding lane as it is, so the next card goes beside the last', () => {
    const p = plan(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }));
    expect(newItemSpot(p, seqBySystem, { x: 'a0', y: 'id' })).toEqual({ x: 'a0', y: 'id' });
    expect(newItemSpot(p, seqBySystem, { x: null, y: 'pay' })).toEqual({ x: null, y: 'pay' });
    expect(newItemSpot(p, timeBySystem, { x: 'q2', y: null })).toEqual({ x: 'q2', y: null });
  });

  it('turns a gap between sequence columns into the column the card starts', () => {
    const p = plan(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }));
    const after = layoutView(p, seqBySystem).gaps.x!.at(-1)!;
    const spot = newItemSpot(p, seqBySystem, { x: after, y: 'id' });
    expect(spot).toEqual({ x: valuesForNewItem(p, seqBySystem, { x: after, y: 'id' }).sequence, y: 'id' });
    expect(spot!.x! > 'a0').toBe(true);
  });

  it('starts the first column on a board with no cards', () => {
    const empty = plan();
    const [gap] = layoutView(empty, seqBySystem).gaps.x!;
    const spot = newItemSpot(empty, seqBySystem, { x: gap!, y: null });
    expect(spot?.y).toBeNull();
    expect(layoutView(plan(item('n', { sequence: spot!.x })), seqBySystem).columns.map((c) => c.key)).toEqual([spot!.x]);
  });
});

describe('deletionOf', () => {
  const p = {
    ...plan(
      item('epic'),
      item('story', { parent: 'epic' }),
      item('task', { parent: 'story' }),
      item('other'),
      item('loner'),
    ),
    dependencies: [
      { from: 'task', to: 'other' },
      { from: 'other', to: 'loner' },
      { from: 'loner', to: 'epic' },
    ],
  };

  it('deletes a group with everything inside it, and the dependencies they touch (Q17)', () => {
    const out = deletionOf(p, ['epic']);
    expect(out.items.sort()).toEqual(['epic', 'story', 'task']);
    expect(out.dependencies).toEqual([
      { from: 'task', to: 'other' },
      { from: 'loner', to: 'epic' },
    ]);
  });

  it('handles overlapping selections, unknown IDs, and parent cycles', () => {
    expect(deletionOf(p, ['story', 'task', 'nope']).items.sort()).toEqual(['story', 'task']);
    const cyclic = plan(item('a', { parent: 'b' }), item('b', { parent: 'a' }));
    expect(deletionOf(cyclic, ['a']).items.sort()).toEqual(['a', 'b']);
  });
});

describe('cleanTitle', () => {
  it('trims and collapses whitespace, and treats blank as nothing', () => {
    expect(cleanTitle('  Passwordless\n login ')).toBe('Passwordless login');
    expect(cleanTitle('   ')).toBeNull();
  });
});

describe('valuesForChild', () => {
  const epic = item('epic', { sequence: 'a3', values: { [SYSTEM]: ['id/sso'], [TIME]: ['q2'], [SIZE]: ['l'] } });

  it("copies the parent's values on the view's axes, and nothing else", () => {
    const seq: ViewSpec = { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } };
    expect(valuesForChild(epic, seq)).toEqual({ sequence: 'a3', values: { [SYSTEM]: ['id/sso'] } });
    const time: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SIZE, level: 0 } };
    expect(valuesForChild(epic, time)).toEqual({ sequence: null, values: { [TIME]: ['q2'], [SIZE]: ['l'] } });
  });

  it('leaves an axis empty where the parent has no value', () => {
    const seq: ViewSpec = { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } };
    expect(valuesForChild(item('plain'), seq)).toEqual({ sequence: null, values: {} });
  });
});
