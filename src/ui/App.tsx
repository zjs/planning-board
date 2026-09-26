import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  dropCard,
  loadPlan,
  openPlanStore,
  redo,
  resetPlan,
  snapshotSource,
  undo,
  type PersistenceStatus,
  type PlanStore,
} from '../commands/store.ts';
import type { ItemId, Plan } from '../domain/model.ts';
import type { DropMode, DropTarget } from '../domain/move.ts';
import { parsePlanJson } from '../domain/planJson.ts';
import { layoutView, type CardRef } from '../domain/view.ts';
import sample from '../seed/sample-plan.json';
import { AxisPicker } from './AxisPicker.tsx';
import { loadViewChoice, optionById, saveViewChoice, toViewSpec } from './axes.ts';
import { Board } from './Board.tsx';
import { DragGhost } from './DragGhost.tsx';
import { Legend, legendInitiallyOpen, rememberLegendClosed } from './Legend.tsx';
import { keyNames } from './platform.ts';
import { useCardDrag } from './useCardDrag.ts';

function samplePlan(): Plan {
  const result = parsePlanJson(sample);
  if (!result.ok) throw new Error(`Sample plan is invalid:\n${result.errors.join('\n')}`);
  return result.plan;
}

// Opened once per page, outside React, so StrictMode's double effects
// don't attach two storage providers to the same database.
let opening: ReturnType<typeof openPlanStore> | null = null;

export function App() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof openPlanStore>> | null>(null);
  useEffect(() => {
    let live = true;
    void (opening ??= openPlanStore()).then((s) => {
      if (live) setSession(s);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!session) return <div className="loading">Loading…</div>;
  return <Workspace store={session.store} persistence={session.persistence} />;
}

const JUST_MOVED_MS = 1400;

function Workspace({ store, persistence }: { store: PlanStore; persistence: PersistenceStatus }) {
  const source = useMemo(() => snapshotSource(store), [store]);
  const { plan, empty, canUndo, canRedo } = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const [choice, setChoice] = useState(loadViewChoice);
  useEffect(() => saveViewChoice(choice), [choice]);
  const view = useMemo(() => toViewSpec(choice), [choice]);
  const layout = useMemo(() => layoutView(plan, view), [plan, view]);
  // The add modifier only means something when an axis holds several values.
  const canAdd = [view.x, view.y].some((axis) => {
    const property = plan.properties[axis.property];
    return property?.kind === 'select' && property.multi;
  });

  const [justMoved, setJustMoved] = useState<ItemId | null>(null);
  useEffect(() => {
    if (justMoved === null) return;
    const timer = setTimeout(() => setJustMoved(null), JUST_MOVED_MS);
    return () => clearTimeout(timer);
  }, [justMoved]);

  const onDrop = useCallback(
    (card: CardRef, target: DropTarget, mode: DropMode) => {
      if (dropCard(store, view, card, target, mode)) setJustMoved(card.itemId);
    },
    [store, view],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [legendOpen, setLegendOpen] = useState(legendInitiallyOpen);
  const closeLegend = () => {
    setLegendOpen(false);
    rememberLegendClosed();
  };
  const keys = keyNames();
  const { drag, startDrag } = useCardDrag(onDrop, scrollRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) undo(store);
      else if ((key === 'z' && e.shiftKey) || key === 'y') redo(store);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  const loadSample = () => {
    if (empty || window.confirm('Replace the board with the sample plan? You can undo this.')) loadPlan(store, samplePlan());
  };
  const reset = () => {
    if (window.confirm('Clear the whole board? You can undo this.')) resetPlan(store);
  };

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Planning Board</h1>
        <AxisPicker choice={choice} onChange={setChoice} />
        <div className="actions">
          <button type="button" onClick={() => undo(store)} disabled={!canUndo} title={`Undo (${keys.undo})`}>
            ↶ Undo
          </button>
          <button type="button" onClick={() => redo(store)} disabled={!canRedo} title={`Redo (${keys.redo})`}>
            ↷ Redo
          </button>
          <span className="divider" />
          <button type="button" onClick={loadSample}>
            Load sample plan
          </button>
          <button type="button" onClick={reset} disabled={empty}>
            Reset
          </button>
          <span className="divider" />
          <button
            type="button"
            onClick={() => (legendOpen ? closeLegend() : setLegendOpen(true))}
            aria-pressed={legendOpen}
            title="How it works"
          >
            ? Help
          </button>
        </div>
      </header>
      {persistence === 'unavailable' && (
        <div className="banner" role="status">
          This browser isn't letting the board save, so changes will be lost when you reload. Chrome and Edge are
          known to work.
        </div>
      )}
      {empty ? (
        <div className="empty-state">
          <h2>No plan yet</h2>
          <p>Load the sample plan: about 150 roadmap items for a fictional product line.</p>
          <button type="button" className="primary" onClick={loadSample}>
            Load sample plan
          </button>
        </div>
      ) : (
        <Board
          plan={plan}
          view={view}
          layout={layout}
          xLabel={optionById(choice.x).label}
          yLabel={optionById(choice.y).label}
          lifted={drag?.card ?? null}
          target={drag?.target ?? null}
          onCardPointerDown={startDrag}
          justMoved={justMoved}
          scrollRef={scrollRef}
        />
      )}
      {legendOpen && <Legend onClose={closeLegend} />}
      {drag && <DragGhost drag={drag} canAdd={canAdd} />}
    </div>
  );
}
