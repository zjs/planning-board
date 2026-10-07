import { depthOf } from '../domain/hierarchy.ts';
import { LEVEL, SEQUENCE, SIZE, SYSTEM, TIME, type Plan, type PropertyId, type ValueId } from '../domain/model.ts';
import { propertiesInOrder } from '../domain/properties.ts';
import type { AxisSpec, ViewSpec } from '../domain/view.ts';

export interface AxisOption {
  id: string;
  label: string;
  /** Header of the edge holding lane, for cards with no value on this axis at any level. */
  none: string;
  /** A parent's own lane on a nested axis, for cards with the plain parent value: "No component". */
  parentNone: string;
  axis: AxisSpec;
}

/** "Area" → "area", but "OKR" stays "OKR". */
export const inSentence = (name: string) => (/^[A-Z][a-z]/.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name);

/**
 * Axis choices: one per property in the plan (requirement 1, Q43), so a new
 * custom property is an axis as soon as it exists. A hierarchical property
 * shows its deepest level, with each parent as a band that folds (ADR 0013).
 */
export function axisOptions(plan: Plan): AxisOption[] {
  return propertiesInOrder(plan).map((property): AxisOption => {
    if (property.kind === 'sequence') {
      return { id: SEQUENCE, label: property.name, none: 'No position', parentNone: 'No position', axis: { property: SEQUENCE, level: 0 } };
    }
    const levels = property.levels.length > 0 ? property.levels : [property.name];
    return {
      id: property.id,
      label: property.name,
      none: `No ${inSentence(levels[0]!)}`,
      parentNone: `No ${inSentence(levels[levels.length - 1]!)}`,
      axis: { property: property.id, level: levels.length - 1 },
    };
  });
}

export const DEFAULT_VIEW: ViewChoice = { x: SEQUENCE, y: SYSTEM };

/** A built-in view, one click away (Q52). Viewer state like any choice, not a saved view (requirement 8). */
export interface Preset {
  id: string;
  label: string;
  /** What the view is for, as its tooltip. */
  title: string;
  choice: ViewChoice;
}

export const PRESETS: readonly Preset[] = [
  { id: 'sequence', label: 'Sequence', title: 'What comes before what, by area', choice: { x: SEQUENCE, y: SYSTEM } },
  { id: 'roadmap', label: 'Roadmap', title: 'When each piece lands, by area', choice: { x: TIME, y: SYSTEM } },
  { id: 'sizing', label: 'Sizing', title: 'How big each piece is, by level', choice: { x: SIZE, y: LEVEL } },
  { id: 'structure', label: 'Structure', title: 'Initiatives, epics and stories, by area', choice: { x: LEVEL, y: SYSTEM } },
];

/** The views this plan can show: both of a preset's properties exist. */
export function presetsFor(plan: Plan): Preset[] {
  return PRESETS.filter((preset) => optionById(plan, preset.choice.x) && optionById(plan, preset.choice.y));
}

/** The preset a choice is, if any. A swapped pair is a different view, so it isn't one. */
export function activePreset(choice: ViewChoice): Preset | null {
  return PRESETS.find((preset) => preset.choice.x === choice.x && preset.choice.y === choice.y) ?? null;
}

/** The viewer's axes: a property ID for each. */
export interface ViewChoice {
  x: string;
  y: string;
}

type Which = 'x' | 'y';

export function optionById(plan: Plan, id: string): AxisOption | undefined {
  return axisOptions(plan).find((o) => o.id === id);
}

/** Label and holding-lane headers for an axis. */
export function axisNames(plan: Plan, choice: ViewChoice, which: Which): { label: string; none: string; parentNone: string } {
  const option = optionById(plan, choice[which]);
  return option ?? { label: choice[which], none: 'No value', parentNone: 'No value' };
}

/** The view an (already valid) choice shows. */
export function toViewSpec(plan: Plan, choice: ViewChoice): ViewSpec {
  const spec = (which: Which): AxisSpec => optionById(plan, choice[which])?.axis ?? { property: choice[which], level: 0 };
  return { x: spec('x'), y: spec('y') };
}

/**
 * The choice as this plan can show it. An axis whose property no longer
 * exists falls back (to the default view if it can, otherwise to the first
 * property the other axis isn't using), so a view never shows nothing for
 * no reason. The saved choice itself is left alone, so an undo brings the
 * view back.
 */
export function validChoice(plan: Plan, choice: ViewChoice): ViewChoice {
  const options = axisOptions(plan);
  const find = (id: string) => options.find((o) => o.id === id);
  let { x, y } = choice;
  const pick = (avoid: string | undefined, preferred: string) =>
    find(preferred) && preferred !== avoid ? preferred : (options.find((o) => o.id !== avoid)?.id ?? preferred);
  if (!find(x)) x = pick(y, DEFAULT_VIEW.x === y ? DEFAULT_VIEW.y : DEFAULT_VIEW.x);
  if (!find(y) || y === x) y = pick(x, DEFAULT_VIEW.y === x ? DEFAULT_VIEW.x : DEFAULT_VIEW.y);
  return x === choice.x && y === choice.y ? choice : { x, y };
}

/** Pick a new axis. Choosing the property the other axis shows swaps the two. */
export function chooseAxis(choice: ViewChoice, which: Which, id: string): ViewChoice {
  const other: Which = which === 'x' ? 'y' : 'x';
  if (choice[other] === id) return { ...choice, [which]: id, [other]: choice[which] };
  return { ...choice, [which]: id };
}

export function swapAxes(choice: ViewChoice): ViewChoice {
  return { x: choice.y, y: choice.x };
}

