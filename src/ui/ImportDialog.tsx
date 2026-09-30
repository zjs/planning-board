import { useMemo, useState } from 'react';
import type { CsvTable } from '../domain/csv.ts';
import {
  columnGroups,
  defaultChoices,
  detectMapping,
  draftFromCsv,
  FIELDS,
  planFromDraft,
  quarterChoices,
  SIZES,
  sizeForPoints,
  type Draft,
  type FieldKind,
  type Mapping,
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

/**
 * Import a CSV export (requirement 28): map each column to a field, check a
 * preview, and import. Jira's usual headers are mapped automatically.
 */
export function ImportDialog({ fileName, table, onCancel, onImport }: Props) {
  const groups = useMemo(() => columnGroups(table.header), [table]);
  const [mapping, setMapping] = useState<Mapping>(() => detectMapping(groups));
  const draft = useMemo(() => draftFromCsv(table, mapping), [table, mapping]);
  const quarters = useMemo(() => quarterChoices(new Date()), []);
  const choices = useMemo(() => defaultChoices(draft), [draft]);
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

      <div className="import-summary" data-testid="import-summary">
        {hasTitle ? (
          <p>
            Imports <strong>{n} {n === 1 ? 'card' : 'cards'}</strong>
            {structure(preview.counts.groups, preview.counts.dependencies)}. It replaces the board; you can undo it.
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
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={!hasTitle || n === 0}
          onClick={() => onImport(draft, choices, quarters)}
        >
          Import {n} {n === 1 ? 'card' : 'cards'}
        </button>
      </div>
    </Dialog>
  );
}

function sizeLabel(points: string): string {
  if (points === '') return '';
  const size = sizeForPoints(points);
  return size ? `${SIZES.find((s) => s.id === size)!.label} (${points})` : points;
}

/** ": 2 groups with cards inside, and 5 dependencies (kept, not drawn yet)", or nothing. */
function structure(groups: number, dependencies: number): string {
  const parts = [
    groups > 0 && `${groups} ${groups === 1 ? 'group' : 'groups'} with cards inside`,
    dependencies > 0 && `${dependencies} ${dependencies === 1 ? 'dependency' : 'dependencies'} (kept, not drawn yet)`,
  ].filter(Boolean);
  return parts.length > 0 ? `, including ${parts.join(', and ')}` : '';
}
