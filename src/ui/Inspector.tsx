import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { editCardValues, removeDependency, removeRelated, renameItem, setDescription, type PlanStore } from '../commands/store.ts';
import { compareTreeOrder, depthOf, pathTo } from '../domain/hierarchy.ts';
import { ownLinks, selectionValues, type FieldValue, type ValueEdit } from '../domain/inspector.ts';
import type { Dependency, ItemId, Plan, SelectProperty, ValueId } from '../domain/model.ts';
import { propertiesInOrder } from '../domain/properties.ts';
import { ancestry, canNest } from '../domain/tree.ts';
import type { HistoryEntry } from '../commands/history.ts';
import { describeChange, titlesFrom } from '../domain/describe.ts';
import { entriesForItem, shownTime } from '../domain/history.ts';
import { formatWhen } from '../domain/time.ts';
import { keyNames } from './platform.ts';
import { useNow } from './useNow.ts';

interface Props {
  store: PlanStore;
  plan: Plan;
  /** The selected cards, in the order they were selected. */
  selected: readonly ItemId[];
  /** Why each card doesn't fit its group (requirement 13). */
  mismatches: ReadonlyMap<ItemId, string[]>;
  onClose: () => void;
  /** Show a card on the board: expand the groups around it and select it. */
  onReveal: (id: ItemId) => void;
  /** Say what just happened, with an Undo for it. */
  onNotice: (text: string) => void;
  /** Move cards into a group, or to the top level for null. */
  onMove: (ids: ItemId[], parent: ItemId | null) => void;
  /** Add a card inside this one, expand it, and start naming the new card. */
  onAddInside: (id: ItemId) => void;
  /** The plan's history (requirement 36), for a card's History and "Last changed by". */
  history?: { entries: readonly HistoryEntry[]; clocks: ReadonlyMap<string, number>; me: string };
}

/**
 * The card inspector (questions.md Q35): every property of the selected
 * cards, editable without pivoting, plus a single card's title,
 * description, Jira key and links. Edits apply to every selected card.
 */
