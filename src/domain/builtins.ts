// Built-in properties added after sprint 0, and filling them in on plans
// saved before they existed. Card levels (questions.md Q32) are the first.

import { valuesAtLevel } from './hierarchy.ts';
import type { Item, Plan, SelectProperty } from './model.ts';
import { itemValues, LEVEL, SEQUENCE, SIZE, SYSTEM, TIME } from './model.ts';

/** Card levels, top down (Q32). Renamable and reorderable like Size; these are the defaults. */
export const LEVELS = [
  { id: 'initiative', label: 'Initiative' },
  { id: 'epic', label: 'Epic' },
  { id: 'story', label: 'Story' },
] as const;

export type LevelId = (typeof LEVELS)[number]['id'];

/** Sizes, smallest first. Renamable and reorderable; these are the defaults. */
export const SIZES = [
  { id: 'xs', label: 'XS' },
  { id: 's', label: 'S' },
  { id: 'm', label: 'M' },
  { id: 'l', label: 'L' },
  { id: 'xl', label: 'XL' },
] as const;

export type SizeId = (typeof SIZES)[number]['id'];

/** The levels of the two built-in hierarchies, as a new plan or an import names them. */
export const SYSTEM_LEVELS = ['Area', 'Component'];
export const TIME_LEVELS = ['Quarter', 'Release'];

function flatProperty(id: string, name: string, values: readonly { id: string; label: string }[]): SelectProperty {
  return {
    kind: 'select',
    id,
    name,
    levels: [name],
    multi: false,
    values: Object.fromEntries(values.map((v, i) => [v.id, { id: v.id, label: v.label, parent: null, order: `a${i}` }])),
  };
}

/** The Level property as a new plan gets it. */
export function levelProperty(): SelectProperty {
  return flatProperty(LEVEL, 'Level', LEVELS);
}

/**
 * A plan to start from scratch (questions.md Q51): every built-in property,
 * and no cards. Size and Level have their usual values. System and Time have
 * none, because areas and quarters belong to the plan, not to the tool.
 */
export function blankPlan(): Plan {
  return {
    properties: {
      [SEQUENCE]: { kind: 'sequence', id: SEQUENCE, name: 'Sequence' },
      [SYSTEM]: { kind: 'select', id: SYSTEM, name: 'System', levels: [...SYSTEM_LEVELS], multi: true, values: {} },
      [LEVEL]: levelProperty(),
      [SIZE]: flatProperty(SIZE, 'Size', SIZES),
      [TIME]: { kind: 'select', id: TIME, name: 'Time', levels: [...TIME_LEVELS], multi: false, values: {} },
    },
    items: {},
    dependencies: [],
  };
}

/**
 * A plan with every built-in property, for plans saved before one existed.
 * An empty board (no properties at all) stays empty. Cards get no values:
 * no level means "not decided yet".
 */
export function withBuiltIns(plan: Plan): Plan {
  if (Object.keys(plan.properties).length === 0 || plan.properties[LEVEL]) return plan;
  return { ...plan, properties: { ...plan.properties, [LEVEL]: levelProperty() } };
}

/**
 * Jira's Issue Type as a level (Q32): Initiative, Epic, and the usual
 * work-item types as Story. Anything else, such as a custom type, gets no level.
 */
export function levelForIssueType(type: string): LevelId | null {
  const t = type.trim().toLowerCase();
  if (t === 'initiative') return 'initiative';
  if (t === 'epic') return 'epic';
  if (['story', 'task', 'bug', 'sub-task', 'subtask'].includes(t)) return 'story';
  return null;
}

/**
 * How much heavier a card's border is, so levels read across the board:
 * 0 for the lowest level or no level, rising by one per level above it.
 */
export function levelWeight(plan: Plan, item: Item): number {
  const property = plan.properties[LEVEL];
  if (property?.kind !== 'select') return 0;
  const ranks = valuesAtLevel(property, 0).map((node) => node.id);
  const rank = ranks.indexOf(itemValues(item, LEVEL)[0] ?? '');
  return rank < 0 ? 0 : ranks.length - 1 - rank;
}