const STORAGE_KEY = 'planning-board:view';

/**
 * Option IDs saved by earlier builds: sprint 1's names, and sprint 2–4's
 * "property:level" (ADR 0013). Each is the property now; `unfolded` says the
 * view showed a level below the top, so its bands open unfolded.
 */
function fromSavedId(id: string): { id: string; unfolded: boolean } {
  if (id === 'component') return { id: SYSTEM, unfolded: true };
  if (id === 'release') return { id: TIME, unfolded: true };
  const match = /^(.*):(\d+)$/.exec(id);
  return match ? { id: match[1]!, unfolded: Number(match[2]) > 0 } : { id, unfolded: false };
}

function readSavedView(): { x: string; y: string } | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof raw === 'object' && raw !== null && 'x' in raw && 'y' in raw && typeof raw.x === 'string' && typeof raw.y === 'string') {
      return { x: raw.x, y: raw.y };
    }
  } catch {
    // Storage can be unavailable (private windows, file:// quirks); fall through.
  }
  return null;
}

/**
 * The remembered choice. It's checked against the plan (validChoice) when
 * shown. A lane zoom saved by an earlier build is dropped.
 */
export function loadViewChoice(): ViewChoice {
  const saved = readSavedView();
  if (!saved) return DEFAULT_VIEW;
  const x = fromSavedId(saved.x).id;
  const y = fromSavedId(saved.y).id;
  return x === y ? DEFAULT_VIEW : { x, y };
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

const COLLAPSED_KEY = 'planning-board:collapsed';
const FOLDING_KEY = 'planning-board:folding';

/**
 * How one property's bands are folded (ADR 0013): all folded or all
 * unfolded, except the bands listed. Folded is the default, so a fresh view
 * looks like the top level. A value added later follows `all`.
 */
export interface Folding {
  all: 'folded' | 'unfolded';
  except: readonly ValueId[];
}

/** Folding per property, so it carries across pivots. Remembered per browser. */
export type Foldings = Readonly<Record<PropertyId, Folding>>;

const FOLDED: Folding = { all: 'folded', except: [] };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * The remembered folding. A browser last used by a sprint 4 build has none
 * yet: an axis it showed below the top level ("System (component)") opens
 * unfolded, keeping the bands it had collapsed folded.
 */
export function loadFoldings(): Foldings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(FOLDING_KEY) ?? 'null');
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      return Object.fromEntries(
        Object.entries(raw).flatMap(([property, f]: [string, unknown]) =>
          typeof f === 'object' && f !== null && 'all' in f && (f.all === 'folded' || f.all === 'unfolded')
            ? [[property, { all: f.all, except: 'except' in f ? strings(f.except) : [] }]]
            : [],
        ),
      );
    }
    const saved = readSavedView();
    if (!saved) return {};
    const collapsed: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '{}');
    const out: Record<PropertyId, Folding> = {};
    for (const id of [saved.x, saved.y]) {
      const { id: property, unfolded } = fromSavedId(id);
      if (!unfolded) continue;
      const old = typeof collapsed === 'object' && collapsed !== null ? (collapsed as Record<string, unknown>)[property] : [];
      out[property] = { all: 'unfolded', except: strings(old) };
    }
    return out;
  } catch {
    return {};
  }
}

export function saveFoldings(foldings: Foldings): void {
  try {
    localStorage.setItem(FOLDING_KEY, JSON.stringify(foldings));
  } catch {
    // A convenience only.
  }
}

/** Fold a band, or unfold it if it's folded. */
export function toggleFold(foldings: Foldings, property: PropertyId, value: ValueId): Foldings {
  const f = foldings[property] ?? FOLDED;
  const except = f.except.includes(value) ? f.except.filter((v) => v !== value) : [...f.except, value];
  return { ...foldings, [property]: { all: f.all, except } };
}

/** Fold all of a property's bands, or unfold them all. */
export function setAllFolded(foldings: Foldings, property: PropertyId, folded: boolean): Foldings {
  return { ...foldings, [property]: { all: folded ? 'folded' : 'unfolded', except: [] } };
}

/**
 * The bands that can fold on an axis: parents above the axis level that
 * have something below them. A parent with nothing below it looks the same
 * either way, so it stays open.
 */
export function foldableBands(plan: Plan, axis: AxisSpec): ValueId[] {
  const property = plan.properties[axis.property];
  if (property?.kind !== 'select' || axis.level === 0) return [];
  const parents = new Set(Object.values(property.values).flatMap((node) => (node.parent === null ? [] : [node.parent])));
  return Object.keys(property.values).filter((id) => parents.has(id) && depthOf(property, id) < axis.level);
}

/** A view with each axis's folded bands. */
export function withFolding(plan: Plan, view: ViewSpec, foldings: Foldings): ViewSpec {
  const axis = (a: AxisSpec): AxisSpec => {
    const bands = foldableBands(plan, a);
    if (bands.length === 0) return a;
    const f = foldings[a.property] ?? FOLDED;
    const collapsed = bands.filter((b) => (f.all === 'folded') !== f.except.includes(b));
    return collapsed.length > 0 ? { ...a, collapsed } : a;
  };
  return { ...view, x: axis(view.x), y: axis(view.y) };
}

const EXPANDED_KEY = 'planning-board:expanded';

function loadIds(key: string): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveIds(key: string, ids: readonly string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // A convenience only.
  }
}

/** Groups expanded in place (Q33). Remembered per browser, like the view. */
export const loadExpanded = () => loadIds(EXPANDED_KEY);
export const saveExpanded = (ids: readonly string[]) => saveIds(EXPANDED_KEY, ids);

