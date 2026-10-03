// From a CSV export (Jira's is the reference, requirement 28) to a Plan, in
// two pure steps (ADR 0010):
//
//   1. rows + a column mapping → a draft: one entry per row, with its raw
//      text values;
//   2. the draft + a value table (which area each component goes in, which
//      quarter each version is in, which size each story point value is)
//      → a Plan, with groups from parent links and dependencies from
//      "Blocks" links.
//
// The UI shows the draft and the value table so people can correct them
// before anything touches the board.

import { generateNKeysBetween } from 'fractional-indexing';
import { LEVELS, levelForIssueType, SIZES, SYSTEM_LEVELS, TIME_LEVELS, type LevelId, type SizeId } from './builtins.ts';
import type { CsvTable } from './csv.ts';
import type { Dependency, Item, Plan, Property, SelectProperty, ValueNode } from './model.ts';
import { LEVEL, SEQUENCE, SIZE, SYSTEM, TIME } from './model.ts';
import { wouldCreateCycle } from './tree.ts';

// ---------------------------------------------------------------------------
// Columns and mapping

/** What a column holds. `property` makes a custom property from it (Q25). */
export type FieldKind =
  | 'ignore'
  | 'title'
  | 'key'
  | 'id'
  | 'description'
  | 'project'
  | 'issueType'
  | 'components'
  | 'versions'
  | 'points'
  | 'parent'
  | 'blocks'
  | 'blockedBy'
  | 'property';

/** Every field a column can map to, with the words the mapping step shows. */
export const FIELDS: { kind: FieldKind; label: string; hint: string }[] = [
  { kind: 'ignore', label: 'Don’t import', hint: '' },
  { kind: 'title', label: 'Card title', hint: 'Jira: Summary' },
  { kind: 'key', label: 'Jira key', hint: 'Kept on the card, e.g. PAY-123' },
  { kind: 'id', label: 'Issue ID', hint: 'Only used to find parents' },
  { kind: 'description', label: 'Description', hint: 'Shown in the inspector' },
  { kind: 'project', label: 'Project', hint: 'Names the default area for its components' },
  { kind: 'issueType', label: 'Level (from issue type)', hint: 'Epic → Epic; Story, Task, Bug → Story' },
  { kind: 'components', label: 'Components', hint: 'System, at the component level' },
  { kind: 'versions', label: 'Release', hint: 'Time, at the release level' },
  { kind: 'points', label: 'Size (from story points)', hint: 'Bucketed into XS–XL' },
  { kind: 'parent', label: 'Parent (makes groups)', hint: 'A parent’s key or issue ID' },
  { kind: 'blocks', label: 'Blocks (dependency)', hint: 'This card comes before those' },
  { kind: 'blockedBy', label: 'Is blocked by (dependency)', hint: 'Those come before this card' },
  { kind: 'property', label: 'Custom property', hint: 'A new property you can pivot by' },
];

/** Columns sharing a header, as Jira writes repeated fields like Component/s. */
export interface ColumnGroup {
  name: string;
  columns: number[];
}

export interface ColumnMapping {
  kind: FieldKind;
  /** For a custom property: several values per card, or one. */
  multi?: boolean;
}

/** Keyed by column group name. */
export type Mapping = Record<string, ColumnMapping>;

export function columnGroups(header: readonly string[]): ColumnGroup[] {
  const groups = new Map<string, number[]>();
  header.forEach((name, i) => {
    if (name === '') return;
    groups.set(name, [...(groups.get(name) ?? []), i]);
  });
  return [...groups].map(([name, columns]) => ({ name, columns }));
}

/** "Custom field (Story Points)" → "Story Points". */
export function cleanHeader(name: string): string {
  return name.replace(/^custom field \((.*)\)$/i, '$1').trim();
}

/**
 * Jira's usual headers, and what they map to. Anything else is left out
 * until someone maps it; Status, Priority, Sprint, and Assignee in
 * particular (Q29).
 */
