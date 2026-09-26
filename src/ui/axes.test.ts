import { describe, expect, it } from 'vitest';
import { chooseAxis } from './axes.ts';

describe('chooseAxis', () => {
  it('sets the chosen axis', () => {
    expect(chooseAxis({ x: 'sequence', y: 'system' }, 'x', 'time')).toEqual({ x: 'time', y: 'system' });
  });

  it("swaps when picking the other axis's property", () => {
    expect(chooseAxis({ x: 'sequence', y: 'system' }, 'x', 'system')).toEqual({ x: 'system', y: 'sequence' });
    expect(chooseAxis({ x: 'sequence', y: 'system' }, 'y', 'sequence')).toEqual({ x: 'system', y: 'sequence' });
  });
});
