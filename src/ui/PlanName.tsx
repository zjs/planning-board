import { useEffect, useState } from 'react';
import { HeaderField } from './HeaderField.tsx';

/**
 * The open plan's name, in the toolbar (Q67, ADR 0021). Double-click it to
 * rename, like a row or column header (Q55). The browser tab shows it too.
 */
export function PlanName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    document.title = `${name} · Planning Board`;
  }, [name]);
  if (editing) {
    return (
      <span className="plan-name-field">
        <HeaderField
          initial={name}
          label="Plan name"
          onCommit={(text) => {
            const next = text.trim();
            if (next === '') return 'A plan needs a name.';
            onRename(next);
            return null;
          }}
          onDone={() => setEditing(false)}
        />
      </span>
    );
  }
  return (
    <h1 data-testid="plan-name" title="Double-click to rename this plan" onDoubleClick={() => setEditing(true)}>
      {name}
    </h1>
  );
}
