// Reads the human-editable plan JSON format (version 1) into a Plan snapshot.
// The format is described in docs/decisions/0005-plan-file-format.md.

import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import type { Dependency, Item, OrderKey, Plan, Property, SelectProperty, ValueNode } from './model.ts';
import { SEQUENCE } from './model.ts';

export const PLAN_FORMAT = 'planning-board';
export const PLAN_VERSION = 1;

export interface ValueJson {
  id: string;
  label: string;
  children?: ValueJson[];
}

export interface PropertyJson {
  id: string;
  name: string;
  levels: string[];
  multi?: boolean;
  values: ValueJson[];
}

export interface ItemJson {
  id: string;
  title: string;
  description?: string;
  parent?: string | null;
  /** An OrderKey string, or a plain number for hand-written files. Items with equal numbers share a column. */
  sequence?: string | number | null;
  values?: Record<string, string | string[]>;
}

export interface PlanJson {
  format: typeof PLAN_FORMAT;
  version: typeof PLAN_VERSION;
  properties: PropertyJson[];
  items: ItemJson[];
  /** [prerequisite, dependent] pairs: the first must come before the second. */
  dependencies?: [string, string][];
}

export type ParseResult = { ok: true; plan: Plan } | { ok: false; errors: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';

/**
 * Parse and validate plan JSON. Collects every problem it finds rather than
 * stopping at the first, so a hand-edited file can be fixed in one pass.
 */
export function parsePlanJson(input: unknown): ParseResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['plan must be a JSON object'] };
  if (input.format !== PLAN_FORMAT) errors.push(`format must be "${PLAN_FORMAT}"`);
  if (input.version !== PLAN_VERSION) {
    return { ok: false, errors: [...errors, `unsupported version ${String(input.version)}; expected ${PLAN_VERSION}`] };
  }

  const properties: Record<string, Property> = {
    [SEQUENCE]: { kind: 'sequence', id: SEQUENCE, name: 'Sequence' },
  };
  if (!Array.isArray(input.properties)) errors.push('properties must be an array');
  for (const [i, raw] of (Array.isArray(input.properties) ? input.properties : []).entries()) {
    const property = parseProperty(raw, `properties[${i}]`, errors);
    if (!property) continue;
    if (properties[property.id]) errors.push(`properties[${i}]: duplicate property id "${property.id}"`);
    else properties[property.id] = property;
  }

  const items: Record<string, Item> = {};
  const rawSequence = new Map<string, string | number>();
  if (!Array.isArray(input.items)) errors.push('items must be an array');
  for (const [i, raw] of (Array.isArray(input.items) ? input.items : []).entries()) {
    const path = `items[${i}]`;
    if (!isRecord(raw) || !isString(raw.id) || !isString(raw.title)) {
      errors.push(`${path}: needs string "id" and "title"`);
      continue;
    }
    if (items[raw.id]) {
      errors.push(`${path}: duplicate item id "${raw.id}"`);
      continue;
    }
    const item: Item = {
      id: raw.id,
      title: raw.title,
      description: isString(raw.description) ? raw.description : '',
      parent: isString(raw.parent) ? raw.parent : null,
      sequence: null,
      values: {},
    };
    if (typeof raw.sequence === 'number' && Number.isFinite(raw.sequence)) rawSequence.set(item.id, raw.sequence);
    else if (typeof raw.sequence === 'string') {
      if (isOrderKey(raw.sequence)) rawSequence.set(item.id, raw.sequence);
      else errors.push(`${path}.sequence: "${raw.sequence}" is not a valid order key`);
    } else if (raw.sequence != null) errors.push(`${path}.sequence: must be a string, number, or null`);
    if (raw.values !== undefined && !isRecord(raw.values)) errors.push(`${path}.values: must be an object`);
    for (const [propertyId, value] of Object.entries(isRecord(raw.values) ? raw.values : {})) {
      const property = properties[propertyId];
      const ids = isString(value) ? [value] : Array.isArray(value) && value.every(isString) ? value : null;
      if (!property || property.kind !== 'select') errors.push(`${path}.values: unknown property "${propertyId}"`);
      else if (!ids) errors.push(`${path}.values.${propertyId}: must be a value id or an array of them`);
      else if (ids.length > 1 && !property.multi) errors.push(`${path}.values.${propertyId}: property holds one value`);
      else {
        for (const id of ids) {
          if (!property.values[id]) errors.push(`${path}.values.${propertyId}: unknown value "${id}"`);
        }
        item.values[propertyId] = [...new Set(ids)];
      }
    }
    items[item.id] = item;
  }

  const kinds = new Set([...rawSequence.values()].map((v) => typeof v));
  if (kinds.size > 1) errors.push('sequence: use either numbers or order keys throughout, not both');
  assignSequenceKeys(items, rawSequence);

  for (const item of Object.values(items)) {
    if (item.parent !== null && !items[item.parent]) {
      errors.push(`item "${item.id}": unknown parent "${item.parent}"`);
    }
  }
  for (const item of Object.values(items)) {
    if (hasParentCycle(items, item.id)) errors.push(`item "${item.id}": parent chain loops back to itself`);
  }

  const dependencies: Dependency[] = [];
  const rawDeps = input.dependencies ?? [];
  if (!Array.isArray(rawDeps)) errors.push('dependencies must be an array');
  for (const [i, pair] of (Array.isArray(rawDeps) ? rawDeps : []).entries()) {
    const [from, to] = Array.isArray(pair) && pair.length === 2 ? (pair as unknown[]) : [];
    if (!isString(from) || !isString(to)) {
      errors.push(`dependencies[${i}]: must be a [prerequisite, dependent] pair of item ids`);
      continue;
    }
    if (!items[from] || !items[to]) errors.push(`dependencies[${i}]: unknown item in ["${from}", "${to}"]`);
    else if (from === to) errors.push(`dependencies[${i}]: an item can't depend on itself`);
    else dependencies.push({ from, to });
  }

  return errors.length ? { ok: false, errors } : { ok: true, plan: { properties, items, dependencies } };
}

