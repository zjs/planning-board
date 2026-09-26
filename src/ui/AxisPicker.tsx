import { AXIS_OPTIONS, chooseAxis, type ViewChoice } from './axes.ts';

interface Props {
  choice: ViewChoice;
  onChange: (choice: ViewChoice) => void;
}

export function AxisPicker({ choice, onChange }: Props) {
  const select = (which: 'x' | 'y', label: string) => (
    <label className="axis-select">
      <span>{label}</span>
      <select
        value={choice[which]}
        onChange={(e) => onChange(chooseAxis(choice, which, e.target.value))}
        data-testid={`axis-${which}`}
      >
        {AXIS_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="axis-picker">
      {select('x', 'Columns')}
      <button
        type="button"
        className="swap"
        title="Swap rows and columns"
        aria-label="Swap rows and columns"
        onClick={() => onChange({ x: choice.y, y: choice.x })}
      >
        ⇄
      </button>
      {select('y', 'Rows')}
    </div>
  );
}
