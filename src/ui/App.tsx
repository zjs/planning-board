import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  createItem,
  deleteItems,
  dropCard,
  groupItems,
  loadPlan,
  moveToParent,
  openPlanStore,
  redo,
  renameItem,
  resetPlan,
  snapshotSource,
  undo,
  ungroupItems,
  type PersistenceStatus,
  type PlanStore,
} from '../commands/store.ts';
import type { ItemId, Plan } from '../domain/model.ts';
import type { DropMode, DropTarget } from '../domain/move.ts';
import { parsePlanJson } from '../domain/planJson.ts';
import { ancestry, childCounts, childrenOf } from '../domain/tree.ts';
import { layoutView, type CardRef, type ViewSpec } from '../domain/view.ts';
import sample from '../seed/sample-plan.json';
import { AxisPicker } from './AxisPicker.tsx';
import {
  loadCompactHolding,
  loadViewChoice,
  loadZoomPath,
  optionById,
  saveCompactHolding,
  saveViewChoice,
  saveZoomPath,
  toViewSpec,
} from './axes.ts';
import { Board, type Editing } from './Board.tsx';
import { DragGhost } from './DragGhost.tsx';
import { Legend, legendInitiallyOpen, rememberLegendClosed } from './Legend.tsx';
import { keyNames } from './platform.ts';
import { isParentTarget, useCardDrag, type BoardTarget } from './useCardDrag.ts';
import { ZoomBar } from './ZoomBar.tsx';

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
const NOTICE_MS = 8000;

/** A short message after a delete, with its own Undo. `step` is the delete's own undo step. */
interface Notice {
  text: string;
  step: unknown;
}

