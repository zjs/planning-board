import { SEQUENCE, SIZE, SYSTEM, TIME, type Plan } from '../domain/model.ts';
import type { AxisSpec, ViewSpec } from '../domain/view.ts';

export interface AxisOption {
  id: string;
  label: string;
  /** Header of the holding lane for cards with no value on this axis. */
  none: string;
  axis: AxisSpec;
}

/** Axis choices: every level of the built-in hierarchies (requirement 1). */
export const AXIS_OPTIONS: AxisOption[] = [
  { id: 'sequence', label: 'Sequence', none: 'No position', axis: { property: SEQUENCE, level: 0 } },
  { id: 'system', label: 'System (area)', none: 'No area', axis: { property: SYSTEM, level: 0 } },
  { id: 'component', label: 'System (component)', none: 'No component', axis: { property: SYSTEM, level: 1 } },
  { id: 'size', label: 'Size', none: 'No size', axis: { property: SIZE, level: 0 } },
  { id: 'time', label: 'Time (quarter)', none: 'No quarter', axis: { property: TIME, level: 0 } },
  { id: 'release', label: 'Time (release)', none: 'No release', axis: { property: TIME, level: 1 } },
];

export const DEFAULT_VIEW: ViewChoice = { x: 'sequence', y: 'system' };

/**
 * The viewer's axes, plus any lane zoom on each (requirement 7): `xWithin`
 * is the column value zoomed into, shown one level down.
 */
export interface ViewChoice {
  x: string;
  y: string;
  xWithin?: string | null;
  yWithin?: string | null;
}

type Which = 'x' | 'y';
const withinKey = (which: Which) => (which === 'x' ? 'xWithin' : 'yWithin');

export function optionById(id: string): AxisOption {
  return AXIS_OPTIONS.find((o) => o.id === id) ?? AXIS_OPTIONS[0]!;
}

/** The option an axis shows as: one level down when lane-zoomed. */
function shownOption(choice: ViewChoice, which: Which): AxisOption {
  const option = optionById(choice[which]);
  if (!choice[withinKey(which)]) return option;
  return (
    AXIS_OPTIONS.find((o) => o.axis.property === option.axis.property && o.axis.level === option.axis.level + 1) ??
    option
  );
}

/** Label and holding-lane header for an axis, as currently shown. */
export function axisNames(choice: ViewChoice, which: Which): { label: string; none: string } {
  const { label, none } = shownOption(choice, which);
  return { label, none };
}

export function toViewSpec(choice: ViewChoice): ViewSpec {
  const spec = (which: Which): AxisSpec => {
    const within = choice[withinKey(which)];
    const axis = optionById(choice[which]).axis;
    return within ? { ...axis, level: axis.level + 1, within } : axis;
  };
  return { x: spec('x'), y: spec('y') };
}

/**
 * Whether a lane can be zoomed into: a hierarchy with a level below this
 * one, a value that has something below it, and no lane zoom on the axis yet.
 */
export function canZoomLane(plan: Plan, choice: ViewChoice, which: Which, value: string): boolean {
  if (choice[withinKey(which)]) return false;
  const { property: id, level } = optionById(choice[which]).axis;
  const property = plan.properties[id];
  if (property?.kind !== 'select' || level + 1 >= property.levels.length) return false;
  return Object.values(property.values).some((node) => node.parent === value);
}

export function zoomLane(choice: ViewChoice, which: Which, value: string | null): ViewChoice {
  return { ...choice, [withinKey(which)]: value };
}

/** Drop a lane zoom whose value no longer exists, so a view never shows nothing for no reason. */
export function validChoice(plan: Plan, choice: ViewChoice): ViewChoice {
  const check = (which: Which) => {
    const within = choice[withinKey(which)];
    if (!within) return null;
    const property = plan.properties[optionById(choice[which]).axis.property];
    return property?.kind === 'select' && property.values[within] ? within : null;
  };
  const xWithin = check('x');
  const yWithin = check('y');
  return xWithin === (choice.xWithin ?? null) && yWithin === (choice.yWithin ?? null)
    ? choice
    : { ...choice, xWithin, yWithin };
}

/**
 * Pick a new axis, which clears that axis's lane zoom. Choosing a property
 * the other axis already shows, at any level, swaps the two.
 */
export function chooseAxis(choice: ViewChoice, which: Which, id: string): ViewChoice {
  const other: Which = which === 'x' ? 'y' : 'x';
  if (optionById(choice[other]).axis.property === optionById(id).axis.property) {
    // The other axis takes over this one's property and lane zoom.
    return {
      ...choice,
      [which]: id,
      [other]: choice[which],
      [withinKey(which)]: null,
      [withinKey(other)]: choice[withinKey(which)] ?? null,
    };
  }
  return { ...choice, [which]: id, [withinKey(which)]: null };
}

export function swapAxes(choice: ViewChoice): ViewChoice {
  return { x: choice.y, y: choice.x, xWithin: choice.yWithin ?? null, yWithin: choice.xWithin ?? null };
}

const STORAGE_KEY = 'planning-board:view';

export function loadViewChoice(): ViewChoice {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (
      typeof raw === 'object' && raw !== null &&
      'x' in raw && 'y' in raw &&
      AXIS_OPTIONS.some((o) => o.id === raw.x) && AXIS_OPTIONS.some((o) => o.id === raw.y) &&
      optionById(raw.x as string).axis.property !== optionById(raw.y as string).axis.property
    ) {
      const str = (v: unknown) => (typeof v === 'string' ? v : null);
      return {
        x: raw.x as string,
        y: raw.y as string,
        xWithin: 'xWithin' in raw ? str(raw.xWithin) : null,
        yWithin: 'yWithin' in raw ? str(raw.yWithin) : null,
      };
    }
  } catch {
    // Storage can be unavailable (private windows, file:// quirks); fall through.
  }
  return DEFAULT_VIEW;
}

export function saveViewChoice(choice: ViewChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Remembering the view is a convenience only.
  }
}

const COMPACT_KEY = 'planning-board:holding-chips';

/** Whether holding lanes show chips instead of full cards. Remembered per browser. */
export function loadCompactHolding(): boolean {
  try {
    return localStorage.getItem(COMPACT_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveCompactHolding(compact: boolean): void {
  try {
    localStorage.setItem(COMPACT_KEY, compact ? '1' : '0');
  } catch {
    // A convenience only.
  }
}

const ZOOM_KEY = 'planning-board:zoom';

/** The path of cards zoomed into, top first (ADR 0008). Remembered per browser, like the axes. */
export function loadZoomPath(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(ZOOM_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function saveZoomPath(path: readonly string[]): void {
  try {
    localStorage.setItem(ZOOM_KEY, JSON.stringify(path));
  } catch {
    // A convenience only.
  }
}
