import { describe, expect, it } from 'vitest';
import { edgeSpeed } from './useCardDrag.ts';

describe('edgeSpeed', () => {
  it('scrolls toward an edge the pointer is near, faster closer in', () => {
    expect(edgeSpeed(500, 0, 1000)).toBe(0);
    expect(edgeSpeed(990, 0, 1000)).toBeGreaterThan(edgeSpeed(960, 0, 1000));
    expect(edgeSpeed(960, 0, 1000)).toBeGreaterThan(0);
    expect(edgeSpeed(10, 0, 1000)).toBeLessThan(0);
  });

  it('does nothing once the pointer leaves the range', () => {
    expect(edgeSpeed(1100, 0, 1000)).toBe(0);
    expect(edgeSpeed(-5, 0, 1000)).toBe(0);
  });
});
