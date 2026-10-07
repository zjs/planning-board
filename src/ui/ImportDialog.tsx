import { useMemo, useState } from 'react';
import { LEVELS, type LevelId } from '../domain/builtins.ts';
import type { CsvTable } from '../domain/csv.ts';
import {
  columnGroups,
  defaultChoices,
  detectMapping,
  draftFromCsv,
  draftValues,
  FIELDS,
  planFromDraft,
  quarterChoices,
  SIZES,
  sizeForPoints,
  type Draft,
  type FieldKind,
  type Mapping,
  type SizeId,
  type ValueChoices,
} from '../domain/csvImport.ts';
import { Dialog } from './Dialog.tsx';

/** More rows than this and the board gets hard to read (a few hundred is the target, requirements.md "Scale"). */
const LARGE_IMPORT = 1000;
const PREVIEW_ROWS = 5;

interface Props {
  fileName: string;
  table: CsvTable;
  onCancel: () => void;
  onImport: (draft: Draft, choices: ValueChoices, quarterOrder: string[]) => void;
}

/** Choices made in the value table, over the defaults. Kept by value, so going back to the columns doesn't lose them. */
interface Overrides {
  areas: Record<string, string>;
  quarters: Record<string, string | null>;
  sizes: Record<string, SizeId | null>;
  levels: Record<string, LevelId | null>;
}

/**
 * Import a CSV export (requirement 28), in two steps. Columns: map each
 * column to a field, with Jira's usual headers mapped automatically, and
 * check a preview. Values: choose an area for each component, a quarter
 * for each version, and a size for each story point value (Q27, Q28).
 */
