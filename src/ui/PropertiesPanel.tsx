import { useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import {
  addValue,
  createProperty,
  deleteProperty,
  deleteValue,
  moveValue,
  renameLevel,
  renameProperty,
  renameValue,
  reorderValue,
  type PlanStore,
} from '../commands/store.ts';
import type { Plan, Property, PropertyId, SelectProperty, ValueId } from '../domain/model.ts';
import {
  cardsWithProperty,
  isBuiltIn,
  levelNameProblem,
  moveTargets,
  propertiesInOrder,
  propertyNameProblem,
  siblingsOf,
  valueLabelProblem,
} from '../domain/properties.ts';
import { inSentence } from './axes.ts';

interface Props {
  store: PlanStore;
  plan: Plan;
  onClose: () => void;
  /** Show a property's top level on the board's rows. */
  onShowAsRows: (property: PropertyId) => void;
  /** Say what just happened, with an Undo for it. */
  onNotice: (text: string) => void;
}

/**
 * The plan's properties and their values (requirements 25–27). Built-in
 * properties can be renamed but not deleted; custom ones are flat for now
 * (questions.md Q25).
 */
export function PropertiesPanel({ store, plan, onClose, onShowAsRows, onNotice }: Props) {
  // Newly added properties open, so their values can be added straight away.
  const [opened, setOpened] = useState<ReadonlySet<PropertyId>>(() => new Set());
  const toggle = (id: PropertyId, open: boolean) =>
    setOpened((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  const remove = (property: SelectProperty) => {
    const count = cardsWithProperty(plan, property.id).length;
    const question =
      count > 0
        ? `Delete “${property.name}”? ${count} ${count === 1 ? 'card has' : 'cards have'} a ${property.name} value. You can undo this.`
        : `Delete “${property.name}”? You can undo this.`;
    if (!window.confirm(question)) return;
    if (deleteProperty(store, property.id) !== null) onNotice(`Deleted property “${property.name}”`);
  };

  return (
    <aside className="properties-panel" aria-label="Properties" data-testid="properties-panel">
      <header>
        <h2>Properties</h2>
        <button type="button" onClick={onClose} aria-label="Close properties">
          ✕
        </button>
      </header>
      <p className="panel-hint">
        Every property can be a row or column on the board. Dragging a card into a lane gives it that value.
      </p>
      {propertiesInOrder(plan).map((property) => (
        <PropertySection
          key={property.id}
          store={store}
          plan={plan}
          property={property}
          open={opened.has(property.id)}
          onToggle={(open) => toggle(property.id, open)}
          onShowAsRows={() => onShowAsRows(property.id)}
          onDelete={property.kind === 'select' && !isBuiltIn(property.id) ? () => remove(property) : undefined}
          onNotice={onNotice}
        />
      ))}
      <NewProperty
        plan={plan}
        onCreate={(name, multi) => {
          const id = createProperty(store, name, multi);
          if (id) toggle(id, true);
          return id !== null;
        }}
      />
    </aside>
  );
}

function PropertySection({
  store,
  plan,
  property,
  open,
  onToggle,
  onShowAsRows,
  onDelete,
  onNotice,
}: {
  store: PlanStore;
  plan: Plan;
  property: Property;
  open: boolean;
  onToggle: (open: boolean) => void;
  onShowAsRows: () => void;
  onDelete: (() => void) | undefined;
  onNotice: (text: string) => void;
}) {
  const kind = isBuiltIn(property.id)
    ? 'Built-in'
    : property.kind === 'select' && property.multi
      ? 'Several values per card'
      : 'One value per card';
  const count = property.kind === 'select' ? Object.keys(property.values).length : null;
  return (
    <details
      className="property"
      data-property={property.id}
      open={open}
      onToggle={(e) => {
        if (e.currentTarget.open !== open) onToggle(e.currentTarget.open);
      }}
    >
      <summary>
        <span className="property-name">{property.name}</span>
        <span className="property-kind">
          {kind}
          {count !== null && ` · ${count} ${count === 1 ? 'value' : 'values'}`}
        </span>
      </summary>
      <div className="property-body">
        <div className="property-actions">
          <InlineEdit
            label={`Rename ${property.name}`}
            buttonText="Rename"
            initial={property.name}
            problem={(name) => propertyNameProblem(plan, name, property.id)}
            onCommit={(name) => renameProperty(store, property.id, name)}
          />
          <button type="button" onClick={onShowAsRows}>
            Show as rows
          </button>
          {onDelete && (
            <button type="button" className="danger" onClick={onDelete}>
              Delete
            </button>
          )}
        </div>
        {property.kind === 'sequence' ? (
          <p className="panel-hint">Positions come from the board: drop a card between two columns to open a new one.</p>
        ) : (
          <>
            {property.levels.length > 1 && <Levels store={store} property={property} />}
            <ValueTree store={store} plan={plan} property={property} parent={null} depth={0} onNotice={onNotice} />
          </>
        )}
      </div>
    </details>
  );
}

/** A hierarchy's level names, such as Area › Component, each renamable. */
function Levels({ store, property }: { store: PlanStore; property: SelectProperty }) {
  return (
    <div className="levels">
      <span className="levels-label">Levels</span>
      {property.levels.map((level, i) => (
        <span key={i} className="level">
          {i > 0 && <span className="level-sep">›</span>}
          <InlineEdit
            label={`Rename level ${level}`}
            buttonText={level}
            buttonClass="link"
            initial={level}
            problem={(name) => levelNameProblem(property, i, name)}
            onCommit={(name) => renameLevel(store, property.id, i, name)}
          />
        </span>
      ))}
    </div>
  );
}

/**
 * A property's values under `parent`: rename (click the name), reorder,
 * move to another parent, delete (Q4), and add one at the end.
 */
function ValueTree({
  store,
  plan,
  property,
  parent,
  depth,
  onNotice,
}: {
  store: PlanStore;
  plan: Plan;
  property: SelectProperty;
  parent: ValueId | null;
  depth: number;
  onNotice: (text: string) => void;
}) {
  const level = property.levels[depth] ?? property.name;
  const values = siblingsOf(property, parent);
  const deeper = depth + 1 < property.levels.length;

  const remove = (id: ValueId) => {
    const node = property.values[id]!;
    const below = Object.values(property.values).filter((n) => n.parent === id).length;
    if (below > 0) {
      const childLevel = inSentence(property.levels[depth + 1] ?? 'value');
      const question = `Delete “${node.label}” and the ${below} ${below === 1 ? childLevel : `${childLevel}s`} inside it? You can undo this.`;
      if (!window.confirm(question)) return;
    }
    const result = deleteValue(store, property.id, id);
    if (!result) return;
    const n = result.cards;
    const cards = `${n} ${n === 1 ? 'card' : 'cards'}`;
    const where =
      n === 0
        ? ''
        : result.parent !== null
          ? ` · ${cards} moved to ${property.values[result.parent]?.label ?? 'its parent'}`
          : ` · ${cards} now ${n === 1 ? 'has' : 'have'} no ${inSentence(level)}`;
    onNotice(`Deleted “${node.label}”${where}`);
  };

  return (
    <ul className="value-list" data-level={depth}>
      {values.map((node, i) => {
        const targets = moveTargets(property, node.id);
        return (
          <li key={node.id} data-value={node.id}>
            <div className="value-row">
              <InlineEdit
                label={`Rename ${node.label}`}
                buttonText={node.label}
                buttonClass="value-label"
                initial={node.label}
                problem={(label) => valueLabelProblem(property, label, node.parent, node.id)}
                onCommit={(label) => renameValue(store, property.id, node.id, label)}
              />
              <span className="value-tools">
                <button
                  type="button"
                  aria-label={`Move ${node.label} up`}
                  title="Move up"
                  disabled={i === 0}
                  onClick={() => reorderValue(store, property.id, node.id, 'up')}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${node.label} down`}
                  title="Move down"
                  disabled={i === values.length - 1}
                  onClick={() => reorderValue(store, property.id, node.id, 'down')}
                >
                  ↓
                </button>
                {targets.length > 0 && (
                  <select
                    aria-label={`Move ${node.label} to`}
                    title={`Move to another ${inSentence(property.levels[depth - 1] ?? 'parent')}`}
                    value=""
                    onChange={(e) => {
                      if (moveValue(store, property.id, node.id, e.target.value)) {
                        onNotice(`Moved “${node.label}” to ${property.values[e.target.value]?.label ?? ''}`);
                      }
                    }}
                  >
                    <option value="">Move to…</option>
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  className="danger"
                  aria-label={`Delete ${node.label}`}
                  title="Delete"
                  onClick={() => remove(node.id)}
                >
                  ✕
                </button>
              </span>
            </div>
            {deeper && (
              <ValueTree
                store={store}
                plan={plan}
                property={property}
                parent={node.id}
                depth={depth + 1}
                onNotice={onNotice}
              />
            )}
          </li>
        );
      })}
      <li className="add-value">
        <AddField
          placeholder={parent === null ? `Add ${inSentence(level)}` : `Add ${inSentence(level)} here`}
          label={`Add ${inSentence(level)}${parent === null ? '' : ` to ${property.values[parent]?.label ?? ''}`}`}
          problem={(label) => valueLabelProblem(property, label, parent)}
          onAdd={(label) => addValue(store, property.id, label, parent) !== null}
        />
      </li>
    </ul>
  );
}

function NewProperty({ plan, onCreate }: { plan: Plan; onCreate: (name: string, multi: boolean) => boolean }) {
  const [name, setName] = useState('');
  const [multi, setMulti] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    const problem = propertyNameProblem(plan, name);
    if (problem) {
      setError(problem);
      return;
    }
    if (onCreate(name, multi)) {
      setName('');
      setError(null);
    }
  };
  return (
    <form className="new-property" onSubmit={submit} data-testid="new-property">
      <h3>New property</h3>
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        placeholder="Name, such as Team or Customer"
        aria-label="New property name"
      />
      <fieldset>
        <label>
          <input type="radio" name="multi" checked={!multi} onChange={() => setMulti(false)} /> One value per card
        </label>
        <label>
          <input type="radio" name="multi" checked={multi} onChange={() => setMulti(true)} /> Several values per card
        </label>
      </fieldset>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit">Add property</button>
    </form>
  );
}

/** A one-line field that adds what's typed on Enter, and stays open for the next one. */
function AddField({
  placeholder,
  label,
  problem,
  onAdd,
}: {
  placeholder: string;
  label: string;
  problem: (text: string) => string | null;
  onAdd: (text: string) => boolean;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setText('');
      setError(null);
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (text.trim() === '') return;
    const why = problem(text);
    if (why) setError(why);
    else if (onAdd(text)) setText('');
  };
  return (
    <>
      <input
        className="add-field"
        value={text}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
      />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** A button that turns into a text field: Enter saves, Esc cancels, leaving the field saves. */
export function InlineEdit({
  label,
  buttonText,
  buttonClass,
  initial,
  problem,
  onCommit,
}: {
  label: string;
  buttonText: string;
  buttonClass?: string;
  initial: string;
  problem: (text: string) => string | null;
  onCommit: (text: string) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (text === null) {
    return (
      <button type="button" className={buttonClass} onClick={() => setText(initial)} aria-label={label} title={label}>
        {buttonText}
      </button>
    );
  }
  const finish = (commit: boolean) => {
    if (commit && text.trim() !== initial) {
      const why = problem(text);
      if (why) {
        setError(why);
        return;
      }
      onCommit(text);
    }
    setText(null);
    setError(null);
  };
  return (
    <span className="inline-edit">
      <input
        autoFocus
        value={text}
        aria-label={label}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            finish(false);
          }
        }}
        onBlur={() => finish(true)}
      />
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
