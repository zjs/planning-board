import { useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import {
  addValue,
  createProperty,
  deleteProperty,
  renameProperty,
  type PlanStore,
} from '../commands/store.ts';
import type { Plan, Property, PropertyId, SelectProperty, ValueId } from '../domain/model.ts';
import {
  cardsWithProperty,
  isBuiltIn,
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
}: {
  store: PlanStore;
  plan: Plan;
  property: Property;
  open: boolean;
  onToggle: (open: boolean) => void;
  onShowAsRows: () => void;
  onDelete: (() => void) | undefined;
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
          <ValueTree store={store} property={property} parent={null} depth={0} />
        )}
      </div>
    </details>
  );
}

/** A property's values under `parent`, with a way to add one at each level. */
function ValueTree({
  store,
  property,
  parent,
  depth,
}: {
  store: PlanStore;
  property: SelectProperty;
  parent: ValueId | null;
  depth: number;
}) {
  const level = property.levels[depth] ?? property.name;
  const values = siblingsOf(property, parent);
  const deeper = depth + 1 < property.levels.length;
  return (
    <ul className="value-list" data-level={depth}>
      {values.map((node) => (
        <li key={node.id} data-value={node.id}>
          <span className="value-label">{node.label}</span>
          {deeper && <ValueTree store={store} property={property} parent={node.id} depth={depth + 1} />}
        </li>
      ))}
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
  initial,
  problem,
  onCommit,
}: {
  label: string;
  buttonText: string;
  initial: string;
  problem: (text: string) => string | null;
  onCommit: (text: string) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (text === null) {
    return (
      <button type="button" onClick={() => setText(initial)} aria-label={label}>
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