const DETECT: [RegExp, ColumnMapping][] = [
  [/^summary$/i, { kind: 'title' }],
  [/^(issue )?key$/i, { kind: 'key' }],
  [/^issue id$/i, { kind: 'id' }],
  [/^description$/i, { kind: 'description' }],
  [/^project name$/i, { kind: 'project' }],
  [/^issue ?type$/i, { kind: 'issueType' }],
  [/^components?(\/s)?$/i, { kind: 'components' }],
  [/^fix ?versions?(\/s)?$/i, { kind: 'versions' }],
  [/^story ?points?( estimate)?$/i, { kind: 'points' }],
  [/^(parent|parent id|parent key|epic link)$/i, { kind: 'parent' }],
  [/^outward issue link \(blocks\)$/i, { kind: 'blocks' }],
  [/^inward issue link \(blocks\)$/i, { kind: 'blockedBy' }],
  [/^labels?$/i, { kind: 'property', multi: true }],
  [/^teams?$/i, { kind: 'property', multi: false }],
];

/** A first guess at the mapping, from the headers alone. Each field other than parent and custom properties is used once. */
export function detectMapping(groups: readonly ColumnGroup[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<FieldKind>();
  for (const group of groups) {
    const clean = cleanHeader(group.name);
    const hit = DETECT.find(([pattern]) => pattern.test(clean))?.[1];
    const single = hit && hit.kind !== 'property' && hit.kind !== 'parent';
    if (!hit || (single && used.has(hit.kind))) {
      mapping[group.name] = { kind: 'ignore' };
      continue;
    }
    used.add(hit.kind);
    mapping[group.name] = hit.kind === 'property' ? { kind: 'property', multi: hit.multi ?? group.columns.length > 1 } : { kind: hit.kind };
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Step 1: rows → draft

export interface DraftItem {
  /** 1-based row number in the file, counting the header, for messages. */
  row: number;
  title: string;
  key: string;
  id: string;
  description: string;
  project: string;
  issueType: string;
  components: string[];
  versions: string[];
  points: string;
  parents: string[];
  blocks: string[];
  blockedBy: string[];
  /** Custom property values, by column group name. */
  properties: Record<string, string[]>;
}

export interface Draft {
  items: DraftItem[];
  /** Rows left out, and why. */
  skipped: { row: number; reason: string }[];
  /** Column groups that become custom properties, in file order. */
  properties: { column: string; name: string; multi: boolean }[];
}

const distinct = (values: Iterable<string>) => [...new Set(values)];

export function draftFromCsv(table: CsvTable, mapping: Mapping): Draft {
  const groups = columnGroups(table.header);
  const byKind = (kind: FieldKind) => groups.filter((g) => mapping[g.name]?.kind === kind);
  const cells = (row: readonly string[], kinds: ColumnGroup[]) =>
    distinct(kinds.flatMap((g) => g.columns.map((c) => (row[c] ?? '').trim())).filter((v) => v !== ''));
  const first = (row: readonly string[], kind: FieldKind) => cells(row, byKind(kind))[0] ?? '';
  const propertyGroups = byKind('property');
  const properties = propertyNames(propertyGroups.map((g) => g.name)).map((name, i) => ({
    column: propertyGroups[i]!.name,
    name,
    multi: mapping[propertyGroups[i]!.name]?.multi === true,
  }));

  const items: DraftItem[] = [];
  const skipped: Draft['skipped'] = [];
  table.rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const title = first(row, 'title').replace(/\s+/g, ' ');
    if (title === '') {
      skipped.push({ row: rowNumber, reason: 'no title' });
      return;
    }
    items.push({
      row: rowNumber,
      title,
      key: first(row, 'key'),
      id: first(row, 'id'),
      description: cells(row, byKind('description')).join('\n\n'),
      project: first(row, 'project'),
      issueType: first(row, 'issueType'),
      components: cells(row, byKind('components')),
      versions: cells(row, byKind('versions')),
      points: first(row, 'points'),
      parents: cells(row, byKind('parent')),
      blocks: cells(row, byKind('blocks')),
      blockedBy: cells(row, byKind('blockedBy')),
      properties: Object.fromEntries(propertyGroups.map((g) => [g.name, cells(row, [g])])),
    });
  });
  return { items, skipped, properties };
}

const BUILT_IN_NAMES = ['sequence', 'system', 'level', 'size', 'time'];

/** Property names from column headers: cleaned, and never clashing with a built-in or each other. */
function propertyNames(columns: readonly string[]): string[] {
  const taken = new Set(BUILT_IN_NAMES);
  return columns.map((column) => {
    const base = cleanHeader(column) || 'Imported';
    let name = taken.has(base.toLocaleLowerCase()) ? `${base} (Jira)` : base;
    for (let n = 2; taken.has(name.toLocaleLowerCase()); n++) name = `${base} ${n}`;
    taken.add(name.toLocaleLowerCase());
    return name;
  });
}

// ---------------------------------------------------------------------------
// The value table

export { SIZES, type SizeId };

/** Story points to a size (Q28): 1 → XS, 2–3 → S, 5 → M, 8 → L, 13 and up → XL. Null for text that isn't a number. */
export function sizeForPoints(points: string): SizeId | null {
  const n = Number(points.replace(',', '.'));
  if (points.trim() === '' || !Number.isFinite(n) || n < 0) return null;
  if (n <= 1) return 'xs';
  if (n <= 3) return 's';
  if (n <= 5) return 'm';
  if (n <= 8) return 'l';
  return 'xl';
}

/** Quarters people can put versions in: this quarter and the next seven, e.g. "Q4 2026". */
export function quarterChoices(now: Date, count = 8): string[] {
  const start = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
  return Array.from({ length: count }, (_, i) => `Q${((start + i) % 4) + 1} ${Math.floor((start + i) / 4)}`);
}

export interface ValueChoices {
  /** Component → the area it goes in (an area's name; new areas are made as needed). */
  areas: Record<string, string>;
  /** Version → the quarter it's in, or null to leave those cards undated (Q27). */
  quarters: Record<string, string | null>;
  /** Story point value, as written → size, or null for none. */
  sizes: Record<string, SizeId | null>;
  /** Issue type, as written → level, or null for "not decided" (Q32). */
  levels: Record<string, LevelId | null>;
}

/** Everything the value table lists, in the order it first appears in the file. */
export function draftValues(draft: Draft) {
  return {
    components: distinct(draft.items.flatMap((i) => i.components)),
    versions: distinct(draft.items.flatMap((i) => i.versions)),
    points: distinct(draft.items.map((i) => i.points).filter((p) => p !== '')).sort(
      (a, b) => Number(a) - Number(b) || a.localeCompare(b),
    ),
    issueTypes: distinct(draft.items.map((i) => i.issueType).filter((t) => t !== '')),
  };
}

/** "PAY-12" → "PAY". */
const projectOfKey = (key: string) => /^([A-Za-z][A-Za-z0-9_]*)-\d+$/.exec(key)?.[1] ?? '';

/**
 * The value table's starting point (Q27, Q28). Each component goes in an
 * area named after the project of the first card that uses it; versions
 * aren't dated until someone picks a quarter; story points use the
 * default buckets.
 */
export function defaultChoices(draft: Draft): ValueChoices {
  const areas: Record<string, string> = {};
  for (const item of draft.items) {
    const project = item.project || projectOfKey(item.key) || 'Imported';
    for (const component of item.components) areas[component] ??= project;
  }
  const { versions, points, issueTypes } = draftValues(draft);
  return {
    areas,
    quarters: Object.fromEntries(versions.map((v) => [v, null])),
    sizes: Object.fromEntries(points.map((p) => [p, sizeForPoints(p)])),
    levels: Object.fromEntries(issueTypes.map((t) => [t, levelForIssueType(t)])),
  };
}

// ---------------------------------------------------------------------------
// Step 2: draft + value table → plan

export interface ImportResult {
  plan: Plan;
  /** What was left out or couldn't be matched, in plain words. */
  notes: string[];
  counts: { cards: number; groups: number; dependencies: number };
}

type NewId = (prefix: string) => string;

/** A select property from an ordered tree of labels, with IDs from `newId`. */
function buildProperty(
  id: string,
  name: string,
  levels: string[],
  multi: boolean,
  tree: { label: string; id?: string; children?: { label: string; id?: string }[] }[],
  newId: NewId,
): { property: SelectProperty; ids: Map<string, string> } {
  const values: Record<string, ValueNode> = {};
  const ids = new Map<string, string>();
  const keys = generateNKeysBetween(null, null, tree.length);
  tree.forEach((node, i) => {
    const nodeId = node.id ?? newId('v');
    values[nodeId] = { id: nodeId, label: node.label, parent: null, order: keys[i]! };
    ids.set(node.label, nodeId);
    const childKeys = generateNKeysBetween(null, null, node.children?.length ?? 0);
    node.children?.forEach((child, j) => {
      const childId = child.id ?? newId('v');
      values[childId] = { id: childId, label: child.label, parent: nodeId, order: childKeys[j]! };
      ids.set(`${node.label}\u0000${child.label}`, childId);
    });
  });
  return { property: { kind: 'select', id, name, levels, multi, values }, ids };
}

export function planFromDraft(draft: Draft, choices: ValueChoices, newId: NewId, quarterOrder: readonly string[] = []): ImportResult {
  const notes: string[] = [];
  const { components, versions } = draftValues(draft);

  // System: areas in the order their first component appears, components inside.
  const areaOf = (component: string) => choices.areas[component]?.trim() || 'Imported';
  const areaNames = distinct(components.map(areaOf));
  const system = buildProperty(
    SYSTEM,
    'System',
    [...SYSTEM_LEVELS],
    true,
    areaNames.map((area) => ({ label: area, children: components.filter((c) => areaOf(c) === area).map((label) => ({ label })) })),
    newId,
  );

  // Time: quarters in calendar order, with the versions put in them as releases.
  const quarterOf = (version: string) => choices.quarters[version] ?? null;
  const rank = (q: string) => {
    const i = quarterOrder.indexOf(q);
    return i < 0 ? quarterOrder.length : i;
  };
  const quarterNames = distinct(versions.map(quarterOf).filter((q): q is string => q !== null)).sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  );
  const time = buildProperty(
    TIME,
    'Time',
    [...TIME_LEVELS],
    false,
    quarterNames.map((q) => ({ label: q, children: versions.filter((v) => quarterOf(v) === q).map((label) => ({ label })) })),
    newId,
  );
  const undated = versions.filter((v) => quarterOf(v) === null);
  if (undated.length > 0) {
    notes.push(
      `${undated.length === 1 ? 'One version wasn’t' : `${undated.length} versions weren’t`} given a quarter, so ${undated.length === 1 ? 'its' : 'their'} cards have no date: ${undated.join(', ')}.`,
    );
  }

  const size = buildProperty(SIZE, 'Size', ['Size'], false, SIZES.map((s) => ({ id: s.id, label: s.label })), newId);
  const level = buildProperty(LEVEL, 'Level', ['Level'], false, LEVELS.map((l) => ({ id: l.id, label: l.label })), newId);

  const custom = draft.properties.map((p) => {
    const labels = distinct(draft.items.flatMap((i) => i.properties[p.column] ?? []));
    return { ...p, ...buildProperty(newId('p'), p.name, [p.name], p.multi, labels.map((label) => ({ label })), newId) };
  });

  const properties: Record<string, Property> = {
    [SEQUENCE]: { kind: 'sequence', id: SEQUENCE, name: 'Sequence' },
    [SYSTEM]: system.property,
    [LEVEL]: level.property,
    [SIZE]: size.property,
    [TIME]: time.property,
    ...Object.fromEntries(custom.map((c) => [c.property.id, c.property])),
  };

  // Items, findable by key or issue ID for parents and links.
  const items: Record<string, Item> = {};
  const byRef = new Map<string, string>();
  const idOf = new Map<DraftItem, string>();
  let duplicateKeys = 0;
  for (const draftItem of draft.items) {
    const id = newId('i');
    idOf.set(draftItem, id);
    for (const ref of [draftItem.key, draftItem.id]) {
      if (ref === '') continue;
      if (byRef.has(ref)) duplicateKeys++;
      else byRef.set(ref, id);
    }
    const values: Record<string, string[]> = {};
    const sys = draftItem.components.map((c) => system.ids.get(`${areaOf(c)}\u0000${c}`)).filter((v): v is string => !!v);
    if (sys.length > 0) values[SYSTEM] = distinct(sys);
    const release = draftItem.versions
      .filter((v) => quarterOf(v) !== null)
      .sort((a, b) => rank(quarterOf(a)!) - rank(quarterOf(b)!))[0];
    if (release !== undefined) values[TIME] = [time.ids.get(`${quarterOf(release)}\u0000${release}`)!];
    const sizeId = choices.sizes[draftItem.points] ?? null;
    if (draftItem.points !== '' && sizeId !== null) values[SIZE] = [sizeId];
    const levelId = choices.levels[draftItem.issueType] ?? null;
    if (draftItem.issueType !== '' && levelId !== null) values[LEVEL] = [levelId];
    for (const c of custom) {
      const held = (draftItem.properties[c.column] ?? []).map((label) => c.ids.get(label)!);
      if (held.length > 0) values[c.property.id] = c.multi ? held : held.slice(0, 1);
    }
    items[id] = {
      id,
      title: draftItem.title,
      description: draftItem.description,
      parent: null,
      sequence: null,
      values,
      ...(draftItem.key !== '' ? { externalKey: draftItem.key } : {}),
    };
  }
  if (duplicateKeys > 0) {
    notes.push(
      `${duplicateKeys === 1 ? 'One row repeats a key' : `${duplicateKeys} rows repeat keys`} another row already has; links to ${duplicateKeys === 1 ? 'it' : 'them'} go to the first one.`,
    );
  }

  // Parents become groups (requirement 11). A loop is broken where it closes.
  const plan: Plan = { properties, items, dependencies: [] };
  const missingParents = new Set<string>();
  let loops = 0;
  for (const draftItem of draft.items) {
    const id = idOf.get(draftItem)!;
    const parent = draftItem.parents.map((ref) => byRef.get(ref)).find((p) => p !== undefined && p !== id);
    if (parent === undefined) {
      for (const ref of draftItem.parents) if (!byRef.has(ref)) missingParents.add(ref);
      continue;
    }
    if (wouldCreateCycle(plan, id, parent)) loops++;
    else items[id]!.parent = parent;
  }
  if (missingParents.size > 0) {
    notes.push(
      `${missingParents.size === 1 ? 'One parent isn’t' : `${missingParents.size} parents aren’t`} in the file, so ${missingParents.size === 1 ? 'its' : 'their'} cards are at the top level: ${[...missingParents].slice(0, 5).join(', ')}${missingParents.size > 5 ? '…' : ''}.`,
    );
  }
  if (loops > 0) {
    notes.push(`${loops === 1 ? 'One parent link' : `${loops} parent links`} would have made a loop, so ${loops === 1 ? 'it was' : 'they were'} left out.`);
  }

  // "Blocks" links become dependencies: a blocker comes first.
  const seen = new Set<string>();
  const dependencies: Dependency[] = [];
  let outside = 0;
  const link = (from: string | undefined, to: string | undefined) => {
    if (from === undefined || to === undefined) {
      outside++;
      return;
    }
    const key = `${from}->${to}`;
    if (from === to || seen.has(key)) return;
    seen.add(key);
    dependencies.push({ from, to });
  };
  for (const draftItem of draft.items) {
    const id = idOf.get(draftItem)!;
    for (const ref of draftItem.blocks) link(id, byRef.get(ref));
    for (const ref of draftItem.blockedBy) link(byRef.get(ref), id);
  }
  if (outside > 0) {
    notes.push(
      outside === 1
        ? 'One “Blocks” link points to an issue that isn’t in the file, so it was left out.'
        : `${outside} “Blocks” links point to issues that aren’t in the file, so they were left out.`,
    );
  }
  if (draft.skipped.length > 0) {
    notes.push(
      `${draft.skipped.length} ${draft.skipped.length === 1 ? 'row has' : 'rows have'} no title and ${draft.skipped.length === 1 ? 'was' : 'were'} skipped (row ${draft.skipped
        .slice(0, 5)
        .map((s) => s.row)
        .join(', ')}${draft.skipped.length > 5 ? '…' : ''}).`,
    );
  }

  const groups = new Set(Object.values(items).flatMap((i) => (i.parent ? [i.parent] : []))).size;
  return {
    plan: { properties, items, dependencies },
    notes,
    counts: { cards: Object.keys(items).length, groups, dependencies: dependencies.length },
  };
}
