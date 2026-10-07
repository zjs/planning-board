import { beforeEach, describe, expect, it } from 'vitest';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { withBuiltIns } from '../domain/builtins.ts';
import { SEQUENCE, SYSTEM, TIME, type Plan } from '../domain/model.ts';
import type { ViewLayout } from '../domain/view.ts';
import {
  activePreset,
  axisNames,
  axisOptions,
  chooseAxis,
  dropText,
  foldableBands,
  loadFoldings,
  loadViewChoice,
  presetsFor,
  setAllFolded,
  swapAxes,
  toggleFold,
  unfoldBand,
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

describe('presets (Q52)', () => {
  it('lists the built-in views a plan can show', () => {
    expect(presetsFor(withBuiltIns(p)).map((preset) => preset.label)).toEqual(['Sequence', 'Roadmap', 'Sizing', 'Structure']);
  });

  it('leaves out a view whose property is missing', () => {
    // The tiny plan has no Level, as a plan saved before sprint 4 might not.
    expect(presetsFor(p).map((preset) => preset.id)).toEqual(['sequence', 'roadmap']);
  });

  it('names the preset a choice matches, and no preset for a swapped pair', () => {
    expect(activePreset({ x: TIME, y: SYSTEM })?.id).toBe('roadmap');
    expect(activePreset({ x: SYSTEM, y: TIME })).toBeNull();
    expect(activePreset({ x: SEQUENCE, y: SYSTEM })?.id).toBe('sequence');
  });
});

describe('unfoldBand (Q55)', () => {
  it('unfolds a band that is folded by default, and leaves an unfolded one alone', () => {
    const once = unfoldBand({}, SYSTEM, 'identity');
    expect(once[SYSTEM]).toEqual({ all: 'folded', except: ['identity'] });
    expect(unfoldBand(once, SYSTEM, 'identity')).toBe(once);
  });

  it('unfolds a band folded by hand while the rest are unfolded', () => {
    const f = { [SYSTEM]: { all: 'unfolded' as const, except: ['identity'] } };
    expect(unfoldBand(f, SYSTEM, 'identity')[SYSTEM]).toEqual({ all: 'unfolded', except: [] });
  });
});

describe('dropText (Q54)', () => {
  const names = { x: { none: 'No quarter', parentNone: 'No release' }, y: { none: 'No area', parentNone: 'No component' } };
  const layout = {
    columns: [{ key: 'q1', label: 'Q1 2027', kind: 'collapsed' }, { key: 'r1', label: '27.1' }, { key: 'q2', label: 'Q2 2027', kind: 'parent' }],
    rows: [{ key: 'billing', label: 'Billing' }],
    gaps: { x: null, y: null },
  } as unknown as ViewLayout;

  it('names the column, then the row', () => {
    expect(dropText(layout, { x: 'r1', y: 'billing' }, names)).toBe('27.1 · Billing');
    expect(dropText(layout, { x: 'q1', y: 'billing' }, names)).toBe('Q1 2027 · Billing');
  });

  it('names a holding lane by what it lacks, and a parent lane by its parent', () => {
    expect(dropText(layout, { x: null, y: 'billing' }, names)).toBe('No quarter · Billing');
    expect(dropText(layout, { x: 'q2', y: null }, names)).toBe('Q2 2027, no release · No area');
  });

  it('says nothing for a sequence column, and "a new position" for a gap', () => {
    const seq = { columns: [{ key: 'a0', label: null }], rows: layout.rows, gaps: { x: ['Zz', 'a1'], y: null } } as unknown as ViewLayout;
    expect(dropText(seq, { x: 'a0', y: 'billing' }, names)).toBe('Billing');
    expect(dropText(seq, { x: 'a1', y: 'billing' }, names)).toBe('a new position · Billing');
  });
});
