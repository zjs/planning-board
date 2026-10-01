import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { editCardValues, removeDependency, renameItem, setDescription, type PlanStore } from '../commands/store.ts';
import { compareTreeOrder, depthOf, pathTo } from '../domain/hierarchy.ts';
import { ownLinks, selectionValues, type FieldValue, type ValueEdit } from '../domain/inspector.ts';
import type { Dependency, ItemId, Plan, SelectProperty, ValueId } from '../domain/model.ts';
import { propertiesInOrder } from '../domain/properties.ts';
import { ancestry } from '../domain/tree.ts';

interface Props {
  store: PlanStore;
  plan: Plan;
  /** The selected cards, in the order they were selected. */
  selected: readonly ItemId[];
  /** Why each card doesn't fit its group (requirement 13). */
  mismatches: ReadonlyMap<ItemId, string[]>;
  onClose: () => void;
  /** Show a card on the board: zoom to its level and select it. */
  onReveal: (id: ItemId) => void;
  /** Say what just happened, with an Undo for it. */
  onNotice: (text: string) => void;
}

/**
 * The card inspector (questions.md Q35): every property of the selected
 * cards, editable without pivoting, plus a single card's title,
 * description, Jira key and links. Edits apply to every selected card.
 */
export function Inspector({ store, plan, selected, mismatches, onClose, onReveal, onNotice }: Props) {
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
      {single && <Links store={store} plan={plan} id={single.id} onReveal={onReveal} onNotice={onNotice} />}
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
  const { after, before } = ownLinks(plan, id);
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
    <section className="inspector-links" aria-label="Dependencies">
      <h3>Comes after</h3>
      {after.length === 0 ? <p className="panel-hint">Nothing. Select a card, then this one, and press L.</p> : <ul>{after.map((d) => row(d, d.from))}</ul>}
      <h3>Comes before</h3>
      {before.length === 0 ? <p className="panel-hint">Nothing. Select this card, then another, and press L.</p> : <ul>{before.map((d) => row(d, d.to))}</ul>}
    </section>
  );
}
