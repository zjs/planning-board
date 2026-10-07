import type { Plan } from '../domain/model.ts';
import { AxisPicker } from './AxisPicker.tsx';
import { activePreset, presetsFor, type ViewChoice } from './axes.ts';

interface Props {
  plan: Plan;
  /** The choice as shown (validChoice). */
  choice: ViewChoice;
  onChange: (choice: ViewChoice) => void;
  foldAll: { x?: ((folded: boolean) => void) | undefined; y?: ((folded: boolean) => void) | undefined };
}

/**
 * Between the toolbar and the board: built-in views one click away, and the
 * Rows and Columns pickers for any other pair (Q52, ADR 0015).
 */
export function ViewBar({ plan, choice, onChange, foldAll }: Props) {
  const active = activePreset(choice);
  return (
    <div className="view-bar" data-testid="view-bar">
      <div className="presets" role="group" aria-label="Views">
        <span className="view-bar-label">View</span>
        {presetsFor(plan).map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={active?.id === preset.id}
            title={preset.title}
            data-testid={`preset-${preset.id}`}
            onClick={() => onChange(preset.choice)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <span className="divider" />
      <AxisPicker plan={plan} choice={choice} onChange={onChange} foldAll={foldAll} />
    </div>
  );
}
