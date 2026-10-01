// Built-in properties added after sprint 0, and filling them in on plans
// saved before they existed. Card levels (questions.md Q32) are the first.

import { valuesAtLevel } from './hierarchy.ts';
import type { Item, Plan, SelectProperty } from './model.ts';
import { itemValues, LEVEL } from './model.ts';

/** Card levels, top down (Q32). Renamable and reorderable like Size; these are the defaults. */
export const LEVELS = [
  { id: 'initiative', label: 'Initiative' },
  { id: 'epic', label: 'Epic' },
  { id: 'story', label: 'Story' },
] as const;

export type LevelId = (typeof LEVELS)[number]['id'];

/** The Level property as a new plan gets it. */
export function levelProperty(): SelectProperty {
  return {
    kind: 'select',
    id: LEVEL,
    name: 'Level',
    levels: ['Level'],
    multi: false,
    values: Object.fromEntries(LEVELS.map((l, i) => [l.id, { id: l.id, label: l.label, parent: null, order: `a${i}` }])),
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
