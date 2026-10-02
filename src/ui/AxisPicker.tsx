import type { Plan } from '../domain/model.ts';
import { axisOptions, chooseAxis, swapAxes, type ViewChoice } from './axes.ts';

interface Props {
  plan: Plan;
  /** The choice as shown (validChoice). */
  choice: ViewChoice;
  onChange: (choice: ViewChoice) => void;
  /** Fold or unfold every band on an axis (ADR 0013); absent for an axis with no bands. */
  foldAll: { x?: ((folded: boolean) => void) | undefined; y?: ((folded: boolean) => void) | undefined };
}

export function AxisPicker({ plan, choice, onChange, foldAll }: Props) {
  const options = axisOptions(plan);
  const select = (which: 'x' | 'y', label: string) => {
    const fold = foldAll[which];
    const name = options.find((o) => o.id === choice[which])?.label ?? '';
    return (
      <span className="axis-group">
        <label className="axis-select">
          <span>{label}</span>
          <select value={choice[which]} onChange={(e) => onChange(chooseAxis(choice, which, e.target.value))} data-testid={`axis-${which}`}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {fold && (
          <span className="fold-all" role="group" aria-label={`Fold ${name}`}>
            <button type="button" onClick={() => fold(true)} title={`Fold every ${name} band into one lane`}>
              Fold all
            </button>
            <button type="button" onClick={() => fold(false)} title={`Show every lane inside each ${name} band`}>
              Unfold all
            </button>
          </span>
        )}
      </span>
    );
  };
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
