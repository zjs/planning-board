import type { ReactNode } from 'react';
import type { Plan } from '../domain/model.ts';
import { currentStep, DUMP_SIZE, stepsDone, STEPS, type StepId } from './guide.ts';
import { keyNames } from './platform.ts';

/**
 * The guided start's coach panel (Q53), a column beside the board. It shows
 * every step, ticks off the ones done, and says how to do the current one;
 * doing it is what moves the guide on.
 */
export function Guide({
  plan,
  onSkip,
  onFinish,
  onHelp,
  onSample,
}: {
  plan: Plan;
  onSkip: () => void;
  onFinish: () => void;
  onHelp: () => void;
  onSample: () => void;
}) {
  const keys = keyNames();
  const step = currentStep(plan);
  const done = stepsDone(plan);
  const ideas = Object.keys(plan.items).length;
  const how: Record<StepId, ReactNode> = {
    dump: (
      <>
        Type an idea and press <kbd>Enter</kbd>: the next card starts right away, so keep typing.{' '}
        {ideas === 0 ? 'Double-click the board if the cursor isn’t in a card.' : `${ideas} of ${DUMP_SIZE} so far.`}
      </>
    ),
    area: (
      <>
        Click <b>+ Add area</b> at the bottom left, and name a part of the product, such as Billing. Add a couple more
        with <kbd>Enter</kbd>.
      </>
    ),
    sort: <>Drag an idea into an area’s row. While you drag, the card says where it will land.</>,
    view: (
      <>
        Click <b>Sizing</b> above the board, and drag a card into a size. Then click <b>Sequence</b> again: the card is
        still in its area. Every view shows the same cards.
      </>
    ),
    group: (
      <>
        Hold a card over another until it highlights, then let go: it goes inside. Or select two cards and press{' '}
        <kbd>{keys.group}</kbd>.
      </>
    ),
  };
  return (
    <aside className="guide" aria-label="Getting started" data-testid="guide">
      <header>
        <h2>{step ? 'Getting started' : 'That’s the board'}</h2>
        <span className="guide-progress">
          {done} of {STEPS.length}
        </span>
      </header>
      <ol className="guide-steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className={i < done ? 'done' : s === step ? 'current' : undefined} aria-current={s === step ? 'step' : undefined}>
            <span className="guide-mark" aria-hidden="true">
              {i < done ? '✓' : i + 1}
            </span>
            <span>
              <b className="guide-title">{s.title}</b>
              {s === step && <span className="guide-how">{how[s.id]}</span>}
            </span>
          </li>
        ))}
      </ol>
      {step ? (
        <div className="guide-actions">
          <button type="button" onClick={onSkip}>
            Skip the guide
          </button>
        </div>
      ) : (
        <>
          <p className="guide-how">
            Sort the same cards any way you need. Press <kbd>{keys.expand}</kbd> on a group to see inside it, select two
            cards and press <kbd>{keys.link}</kbd> to say one comes first, and right-click any card for everything else.
          </p>
          <div className="guide-actions">
            <button type="button" onClick={onHelp}>
              Cheat sheet
            </button>
            <button type="button" onClick={onSample}>
              Look at a sample plan
            </button>
            <button type="button" className="primary" onClick={onFinish}>
              Done
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
