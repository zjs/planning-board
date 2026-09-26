import { SEQUENCE, SIZE, SYSTEM, TIME } from '../domain/model.ts';
import type { AxisSpec, ViewSpec } from '../domain/view.ts';

export interface AxisOption {
  id: string;
  label: string;
  /** Header of the holding lane for cards with no value on this axis. */
  none: string;
  axis: AxisSpec;
}

/** The sprint 0 axis choices: top levels only, since zoom is deferred. */
export const AXIS_OPTIONS: AxisOption[] = [
  { id: 'sequence', label: 'Sequence', none: 'No position', axis: { property: SEQUENCE, level: 0 } },
  { id: 'system', label: 'System (area)', none: 'No area', axis: { property: SYSTEM, level: 0 } },
  { id: 'size', label: 'Size', none: 'No size', axis: { property: SIZE, level: 0 } },
  { id: 'time', label: 'Time (quarter)', none: 'No quarter', axis: { property: TIME, level: 0 } },
];

export const DEFAULT_VIEW = { x: 'sequence', y: 'system' };

export type ViewChoice = typeof DEFAULT_VIEW;

export function optionById(id: string): AxisOption {
  return AXIS_OPTIONS.find((o) => o.id === id) ?? AXIS_OPTIONS[0]!;
}

export function toViewSpec(choice: ViewChoice): ViewSpec {
  return { x: optionById(choice.x).axis, y: optionById(choice.y).axis };
}

/** Pick a new axis; choosing the other axis's property swaps the two. */
export function chooseAxis(choice: ViewChoice, which: 'x' | 'y', id: string): ViewChoice {
  const other = which === 'x' ? 'y' : 'x';
  if (choice[other] === id) return { [which]: id, [other]: choice[which] } as ViewChoice;
  return { ...choice, [which]: id };
}

const STORAGE_KEY = 'planning-board:view';

export function loadViewChoice(): ViewChoice {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (
      typeof raw === 'object' && raw !== null &&
      'x' in raw && 'y' in raw &&
      AXIS_OPTIONS.some((o) => o.id === raw.x) && AXIS_OPTIONS.some((o) => o.id === raw.y) &&
      raw.x !== raw.y
    ) {
      return { x: raw.x as string, y: raw.y as string };
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