function Workspace({ store, persistence }: { store: PlanStore; persistence: PersistenceStatus }) {
  const source = useMemo(() => snapshotSource(store), [store]);
  const { plan, empty, canUndo, canRedo } = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const [choice, setChoice] = useState(loadViewChoice);
  useEffect(() => saveViewChoice(choice), [choice]);
  // Zoom (requirement 12, ADR 0008): the path of cards zoomed into. If one is
  // deleted, the view falls back to the deepest one that still exists.
  const [zoomPath, setZoomPath] = useState<ItemId[]>(loadZoomPath);
  useEffect(() => saveZoomPath(zoomPath), [zoomPath]);
  const root = useMemo(() => [...zoomPath].reverse().find((id) => plan.items[id]) ?? null, [zoomPath, plan]);
  const view = useMemo(() => ({ ...toViewSpec(choice), root }), [choice, root]);
  const counts = useMemo(() => childCounts(plan), [plan]);
  const layout = useMemo(() => layoutView(plan, view), [plan, view]);
  // The add modifier only means something on an axis that holds several values.
  const isMulti = (axis: ViewSpec['x']) => {
    const property = plan.properties[axis.property];
    return property?.kind === 'select' && property.multi;
  };
  const addAxes = { x: isMulti(view.x), y: isMulti(view.y) };
  const [compact, setCompact] = useState(loadCompactHolding);
  useEffect(() => saveCompactHolding(compact), [compact]);

  const [justMoved, setJustMoved] = useState<ItemId | null>(null);
  useEffect(() => {
    if (justMoved === null) return;
    const timer = setTimeout(() => setJustMoved(null), JUST_MOVED_MS);
    return () => clearTimeout(timer);
  }, [justMoved]);

  // Selection is viewer state, never part of the plan (docs/plans/sprint-1-plan.md).
  const [selection, setSelection] = useState<ReadonlySet<ItemId>>(() => new Set());
  // The last copy clicked, so Enter renames the copy you're looking at.
  const [anchor, setAnchor] = useState<CardRef | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Deleted or undone items drop out of the selection.
  const selected = useMemo(() => new Set([...selection].filter((id) => plan.items[id])), [selection, plan]);

  const onDrop = useCallback(
    (card: CardRef, target: BoardTarget, mode: DropMode) => {
      if (!isParentTarget(target)) {
        if (dropCard(store, view, card, target, mode)) setJustMoved(card.itemId);
        return;
      }
      // Dropped on the breadcrumb: move the card out to that level. It leaves this view, so say where it went.
      if (moveToParent(store, [card.itemId], target.parent).length === 0) return;
      const title = plan.items[card.itemId]?.title ?? 'card';
      const to = target.parent === null ? 'the plan' : (plan.items[target.parent]?.title ?? 'the plan');
      setNotice({ text: `Moved “${title}” out to ${to}`, step: store.undoManager.undoStack.at(-1) });
    },
    [store, view, plan],
  );

  const onCardClick = useCallback(
    (card: CardRef, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
      setAnchor(card);
      setSelection((current) => {
        if (!(e.shiftKey || e.metaKey || e.ctrlKey)) return new Set([card.itemId]);
        const next = new Set(current);
        if (next.has(card.itemId)) next.delete(card.itemId);
        else next.add(card.itemId);
        return next;
      });
    },
    [],
  );
  const clearSelection = useCallback(() => setSelection(new Set()), []);

  // Scroll positions per zoom level, so zooming back out returns you to where you were.
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolls = useRef(new Map<string, { left: number; top: number }>());
  const zoomTo = useCallback(
    (id: ItemId | null) => {
      const el = scrollRef.current;
      if (el) scrolls.current.set(root ?? '', { left: el.scrollLeft, top: el.scrollTop });
      setZoomPath(id === null ? [] : ancestry(plan, id));
      setEditing(null);
      // Selection outside the new level would be invisible, and Delete would still reach it.
      setSelection(new Set());
    },
    [plan, root],
  );
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const saved = scrolls.current.get(root ?? '');
    el?.scrollTo(saved?.left ?? 0, saved?.top ?? 0);
  }, [root]);
  const zoomOut = useCallback(() => {
    if (root === null) return;
    zoomTo(ancestry(plan, root).at(-2) ?? null);
    // Land on the card you came out of.
    setSelection(new Set([root]));
    setJustMoved(root);
  }, [plan, root, zoomTo]);

  // Double-click zooms into a group, and renames any other card (Q20: ⌘↓ zooms into those).
  const onCardDoubleClick = useCallback(
    (card: CardRef) => {
      if (counts.has(card.itemId)) {
        zoomTo(card.itemId);
        return;
      }
      setSelection(new Set([card.itemId]));
      setAnchor(card);
      setEditing({ kind: 'rename', card });
    },
    [counts, zoomTo],
  );
  const onSpotDoubleClick = useCallback((spot: DropTarget) => setEditing({ kind: 'new', spot }), []);
  const onCancelEdit = useCallback(() => setEditing(null), []);
  const onCommitEdit = useCallback(
    (title: string) => {
      setEditing(null);
      if (editing?.kind === 'rename') renameItem(store, editing.card.itemId, title);
      if (editing?.kind === 'new') {
        const id = createItem(store, view, editing.spot, title, root);
        if (id) {
          setSelection(new Set([id]));
          setJustMoved(id);
        }
      }
    },
    [store, view, editing, root],
  );
  const deleteSelection = useCallback(() => {
    if (selected.size === 0) return;
    const count = deleteItems(store, selected);
    if (count > 0) {
      setNotice({ text: `Deleted ${count} ${count === 1 ? 'card' : 'cards'}`, step: store.undoManager.undoStack.at(-1) });
    }
    setSelection(new Set());
  }, [store, selected]);
  // ⌘G: group the selection, or add it to the one group in it (Q15). A new group opens for naming.
  const groupSelection = useCallback(() => {
    const result = groupItems(store, selected);
    if (!result) return;
    setSelection(new Set([result.group]));
    setAnchor(null);
    if (result.created) setEditing({ kind: 'rename', card: { itemId: result.group, x: null, y: null } });
    else setJustMoved(result.group);
  }, [store, selected]);
  const selectedGroups = [...selected].filter((id) => counts.has(id));
  const ungroupSelection = useCallback(() => {
    const released = ungroupItems(store, selected);
    if (released.length > 0) setSelection(new Set(released));
  }, [store, selected]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  // The notice's Undo only makes sense while the delete itself is the latest step.
  const noticeCurrent = notice !== null && canUndo && store.undoManager.undoStack.at(-1) === notice.step;

  const [legendOpen, setLegendOpen] = useState(legendInitiallyOpen);
  const closeLegend = () => {
    setLegendOpen(false);
    rememberLegendClosed();
  };
  const keys = keyNames();
  const { drag, startDrag } = useCardDrag(onDrop, scrollRef, onCardClick);
  const dragging = drag !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Typing in a field (a title, the axis picker) never triggers board shortcuts.
      const focus = e.target instanceof Element ? e.target : null;
      if (focus?.closest('input, textarea, select')) return;
      if (dragging || editing) return;
      if (e.metaKey || e.ctrlKey) {
        if (e.altKey) return;
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) undo(store);
        else if ((key === 'z' && e.shiftKey) || key === 'y') redo(store);
        // ⌘G is also the browser's "find next", so it's always claimed here.
        else if (key === 'g' && e.shiftKey) ungroupSelection();
        else if (key === 'g') groupSelection();
        // Any card can be zoomed into, making it a group once it has children (Q20).
        else if (key === 'arrowdown' && selected.size === 1) zoomTo([...selected][0]!);
        else if (key === 'arrowup' && root !== null) zoomOut();
        else return;
        e.preventDefault();
        return;
      }
      // Enter and Delete on a focused button belong to the button.
      if (focus?.closest('button, a')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected.size === 0) return;
        e.preventDefault();
        deleteSelection();
      } else if (e.key === 'Enter') {
        const card = anchor && selected.has(anchor.itemId) ? anchor : null;
        const id = card?.itemId ?? (selected.size === 1 ? [...selected][0]! : null);
        if (id === null) return;
        e.preventDefault();
        setEditing({ kind: 'rename', card: card ?? { itemId: id, x: null, y: null } });
      } else if (e.key === 'Escape') {
        // Esc clears the selection first, then zooms out a level.
        if (selected.size > 0) clearSelection();
        else zoomOut();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    store,
    dragging,
    editing,
    selected,
    anchor,
    root,
    deleteSelection,
    clearSelection,
    groupSelection,
    ungroupSelection,
    zoomTo,
    zoomOut,
  ]);

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
          <button
            type="button"
            onClick={groupSelection}
            disabled={selected.size === 0}
            title={`Group the selected cards (${keys.group})`}
          >
            Group
          </button>
          <button
            type="button"
            onClick={ungroupSelection}
            disabled={selectedGroups.length === 0}
            title={`Ungroup the selected groups (${keys.ungroup})`}
          >
            Ungroup
          </button>
          <button
            type="button"
            onClick={() => zoomTo([...selected][0]!)}
            disabled={selected.size !== 1}
            title={`Zoom into the selected card to see or add what's inside (${keys.zoomIn})`}
          >
            Zoom in
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
      {!empty && root !== null && (
        <ZoomBar
          plan={plan}
          root={root}
          target={drag && isParentTarget(drag.target) ? drag.target.parent : undefined}
          dragging={drag !== null}
          empty={childrenOf(plan, root).length === 0}
          onZoomTo={zoomTo}
        />
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
          xNone={optionById(choice.x).none}
          yNone={optionById(choice.y).none}
          compact={compact}
          onCompactChange={setCompact}
          lifted={drag?.card ?? null}
          target={drag?.target ?? null}
          onCardPointerDown={startDrag}
          justMoved={justMoved}
          scrollRef={scrollRef}
          selected={selected}
          editing={editing}
          onCardDoubleClick={onCardDoubleClick}
          onSpotDoubleClick={onSpotDoubleClick}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
          onBackgroundPointerDown={clearSelection}
        />
      )}
      {notice && noticeCurrent && (
        <div className="notice" role="status" data-testid="notice">
          {notice.text}
          <button
            type="button"
            onClick={() => {
              undo(store);
              setNotice(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
      {legendOpen && <Legend onClose={closeLegend} />}
      {drag && <DragGhost drag={drag} addAxes={addAxes} />}
    </div>
  );
}