export function Inspector({ store, plan, selected, mismatches, onClose, onReveal, onNotice, onMove, onAddInside, history }: Props) {
  const ids = selected.filter((id) => plan.items[id]);
  const single = ids.length === 1 ? plan.items[ids[0]!]! : null;
  const properties = propertiesInOrder(plan).filter((p): p is SelectProperty => p.kind === 'select');

  return (
    <aside className="side-panel inspector" aria-label="Inspector" data-testid="inspector">
      <header>
        <h2>{ids.length > 1 ? `${ids.length} cards` : 'Card'}</h2>
        <button type="button" onClick={onClose} aria-label="Close inspector">
          ✕
        </button>
      </header>
      {ids.length === 0 && (
        <p className="panel-hint">Select a card to see and edit it. Shift-click to select several and edit them together.</p>
      )}
      {single && (
        <>
          <TitleField key={`${single.id}:${single.title}`} store={store} id={single.id} title={single.title} />
          {history && <LastChanged history={history} id={single.id} />}
          {(single.externalKey || single.parent !== null) && (
            <p className="inspector-meta">
              {single.externalKey && <span className="attr key">{single.externalKey}</span>}
              {single.parent !== null && <GroupPath plan={plan} id={single.id} onReveal={onReveal} />}
            </p>
          )}
          <DescriptionField
            key={`${single.id}:${single.description}`}
            store={store}
            id={single.id}
            description={single.description}
          />
          {(mismatches.get(single.id) ?? []).length > 0 && (
            <ul className="inspector-mismatches" aria-label="Doesn't fit its group">
              {mismatches.get(single.id)!.map((line) => (
                <li key={line}>⚠ {line}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {ids.length > 1 && (
        <p className="panel-hint">Changes here apply to all {ids.length}. Select one card to edit its title, description, or links.</p>
      )}
      {ids.length > 0 && (
        <dl className="inspector-fields">
          <GroupField plan={plan} ids={ids} onMove={onMove} />
          {properties.map((property) => (
            <PropertyField
              key={property.id}
              property={property}
              value={selectionValues(plan, ids, property)}
              total={ids.length}
              onEdit={(change) => {
                const n = editCardValues(store, ids, property.id, change);
                if (n > 1) onNotice(`Changed ${property.name} on ${n} cards`);
              }}
            />
          ))}
        </dl>
      )}
      {single && (
        <p className="inspector-actions">
          <button type="button" onClick={() => onAddInside(single.id)}>
            Add a card inside
          </button>
        </p>
      )}
      {single && <Links store={store} plan={plan} id={single.id} onReveal={onReveal} onNotice={onNotice} />}
      {single && history && <CardHistory history={history} plan={plan} id={single.id} />}
    </aside>
  );
}

/**
 * Commit a field's text when it's left without a blur: a click on the
 * board can change the selection before the field loses focus.
 */
function useCommitOnLeave(text: string, initial: string, commit: (text: string) => void) {
  const latest = useRef({ text, commit });
  useEffect(() => {
    latest.current = { text, commit };
  });
  useEffect(
    () => () => {
      if (latest.current.text !== initial) latest.current.commit(latest.current.text);
    },
    [initial],
  );
}

function TitleField({ store, id, title }: { store: PlanStore; id: ItemId; title: string }) {
  const [text, setText] = useState(title);
  useCommitOnLeave(text, title, (t) => renameItem(store, id, t));
  const commit = () => {
    if (!renameItem(store, id, text)) setText(title);
  };
  return (
    <input
      className="inspector-title"
      aria-label="Card title"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(title);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function DescriptionField({ store, id, description }: { store: PlanStore; id: ItemId; description: string }) {
  const [text, setText] = useState(description);
  useCommitOnLeave(text, description, (t) => setDescription(store, id, t));
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setText(description);
      e.currentTarget.blur();
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
  };
  return (
    <textarea
      className="inspector-description"
      aria-label="Description"
      placeholder="Add a description…"
      rows={Math.min(10, Math.max(3, text.split('\n').length + 1))}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => setDescription(store, id, text)}
      onKeyDown={onKeyDown}
    />
  );
}

/** "In EU data residency › Region pinning": the groups around a card, each one clickable. */
function GroupPath({ plan, id, onReveal }: { plan: Plan; id: ItemId; onReveal: (id: ItemId) => void }) {
  const groups = ancestry(plan, id).slice(0, -1);
  return (
    <span className="inspector-path">
      In{' '}
      {groups.map((g, i) => (
        <span key={g}>
          {i > 0 && ' › '}
          <button type="button" className="link" onClick={() => onReveal(g)}>
            {plan.items[g]?.title}
          </button>
        </span>
      ))}
    </span>
  );
}

/** How many matches the Group field lists while you type. */
const GROUP_MATCHES = 8;

/**
 * The selected cards' group, and a search for another one to move them
 * into (sprint 5). The whiteboard way is to hold a card over a group; this
 * reaches groups that aren't on screen.
 */
function GroupField({ plan, ids, onMove }: { plan: Plan; ids: readonly ItemId[]; onMove: (ids: ItemId[], parent: ItemId | null) => void }) {
  const [query, setQuery] = useState('');
  const parents = [...new Set(ids.map((id) => plan.items[id]?.parent ?? null))];
  const current =
    parents.length > 1 ? 'Mixed' : parents[0] === null || parents[0] === undefined ? 'Top level' : (plan.items[parents[0]]?.title ?? 'Top level');
  const q = query.trim().toLowerCase();
  const matches =
    q === ''
      ? []
      : Object.values(plan.items)
          .filter((item) => !ids.includes(item.id) && item.title.toLowerCase().includes(q) && ids.some((id) => canNest(plan, id, item.id)))
          .sort((a, b) => a.title.localeCompare(b.title))
          .slice(0, GROUP_MATCHES);
  const move = (parent: ItemId | null) => {
    setQuery('');
    onMove([...ids], parent);
  };
  /** "In Initiative › Epic", so two groups with one title can be told apart. */
  const where = (id: ItemId) => {
    const above = ancestry(plan, id).slice(0, -1);
    return above.length === 0 ? '' : `In ${above.map((g) => plan.items[g]?.title).join(' › ')}`;
  };
  return (
    <>
      <dt>Group</dt>
      <dd className="group-field">
        <span className="group-current">{current}</span>
        {parents.some((p) => p !== null) && (
          <button type="button" className="link" onClick={() => move(null)}>
            Move to the top level
          </button>
        )}
        <input
          type="search"
          aria-label="Move into a group"
          placeholder="Move into…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) move(matches[0].id);
            if (e.key === 'Escape') setQuery('');
          }}
        />
        {q !== '' && (
          <ul className="group-matches" aria-label="Groups to move into">
            {matches.length === 0 && <li className="panel-hint">No card by that name to move into.</li>}
            {matches.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => move(item.id)} title={where(item.id) || undefined}>
                  {item.title}
                  {where(item.id) && <span className="group-where"> · {where(item.id)}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </dd>
    </>
  );
}

/** A value with its parents, "Identity › SSO", for chips and menus. */
const valueLabel = (property: SelectProperty, value: ValueId) =>
  pathTo(property, value)
    .map((n) => n.label)
    .join(' › ');

/** Every value of a property in tree order, indented by level. */
function ValueOptions({ property }: { property: SelectProperty }) {
  const values = Object.keys(property.values).sort((a, b) => compareTreeOrder(property, a, b));
  return (
    <>
      {values.map((v) => (
        <option key={v} value={v}>
          {'   '.repeat(Math.max(0, depthOf(property, v)))}
          {property.values[v]!.label}
        </option>
      ))}
    </>
  );
}

const MIXED = '\u0000mixed';

function PropertyField({
  property,
  value,
  total,
  onEdit,
}: {
  property: SelectProperty;
  value: FieldValue;
  total: number;
  onEdit: (change: ValueEdit) => void;
}) {
  const label = property.name;
  if (!property.multi) {
    const current = value.mixed ? MIXED : (value.values[0] ?? '');
    return (
      <>
        <dt>{label}</dt>
        <dd>
          <select
            aria-label={label}
            value={current}
            onChange={(e) => onEdit({ kind: 'set', values: e.target.value === '' ? [] : [e.target.value] })}
          >
            {value.mixed && (
              <option value={MIXED} disabled>
                Mixed
              </option>
            )}
            <option value="">None</option>
            <ValueOptions property={property} />
          </select>
        </dd>
      </>
    );
  }
  const chips = value.mixed ? value.counts : value.values.map((v) => ({ value: v, count: total }));
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {chips.length > 0 && (
          <ul className="inspector-chips">
            {chips.map(({ value: v, count }) => (
              <li key={v} className={count < total ? 'partial' : undefined}>
                {valueLabel(property, v)}
                {count < total && <span className="chip-count"> · {count} of {total}</span>}
                <button
                  type="button"
                  aria-label={`Remove ${valueLabel(property, v)}`}
                  onClick={() => onEdit({ kind: 'remove', value: v })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <select
          aria-label={`Add ${label}`}
          value=""
          onChange={(e) => {
            if (e.target.value !== '') onEdit({ kind: 'add', value: e.target.value });
          }}
        >
          <option value="">{chips.length === 0 ? 'None. Add…' : 'Add…'}</option>
          <ValueOptions property={property} />
        </select>
      </dd>
    </>
  );
}

function Links({
  store,
  plan,
  id,
  onReveal,
  onNotice,
}: {
  store: PlanStore;
  plan: Plan;
  id: ItemId;
  onReveal: (id: ItemId) => void;
  onNotice: (text: string) => void;
}) {
  const { after, before, related } = ownLinks(plan, id);
  const title = (other: ItemId) => plan.items[other]?.title ?? '';
  const row = (d: Dependency, other: ItemId) => (
    <li key={`${d.from}->${d.to}`}>
      <button type="button" className="link" onClick={() => onReveal(other)} title="Show it on the board">
        {title(other)}
      </button>
      <button
        type="button"
        className="remove"
        aria-label={`Remove the link ${title(d.from)} → ${title(d.to)}`}
        onClick={() => {
          if (removeDependency(store, d.from, d.to)) onNotice(`Removed the link “${title(d.from)}” → “${title(d.to)}”`);
        }}
      >
        ✕
      </button>
    </li>
  );
  return (
    <section className="inspector-links" aria-label="Links">
      <h3>Comes after</h3>
      {after.length === 0 ? <p className="panel-hint">Nothing. Select a card, then this one, and press L.</p> : <ul>{after.map((d) => row(d, d.from))}</ul>}
      <h3>Comes before</h3>
      {before.length === 0 ? <p className="panel-hint">Nothing. Select this card, then another, and press L.</p> : <ul>{before.map((d) => row(d, d.to))}</ul>}
      <h3>Related</h3>
      {related.length === 0 ? (
        <p className="panel-hint">Nothing. Select this card and another, and press {keyNames().relate}. It sets no order.</p>
      ) : (
        <ul aria-label="Related">
          {related.map((other) => (
            <li key={`~${other}`}>
              <button type="button" className="link" onClick={() => onReveal(other)} title="Show it on the board">
                {title(other)}
              </button>
              <button
                type="button"
                className="remove"
                aria-label={`Remove the related link to ${title(other)}`}
                onClick={() => {
                  if (removeRelated(store, id, other)) onNotice(`“${title(id)}” and “${title(other)}” are no longer related`);
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type HistoryProps = { history: NonNullable<Props['history']> };
const who = (history: HistoryProps['history'], entry: HistoryEntry) => (entry.by === history.me ? 'You' : entry.name);

/** "Last changed by Ada, 10:42", under the title (requirement 36). */
function LastChanged({ history, id }: HistoryProps & { id: ItemId }) {
  const now = useNow();
  const time = (e: HistoryEntry) => shownTime(e, history.clocks.get(e.by));
  const [last] = entriesForItem(history.entries, id, time);
  if (!last) return null;
  return (
    <p className="inspector-changed" data-testid="last-changed">
      Last changed by {who(history, last)}, {formatWhen(time(last), now)}
    </p>
  );
}

/** A card's own history, newest first, in the same words as Activity. */
function CardHistory({ history, plan, id }: HistoryProps & { plan: Plan; id: ItemId }) {
  const now = useNow();
  const time = (e: HistoryEntry) => shownTime(e, history.clocks.get(e.by));
  const entries = entriesForItem(history.entries, id, time);
  const titles = titlesFrom(history.entries.flatMap((e) => e.changes));
  return (
    <section className="inspector-history" data-testid="card-history">
      <h3>History</h3>
      {entries.length === 0 ? (
        <p className="panel-hint">No changes recorded yet.</p>
      ) : (
        <ul>
          {entries.flatMap((entry) =>
            entry.changes.map((change, i) => (
              <li key={`${entry.id}:${i}`}>
                <span className="history-who">{who(history, entry)}</span> {describeChange(change, plan, (t) => titles.get(t))}
                {entry.via && <span className="activity-via"> ({entry.via})</span>}
                <time dateTime={new Date(time(entry)).toISOString()}>{formatWhen(time(entry), now)}</time>
              </li>
            )),
          )}
        </ul>
      )}
    </section>
  );
}