export function ImportDialog({ fileName, table, onCancel, onImport }: Props) {
  const groups = useMemo(() => columnGroups(table.header), [table]);
  const [mapping, setMapping] = useState<Mapping>(() => detectMapping(groups));
  const draft = useMemo(() => draftFromCsv(table, mapping), [table, mapping]);
  const quarters = useMemo(() => quarterChoices(new Date()), []);
  const [step, setStep] = useState<'columns' | 'values'>('columns');
  const [overrides, setOverrides] = useState<Overrides>({ areas: {}, quarters: {}, sizes: {}, levels: {} });
  const choices = useMemo((): ValueChoices => {
    const base = defaultChoices(draft);
    const over = <T,>(defaults: Record<string, T>, chosen: Record<string, T>) =>
      Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, k in chosen ? chosen[k]! : v]));
    return {
      areas: over(base.areas, overrides.areas),
      quarters: over(base.quarters, overrides.quarters),
      sizes: over(base.sizes, overrides.sizes),
      levels: over(base.levels, overrides.levels),
    };
  }, [draft, overrides]);
  const values = useMemo(() => draftValues(draft), [draft]);
  const hasValues = values.components.length + values.versions.length + values.points.length + values.issueTypes.length > 0;
  const preview = useMemo(() => {
    let n = 0;
    return planFromDraft(draft, choices, (prefix) => `${prefix}${++n}`, quarters);
  }, [draft, choices, quarters]);
  const hasTitle = Object.values(mapping).some((m) => m.kind === 'title');

  const setKind = (column: string, kind: FieldKind) =>
    setMapping((m) => ({ ...m, [column]: kind === 'property' ? { kind, multi: (groups.find((g) => g.name === column)?.columns.length ?? 1) > 1 } : { kind } }));
  const setMulti = (column: string, multi: boolean) => setMapping((m) => ({ ...m, [column]: { kind: 'property', multi } }));

  const examples = (columns: number[]) => {
    const seen = new Set<string>();
    for (const row of table.rows) {
      for (const c of columns) {
        const value = (row[c] ?? '').trim().replace(/\s+/g, ' ');
        if (value !== '') seen.add(value);
      }
      if (seen.size >= 3) break;
    }
    return [...seen].slice(0, 3).join(', ');
  };

  const n = preview.counts.cards;
  return (
    <Dialog title={`Import “${fileName}”`} onClose={onCancel} wide testId="import-dialog">
      <ol className="steps" aria-label="Steps">
        <li aria-current={step === 'columns' ? 'step' : undefined}>1. Columns</li>
        <li aria-current={step === 'values' ? 'step' : undefined}>2. Values</li>
      </ol>
      {step === 'values' ? (
        <ValueTable
          draft={draft}
          choices={choices}
          quarters={quarters}
          onChange={(change) =>
            setOverrides((o) => ({
              areas: { ...o.areas, ...change.areas },
              quarters: { ...o.quarters, ...change.quarters },
              sizes: { ...o.sizes, ...change.sizes },
              levels: { ...o.levels, ...change.levels },
            }))
          }
        />
      ) : (
      <>
      <p className="dialog-lead">
        {table.rows.length} {table.rows.length === 1 ? 'row' : 'rows'}, {groups.length} columns. Choose what each column
        becomes. Jira’s usual columns are already chosen; Status, Priority, Sprint, and Assignee are left out unless you
        pick “Custom property”.
      </p>
      {table.rows.length > LARGE_IMPORT && (
        <p className="warning" role="status">
          This file has {table.rows.length} rows. The board is built for a few hundred cards, so it may be slow and hard to
          read. You can still import it.
        </p>
      )}

      <div className="import-columns">
        <table className="import-table" data-testid="column-mapping">
          <thead>
            <tr>
              <th>Column</th>
              <th>Examples</th>
              <th>Import as</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const map = mapping[group.name] ?? { kind: 'ignore' };
              return (
                <tr key={group.name} data-column={group.name} className={map.kind === 'ignore' ? 'ignored' : undefined}>
                  <td className="column-name">
                    {group.name}
                    {group.columns.length > 1 && <span className="muted"> ×{group.columns.length}</span>}
                  </td>
                  <td className="examples">{examples(group.columns)}</td>
                  <td className="import-as">
                    <select
                      aria-label={`Import ${group.name} as`}
                      value={map.kind}
                      onChange={(e) => setKind(group.name, e.target.value as FieldKind)}
                    >
                      {FIELDS.map((f) => (
                        <option key={f.kind} value={f.kind} title={f.hint}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    {map.kind === 'property' && (
                      <select
                        aria-label={`Values of ${group.name} per card`}
                        value={map.multi ? 'multi' : 'one'}
                        onChange={(e) => setMulti(group.name, e.target.value === 'multi')}
                      >
                        <option value="one">One per card</option>
                        <option value="multi">Several per card</option>
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3>Preview</h3>
      <div className="import-preview">
        <table className="import-table" data-testid="import-preview">
          <thead>
            <tr>
              <th>Title</th>
              <th>Key</th>
              <th>Components</th>
              <th>Release</th>
              <th>Size</th>
              <th>Parent</th>
              {draft.properties.map((p) => (
                <th key={p.column}>{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.items.slice(0, PREVIEW_ROWS).map((item) => (
              <tr key={item.row}>
                <td>{item.title}</td>
                <td className="mono">{item.key}</td>
                <td>{item.components.join(', ')}</td>
                <td>{item.versions.join(', ')}</td>
                <td>{sizeLabel(item.points)}</td>
                <td className="mono">{item.parents[0] ?? ''}</td>
                {draft.properties.map((p) => (
                  <td key={p.column}>{(item.properties[p.column] ?? []).join(', ')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}

      <div className="import-summary" data-testid="import-summary">
        {hasTitle ? (
          <p>
            Imports <strong>{n} {n === 1 ? 'card' : 'cards'}</strong>
            {structure(preview.counts.groups, preview.counts.dependencies, preview.counts.related)}. It replaces the board; you can undo it.
          </p>
        ) : (
          <p className="field-error">Choose which column holds the card titles (in Jira, Summary).</p>
        )}
        {hasTitle && preview.notes.length > 0 && (
          <ul className="import-notes">
            {preview.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="dialog-actions">
        {step === 'values' ? (
          <button type="button" onClick={() => setStep('columns')}>
            ← Columns
          </button>
        ) : (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        {step === 'columns' && hasValues ? (
          <button type="button" className="primary" disabled={!hasTitle || n === 0} onClick={() => setStep('values')}>
            Next: values →
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            disabled={!hasTitle || n === 0}
            onClick={() => onImport(draft, choices, quarters)}
          >
            Import {n} {n === 1 ? 'card' : 'cards'}
          </button>
        )}
      </div>
    </Dialog>
  );
}

function sizeLabel(points: string): string {
  if (points === '') return '';
  const size = sizeForPoints(points);
  return size ? `${SIZES.find((s) => s.id === size)!.label} (${points})` : points;
}

/** ", including 2 groups with cards inside, 5 dependencies, and 3 related links", or nothing. */
function structure(groups: number, dependencies: number, related: number): string {
  const parts = [
    groups > 0 && `${groups} ${groups === 1 ? 'group' : 'groups'} with cards inside`,
    dependencies > 0 && `${dependencies} ${dependencies === 1 ? 'dependency' : 'dependencies'}`,
    related > 0 && `${related} related ${related === 1 ? 'link' : 'links'}`,
  ].filter((part): part is string => typeof part === 'string');
  if (parts.length === 0) return '';
  return `, including ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`}`;
}

/**
 * Where Jira's flat values go in the board's hierarchies (Q27): an area for
 * each component, a quarter for each version, and a size for each story
 * point value (Q28).
 */
function ValueTable({
  draft,
  choices,
  quarters,
  onChange,
}: {
  draft: Draft;
  choices: ValueChoices;
  quarters: string[];
  onChange: (change: Partial<Overrides>) => void;
}) {
  const { components, versions, points, issueTypes } = draftValues(draft);
  const count = (has: (item: Draft['items'][number]) => boolean) => draft.items.filter(has).length;
  const areaNames = [...new Set(Object.values(choices.areas))];
  const listId = 'import-area-names';
  return (
    <div className="value-table" data-testid="value-table">
      <p className="dialog-lead">
        Jira’s components, versions, story points, and issue types are flat lists. The board groups components into
        areas and releases into quarters, sizes cards XS–XL, and gives them levels. Check where each one goes; you can
        change any of it on the board later.
      </p>
      {components.length > 0 && (
        <section>
          <h3>Components → areas</h3>
          <datalist id={listId}>
            {areaNames.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <table className="import-table" data-testid="component-areas">
            <thead>
              <tr>
                <th>Component</th>
                <th>Cards</th>
                <th>Area (pick one, or type a new name)</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c}>
                  <td>{c}</td>
                  <td className="muted">{count((i) => i.components.includes(c))}</td>
                  <td>
                    <input
                      className="area-input"
                      list={listId}
                      aria-label={`Area for ${c}`}
                      value={choices.areas[c] ?? ''}
                      onChange={(e) => onChange({ areas: { [c]: e.target.value } })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {versions.length > 0 && (
        <section>
          <h3>Versions → quarters</h3>
          <table className="import-table" data-testid="version-quarters">
            <thead>
              <tr>
                <th>Version</th>
                <th>Cards</th>
                <th>Quarter</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v}>
                  <td>{v}</td>
                  <td className="muted">{count((i) => i.versions.includes(v))}</td>
                  <td>
                    <select
                      aria-label={`Quarter for ${v}`}
                      value={choices.quarters[v] ?? ''}
                      onChange={(e) => onChange({ quarters: { [v]: e.target.value === '' ? null : e.target.value } })}
                    >
                      <option value="">Not dated</option>
                      {quarters.map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {issueTypes.length > 0 && (
        <section>
          <h3>Issue types → levels</h3>
          <table className="import-table" data-testid="type-levels">
            <thead>
              <tr>
                <th>Issue type</th>
                <th>Cards</th>
                <th>Level</th>
              </tr>
            </thead>
            <tbody>
              {issueTypes.map((t) => (
                <tr key={t}>
                  <td>{t}</td>
                  <td className="muted">{count((i) => i.issueType === t)}</td>
                  <td>
                    <select
                      aria-label={`Level for ${t}`}
                      value={choices.levels[t] ?? ''}
                      onChange={(e) => onChange({ levels: { [t]: e.target.value === '' ? null : (e.target.value as LevelId) } })}
                    >
                      <option value="">Not decided</option>
                      {LEVELS.map((level) => (
                        <option key={level.id} value={level.id}>
                          {level.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {points.length > 0 && (
        <section>
          <h3>Story points → sizes</h3>
          <table className="import-table" data-testid="point-sizes">
            <thead>
              <tr>
                <th>Points</th>
                <th>Cards</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p}>
                  <td>{p}</td>
                  <td className="muted">{count((i) => i.points === p)}</td>
                  <td>
                    <select
                      aria-label={`Size for ${p} points`}
                      value={choices.sizes[p] ?? ''}
                      onChange={(e) => onChange({ sizes: { [p]: e.target.value === '' ? null : (e.target.value as SizeId) } })}
                    >
                      <option value="">No size</option>
                      {SIZES.map((size) => (
                        <option key={size.id} value={size.id}>
                          {size.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
