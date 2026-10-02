import { beforeEach, describe, expect, it } from 'vitest';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { SEQUENCE, SYSTEM, TIME, type Plan } from '../domain/model.ts';
import {
  axisNames,
  axisOptions,
  chooseAxis,
  foldableBands,
  loadFoldings,
  loadViewChoice,
  setAllFolded,
  swapAxes,
  toggleFold,
  toViewSpec,
  validChoice,
  withFolding,
} from './axes.ts';

const p = plan(item('a'));

function withTeam(base: Plan): Plan {
  return {
    ...base,
    properties: {
      ...base.properties,
      pteam: { kind: 'select', id: 'pteam', name: 'Team', levels: ['Team'], multi: false, values: {} },
      pokr: { kind: 'select', id: 'pokr', name: 'OKR', levels: ['OKR'], multi: true, values: {} },
    },
  };
}

describe('axisOptions (Q43)', () => {
  it('offers one choice per property, at its deepest level: built-ins first, then custom properties by name', () => {
    expect(axisOptions(withTeam(p)).map((o) => [o.id, o.label, o.none, o.parentNone, o.axis.level])).toEqual([
      ['sequence', 'Sequence', 'No position', 'No position', 0],
      ['system', 'System', 'No area', 'No component', 1],
      ['size', 'Size', 'No size', 'No size', 0],
      ['time', 'Time', 'No quarter', 'No release', 1],
      ['pokr', 'OKR', 'No OKR', 'No OKR', 0],
      ['pteam', 'Team', 'No team', 'No team', 0],
    ]);
  });
});

describe('chooseAxis', () => {
  it('sets the chosen axis', () => {
    expect(chooseAxis({ x: 'sequence', y: 'system' }, 'x', 'time')).toEqual({ x: 'time', y: 'system' });
  });

  it("swaps when picking the other axis's property", () => {
    expect(chooseAxis({ x: 'sequence', y: 'system' }, 'x', 'system')).toEqual({ x: 'system', y: 'sequence' });
    expect(chooseAxis({ x: 'sequence', y: 'system' }, 'y', 'sequence')).toEqual({ x: 'system', y: 'sequence' });
    expect(swapAxes({ x: 'time', y: 'system' })).toEqual({ x: 'system', y: 'time' });
  });
});

describe('validChoice', () => {
  it('shows a custom property as an axis', () => {
    const choice = { x: 'pteam', y: 'time' };
    expect(validChoice(withTeam(p), choice)).toBe(choice);
    expect(toViewSpec(withTeam(p), choice)).toEqual({ x: { property: 'pteam', level: 0 }, y: { property: TIME, level: 1 } });
    expect(axisNames(p, choice, 'y')).toMatchObject({ label: 'Time', none: 'No quarter', parentNone: 'No release' });
  });

  it('falls back when a property is gone, and never shows one property on both axes', () => {
    expect(validChoice(p, { x: 'pteam', y: 'system' })).toEqual({ x: 'sequence', y: 'system' });
    expect(validChoice(p, { x: 'system', y: 'pteam' })).toEqual({ x: 'system', y: 'sequence' });
    expect(validChoice(p, { x: 'gone', y: 'gone' })).toEqual({ x: 'sequence', y: 'system' });
    expect(validChoice(p, { x: 'system', y: 'system' })).toEqual({ x: 'system', y: 'sequence' });
  });
});

describe('folding (ADR 0013)', () => {
  const view = toViewSpec(p, { x: TIME, y: SYSTEM });

  it('folds every band with something below it by default', () => {
    expect(foldableBands(p, view.y).sort()).toEqual(['id', 'pay']);
    expect(foldableBands(p, { property: 'size', level: 0 })).toEqual([]);
    const folded = withFolding(p, view, {});
    expect([...folded.y.collapsed!].sort()).toEqual(['id', 'pay']);
    expect([...folded.x.collapsed!].sort()).toEqual(['q1', 'q2']);
  });

  it('unfolds one band, all of them, and folds them all again, per property', () => {
    let f = toggleFold({}, SYSTEM, 'id');
    expect(withFolding(p, view, f).y.collapsed).toEqual(['pay']);
    f = setAllFolded(f, SYSTEM, false);
    expect(withFolding(p, view, f).y.collapsed).toBeUndefined();
    f = toggleFold(f, SYSTEM, 'pay');
    expect(withFolding(p, view, f).y.collapsed).toEqual(['pay']);
    // Time keeps its own default.
    expect(withFolding(p, view, f).x.collapsed).toHaveLength(2);
    f = setAllFolded(f, SYSTEM, true);
    expect([...withFolding(p, view, f).y.collapsed!].sort()).toEqual(['id', 'pay']);
  });
});

/** A browser's localStorage, for the loaders. */
function fakeStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    clear: () => data.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

describe('views saved by earlier builds', () => {
  beforeEach(fakeStorage);

  it('open as the property, and a level below the top opens unfolded with its collapsed bands still folded', () => {
    localStorage.setItem('planning-board:view', JSON.stringify({ x: 'time', y: 'system:1', yWithin: 'id' }));
    localStorage.setItem('planning-board:collapsed', JSON.stringify({ system: ['pay'] }));
    expect(loadViewChoice()).toEqual({ x: 'time', y: 'system' });
    expect(loadFoldings()).toEqual({ system: { all: 'unfolded', except: ['pay'] } });
  });

  it("sprint 1's names still work", () => {
    localStorage.setItem('planning-board:view', JSON.stringify({ x: 'release', y: 'component' }));
    expect(loadViewChoice()).toEqual({ x: TIME, y: SYSTEM });
    expect(loadFoldings()).toEqual({ [TIME]: { all: 'unfolded', except: [] }, [SYSTEM]: { all: 'unfolded', except: [] } });
  });

  it('a top-level view opens folded, and saved folding wins once there is some', () => {
    localStorage.setItem('planning-board:view', JSON.stringify({ x: SEQUENCE, y: 'system' }));
    expect(loadFoldings()).toEqual({});
    localStorage.setItem('planning-board:folding', JSON.stringify({ system: { all: 'unfolded', except: ['id'] } }));
    expect(loadFoldings()).toEqual({ system: { all: 'unfolded', except: ['id'] } });
  });
});