function parseProperty(raw: unknown, path: string, errors: string[]): SelectProperty | null {
  if (!isRecord(raw) || !isString(raw.id) || !isString(raw.name)) {
    errors.push(`${path}: needs string "id" and "name"`);
    return null;
  }
  if (raw.id === SEQUENCE) {
    errors.push(`${path}: "${SEQUENCE}" is built in and can't be redefined`);
    return null;
  }
  const levels: unknown = raw.levels;
  if (!Array.isArray(levels) || levels.length === 0 || !levels.every(isString)) {
    errors.push(`${path}.levels: must be a non-empty array of names`);
    return null;
  }
  const values: Record<string, ValueNode> = {};
  const walk = (list: unknown, parent: string | null, depth: number, at: string) => {
    if (!Array.isArray(list)) {
      errors.push(`${at}: must be an array`);
      return;
    }
    const keys = generateNKeysBetween(null, null, list.length);
    list.forEach((node, i) => {
      const nodePath = `${at}[${i}]`;
      if (!isRecord(node) || !isString(node.id) || !isString(node.label)) {
        errors.push(`${nodePath}: needs string "id" and "label"`);
        return;
      }
      if (values[node.id]) errors.push(`${nodePath}: duplicate value id "${node.id}"`);
      if (depth >= levels.length) errors.push(`${nodePath}: deeper than the ${levels.length} declared levels`);
      values[node.id] = { id: node.id, label: node.label, parent, order: keys[i]! };
      if (node.children !== undefined) walk(node.children, node.id, depth + 1, `${nodePath}.children`);
    });
  };
  walk(raw.values, null, 0, `${path}.values`);
  return {
    kind: 'select',
    id: raw.id,
    name: raw.name,
    levels,
    multi: raw.multi === true,
    values,
  };
}

/**
 * String sequences are kept as-is. Numbers are ranked and turned into
 * fractional keys, so equal numbers share a column and gaps close up.
 */
function assignSequenceKeys(items: Record<string, Item>, raw: Map<string, string | number>) {
  const numbers = [...new Set([...raw.values()].filter((v): v is number => typeof v === 'number'))].sort(
    (a, b) => a - b,
  );
  const keys = generateNKeysBetween(null, null, numbers.length);
  const keyFor = new Map<number, OrderKey>(numbers.map((n, i) => [n, keys[i]!]));
  for (const [id, value] of raw) {
    const item = items[id];
    if (item) item.sequence = typeof value === 'number' ? keyFor.get(value)! : value;
  }
}

function isOrderKey(key: string): boolean {
  try {
    generateKeyBetween(key, null);
    return true;
  } catch {
    return false;
  }
}

function hasParentCycle(items: Record<string, Item>, start: string): boolean {
  const seen = new Set<string>();
  let current: string | null = start;
  while (current !== null) {
    if (seen.has(current)) return current === start;
    seen.add(current);
    current = items[current]?.parent ?? null;
  }
  return false;
}
