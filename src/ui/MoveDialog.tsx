import { useEffect, useRef, useState } from 'react';
import { applyMove, planMove, type MovedPlan } from '../commands/move.ts';
import { browserWriter } from '../commands/moveWriter.ts';
import { MOVE_FROM_KEY, MOVE_PAGE, MOVE_TO_KEY, NEW_PUBLIC_APP, isMoveBundle, type MoveBundle } from '../move/addresses.ts';
import { Dialog } from './Dialog.tsx';

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The page at the old address that hands its plans over (move.html). Tests point it at this computer. */
function movePage(): URL {
  return new URL(stored(MOVE_FROM_KEY) ?? MOVE_PAGE);
}

/** Whether this page is the public build at its new address, where plans can be brought from the old one (Q80 d). */
export function canBringPlans(): boolean {
  try {
    return location.origin === new URL(stored(MOVE_TO_KEY) ?? NEW_PUBLIC_APP).origin;
  } catch {
    return false;
  }
}

/** Whether a page was opened to bring plans: `#moved`, or a share link the old address sent on with `&moved=1`. */
export const asksToMove = (hash: string) => /(?:^#|&)moved(?:=1)?(?:&|$)/.test(hash);

type Step =
  | { kind: 'ask' }
  | { kind: 'waiting' }
  | { kind: 'blocked' }
  | { kind: 'review'; bundle: MoveBundle; moves: MovedPlan[] }
  | { kind: 'adding' }
  | { kind: 'failed'; reason: string };

/**
 * Bring the plans this browser keeps at the old address of the public build
 * (Q80 d, ADR 0025). A tab at the old address reads them and posts them here;
 * nothing is added until the person has seen which plans they are.
 */
export function MoveDialog({ onClose, onMoved }: { onClose: () => void; onMoved: (moves: MovedPlan[]) => void }) {
  const [step, setStep] = useState<Step>({ kind: 'ask' });
  const popup = useRef<Window | null>(null);
  const from = movePage();

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Only the tab this dialog opened, at the old address, is listened to.
      if (popup.current === null || e.source !== popup.current || e.origin !== from.origin) return;
      popup.current = null;
      if (isMoveBundle(e.data)) setStep({ kind: 'review', bundle: e.data, moves: planMove(e.data) });
      else setStep({ kind: 'failed', reason: 'Your plans couldn’t be read at the old address.' });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [from.origin]);

  const open = () => {
    popup.current = window.open(from.href, 'planning-board-move', 'popup,width=520,height=320');
    setStep(popup.current ? { kind: 'waiting' } : { kind: 'blocked' });
  };

  const add = async (bundle: MoveBundle) => {
    setStep({ kind: 'adding' });
    try {
      onMoved(await applyMove(bundle, browserWriter));
    } catch (error) {
      setStep({ kind: 'failed', reason: error instanceof Error ? error.message : String(error) });
    }
  };

  const oldHost = from.host;
  const close = (
    <button type="button" onClick={onClose}>
      {step.kind === 'review' ? 'Cancel' : 'Close'}
    </button>
  );
  return (
    <Dialog title={`Bring your plans from ${oldHost}`} onClose={onClose} testId="move-dialog">
      {step.kind === 'ask' && (
        <>
          <p>
            Planning Board used to be at <code>{oldHost}</code>, and a browser keeps plans for each address apart. To bring
            the plans this browser kept there, a tab opens at the old address, reads them, and hands them over.
          </p>
          <div className="dialog-actions">
            {close}
            <button type="button" className="primary" onClick={open} data-testid="move-open">
              Open {oldHost}
            </button>
          </div>
        </>
      )}
      {step.kind === 'waiting' && (
        <>
          <p role="status">Waiting for the tab at {oldHost} to read your plans…</p>
          <div className="dialog-actions">{close}</div>
        </>
      )}
      {step.kind === 'blocked' && (
        <>
          <p className="share-problem" role="alert">
            Your browser didn’t open the tab. Allow pop-ups for this page and try again, or open{' '}
            <a href={new URL('.', from).href}>{oldHost}</a> and save each plan to a file.
          </p>
          <div className="dialog-actions">
            {close}
            <button type="button" className="primary" onClick={open}>
              Try again
            </button>
          </div>
        </>
      )}
      {step.kind === 'review' &&
        (step.moves.length === 0 ? (
          <>
            <p>This browser keeps no plans at {oldHost}, so there’s nothing to bring.</p>
            <div className="dialog-actions">{close}</div>
          </>
        ) : (
          <>
            <p>These plans are kept at {oldHost}. They’re added here, with their sharing and history.</p>
            <ul data-testid="move-plans">
              {step.moves.map((m) => (
                <li key={m.entry.id}>
                  {m.entry.name}
                  {m.into === 'existing' && <span className="muted"> (already here: its changes are added to it)</span>}
                </li>
              ))}
            </ul>
            <div className="dialog-actions">
              {close}
              <button type="button" className="primary" data-testid="move-add" onClick={() => void add(step.bundle)}>
                Add {step.moves.length === 1 ? 'this plan' : `these ${step.moves.length} plans`}
              </button>
            </div>
          </>
        ))}
      {step.kind === 'adding' && <p role="status">Adding your plans…</p>}
      {step.kind === 'failed' && (
        <>
          <p className="share-problem" role="alert">
            {step.reason} Open <a href={new URL('.', from).href}>{oldHost}</a> and save each plan to a file instead.
          </p>
          <div className="dialog-actions">{close}</div>
        </>
      )}
    </Dialog>
  );
}
