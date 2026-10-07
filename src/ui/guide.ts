// The guided start (questions.md Q53): someone with a new idea and an empty
// board is walked through the journey the board is for. Dump ideas, make a
// place for them, sort them, see the same cards another way, and group them.
// Each step is done by doing it, so progress is read from the plan itself,
// never from clicks on the guide. Whether the guide is running is viewer
// state, remembered per browser.

import { itemValues, SIZE, SYSTEM, type Plan } from '../domain/model.ts';

export type StepId = 'dump' | 'area' | 'sort' | 'view' | 'group';

export interface GuideStep {
  id: StepId;
  title: string;
  done: (plan: Plan) => boolean;
}

/** How many ideas count as a brain dump. */
export const DUMP_SIZE = 3;

const items = (plan: Plan) => Object.values(plan.items);

export const STEPS: readonly GuideStep[] = [
  { id: 'dump', title: 'Get your ideas down', done: (plan) => items(plan).length >= DUMP_SIZE },
  {
    id: 'area',
    title: 'Make a place for them',
    done: (plan) => {
      const system = plan.properties[SYSTEM];
      return system?.kind === 'select' && Object.keys(system.values).length > 0;
    },
  },
  { id: 'sort', title: 'Sort them', done: (plan) => items(plan).some((item) => itemValues(item, SYSTEM).length > 0) },
  { id: 'view', title: 'See them another way', done: (plan) => items(plan).some((item) => itemValues(item, SIZE).length > 0) },
  { id: 'group', title: 'Group them', done: (plan) => items(plan).some((item) => item.parent !== null && plan.items[item.parent]) },
];

/** The first step not done yet, or null when every step is. */
export function currentStep(plan: Plan): GuideStep | null {
  return STEPS.find((step) => !step.done(plan)) ?? null;
}

/** Steps done so far, in order: a step only counts once the ones before it are done, so the list never skips. */
export function stepsDone(plan: Plan): number {
  const at = STEPS.findIndex((step) => !step.done(plan));
  return at === -1 ? STEPS.length : at;
}

/** Running, finished, or skipped. Absent until someone starts a blank plan. */
export type GuideState = 'running' | 'finished' | 'skipped';

const KEY = 'planning-board:guide';

export function loadGuide(): GuideState | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'running' || value === 'finished' || value === 'skipped' ? value : null;
  } catch {
    return null;
  }
}

export function saveGuide(state: GuideState): void {
  try {
    localStorage.setItem(KEY, state);
  } catch {
    // The guide is a convenience: without storage it runs again next time.
  }
}

/** A blank plan offers the guide unless it has been finished or skipped in this browser. */
export const offersGuide = (state: GuideState | null) => state === null || state === 'running';
