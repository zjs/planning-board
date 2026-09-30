import { SEQUENCE, SYSTEM, TIME, type Plan } from '../domain/model.ts';
import { propertiesInOrder } from '../domain/properties.ts';
import type { AxisSpec, ViewSpec } from '../domain/view.ts';

export interface AxisOption {
  id: string;
  label: string;
  /** Header of the holding lane for cards with no value on this axis. */
  none: string;
  axis: AxisSpec;
}

/** An option's ID: the property's ID at its top level, "property:level" below that. */
export const optionId = (property: string, level: number) => (level === 0 ? property : `${property}:${level}`);

/** "Area" → "area", but "OKR" stays "OKR". */
export const inSentence = (name: string) => (/^[A-Z][a-z]/.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name);

/**
 * Axis choices: every level of every property in the plan (requirement 1),
 * so a new custom property is an axis as soon as it exists.
 */
export function axisOptions(plan: Plan): AxisOption[] {
  return propertiesInOrder(plan).flatMap((property): AxisOption[] => {
    if (property.kind === 'sequence') {
      return [{ id: SEQUENCE, label: property.name, none: 'No position', axis: { property: SEQUENCE, level: 0 } }];
    }
    const levels = property.levels.length > 0 ? property.levels : [property.name];
    return levels.map((level, i) => ({
      id: optionId(property.id, i),
      label: levels.length > 1 ? `${property.name} (${inSentence(level)})` : property.name,
      none: `No ${inSentence(level)}`,
      axis: { property: property.id, level: i },
    }));
  });
}

export const DEFAULT_VIEW: ViewChoice = { x: SEQUENCE, y: SYSTEM };

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

export function optionById(plan: Plan, id: string): AxisOption | undefined {
  return axisOptions(plan).find((o) => o.id === id);
}

/** The option an axis shows as: one level down when lane-zoomed. Expects a validChoice. */
function shownOption(plan: Plan, choice: ViewChoice, which: Which): AxisOption | undefined {
  const option = optionById(plan, choice[which]);
  if (!option || !choice[withinKey(which)]) return option;
  return optionById(plan, optionId(option.axis.property, option.axis.level + 1)) ?? option;
}

/** Label and holding-lane header for an axis, as currently shown. */
export function axisNames(plan: Plan, choice: ViewChoice, which: Which): { label: string; none: string } {
  const option = shownOption(plan, choice, which);
  return option ? { label: option.label, none: option.none } : { label: choice[which], none: 'No value' };
}

/** The view an (already valid) choice shows. */
export function toViewSpec(plan: Plan, choice: ViewChoice): ViewSpec {
  const spec = (which: Which): AxisSpec => {
    const within = choice[withinKey(which)];
    const axis = optionById(plan, choice[which])?.axis ?? { property: choice[which], level: 0 };
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
  const option = optionById(plan, choice[which]);
  if (!option) return false;
  const property = plan.properties[option.axis.property];
  if (property?.kind !== 'select' || option.axis.level + 1 >= property.levels.length) return false;
  return Object.values(property.values).some((node) => node.parent === value);
}

export function zoomLane(choice: ViewChoice, which: Which, value: string | null): ViewChoice {
  return { ...choice, [withinKey(which)]: value };
}

/**
 * The choice as this plan can show it. An axis whose property or level no
 * longer exists falls back (to the default view if it can, otherwise to the
 * first property the other axis isn't using), and a lane zoom whose value
 * was deleted is dropped, so a view never shows nothing for no reason. The
 * saved choice itself is left alone, so an undo brings the view back.
 */
export function validChoice(plan: Plan, choice: ViewChoice): ViewChoice {
  const options = axisOptions(plan);
  const find = (id: string) => options.find((o) => o.id === id);
  const propertyOf = (id: string) => find(id)?.axis.property;
  let { x, y } = choice;
  const pick = (avoid: string | undefined, preferred: string) =>
    find(preferred) && propertyOf(preferred) !== avoid
      ? preferred
      : (options.find((o) => o.axis.property !== avoid)?.id ?? preferred);
  if (!find(x)) x = pick(propertyOf(y), DEFAULT_VIEW.x === y ? DEFAULT_VIEW.y : DEFAULT_VIEW.x);
  if (!find(y) || propertyOf(y) === propertyOf(x)) y = pick(propertyOf(x), DEFAULT_VIEW.y === x ? DEFAULT_VIEW.x : DEFAULT_VIEW.y);
  const check = (which: Which, id: string) => {
    const within = choice[withinKey(which)];
    if (!within || id !== choice[which]) return null;
    const property = plan.properties[propertyOf(id) ?? ''];
    return property?.kind === 'select' && property.values[within] ? within : null;
  };
  const xWithin = check('x', x);
  const yWithin = check('y', y);
  return x === choice.x && y === choice.y && xWithin === (choice.xWithin ?? null) && yWithin === (choice.yWithin ?? null)
    ? choice
    : { x, y, xWithin, yWithin };
}

/**
 * Pick a new axis, which clears that axis's lane zoom. Choosing a property
 * the other axis already shows, at any level, swaps the two.
 */
export function chooseAxis(plan: Plan, choice: ViewChoice, which: Which, id: string): ViewChoice {
  const other: Which = which === 'x' ? 'y' : 'x';
  if (optionById(plan, choice[other])?.axis.property === optionById(plan, id)?.axis.property) {
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

/** Option IDs saved by sprint 1 builds, before axis options came from the plan. */
const LEGACY_IDS: Record<string, string> = { component: optionId(SYSTEM, 1), release: optionId(TIME, 1) };

/** The remembered choice. It's checked against the plan (validChoice) when shown. */
export function loadViewChoice(): ViewChoice {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof raw === 'object' && raw !== null && 'x' in raw && 'y' in raw) {
      const str = (v: unknown) => (typeof v === 'string' ? v : null);
      const id = (v: unknown) => {
        const s = str(v);
        return s === null ? null : (LEGACY_IDS[s] ?? s);
      };
      const x = id(raw.x);
      const y = id(raw.y);
      if (x !== null && y !== null && x !== y) {
        return {
          x,
          y,
          xWithin: 'xWithin' in raw ? str(raw.xWithin) : null,
          yWithin: 'yWithin' in raw ? str(raw.yWithin) : null,
        };
      }
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
