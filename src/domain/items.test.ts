import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { cleanTitle, deletionOf, valuesForChild, valuesForNewItem } from './items.ts';
import { SEQUENCE, SIZE, SYSTEM, TIME } from './model.ts';
import type { ViewSpec } from './view.ts';

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

  it("takes the zoomed value in a lane-zoomed holding lane, so it stays in view (Q22)", () => {
    const zoomed: ViewSpec = { x: { property: TIME, level: 1, within: 'q1' }, y: { property: SYSTEM, level: 1, within: 'id' } };
    expect(valuesForNewItem(plan(), zoomed, { x: 'q1/r2', y: null })).toEqual({
      sequence: null,
      values: { [TIME]: ['q1/r2'], [SYSTEM]: ['id'] },
    });
    expect(valuesForNewItem(plan(), zoomed, { x: null, y: null }).values).toEqual({ [TIME]: ['q1'], [SYSTEM]: ['id'] });
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
