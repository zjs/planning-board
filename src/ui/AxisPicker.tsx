import type { Plan } from '../domain/model.ts';
import { axisOptions, chooseAxis, swapAxes, type ViewChoice } from './axes.ts';

interface Props {
  plan: Plan;
  /** The choice as shown (validChoice). */
  choice: ViewChoice;
  onChange: (choice: ViewChoice) => void;
}

export function AxisPicker({ plan, choice, onChange }: Props) {
  const options = axisOptions(plan);
  const select = (which: 'x' | 'y', label: string) => (
    <label className="axis-select">
      <span>{label}</span>
      <select
        value={choice[which]}
        onChange={(e) => onChange(chooseAxis(plan, choice, which, e.target.value))}
        data-testid={`axis-${which}`}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="axis-picker">
      {select('y', 'Rows')}
      <button
        type="button"
        className="swap"
        title="Swap rows and columns"
        aria-label="Swap rows and columns"
        onClick={() => onChange(swapAxes(choice))}
      >
        ⇄
      </button>
      {select('x', 'Columns')}
    </div>
  );
}
