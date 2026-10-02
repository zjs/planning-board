import { describe, expect, it } from 'vitest';
import { nearestNeighbors, type Box } from './DependencyLines.tsx';

const box = (x: number, y: number): Box => ({ left: x, right: x + 10, top: y, bottom: y + 10 });

describe('nearestNeighbors (Q45)', () => {
  it('joins every copy, each to the nearest one already joined', () => {
    const a = box(0, 0);
    const b = box(100, 0);
    const c = box(200, 0);
    const d = box(200, 100);
    const pairs = nearestNeighbors([a, b, c, d]);
    // A chain along the row, then down: not a star from the first copy.
    expect(pairs).toEqual([
      [a, b],
      [b, c],
      [c, d],
    ]);
  });

  it('has nothing to join for one copy or none', () => {
    expect(nearestNeighbors([box(0, 0)])).toEqual([]);
    expect(nearestNeighbors([])).toEqual([]);
  });
});
