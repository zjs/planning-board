import { useEffect, useMemo, useState } from 'react';
import type { Plan } from '../domain/model.ts';
import { parsePlanJson } from '../domain/planJson.ts';
import { layoutView } from '../domain/view.ts';
import sample from '../seed/sample-plan.json';
import { AxisPicker } from './AxisPicker.tsx';
import { loadViewChoice, optionById, saveViewChoice, toViewSpec } from './axes.ts';
import { Board } from './Board.tsx';

function loadSample(): Plan {
  const result = parsePlanJson(sample);
  if (!result.ok) throw new Error(`Sample plan is invalid:\n${result.errors.join('\n')}`);
  return result.plan;
}

export function App() {
  // Read-only in slice 1; slice 2 replaces this with the Yjs document.
  const plan = useMemo(() => loadSample(), []);
  const [choice, setChoice] = useState(loadViewChoice);
  useEffect(() => saveViewChoice(choice), [choice]);
  const layout = useMemo(() => layoutView(plan, toViewSpec(choice)), [plan, choice]);

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Planning Board</h1>
        <AxisPicker choice={choice} onChange={setChoice} />
        <span className="build-tag">sprint 0 · read-only preview</span>
      </header>
      <Board plan={plan} layout={layout} xLabel={optionById(choice.x).label} yLabel={optionById(choice.y).label} />
    </div>
  );
}
