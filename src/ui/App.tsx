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
import { mismatches as findMismatches } from '../domain/mismatches.ts';
import { parsePlanJson, planFileText, readPlanFile } from '../domain/planJson.ts';
import { ancestry, childCounts, childrenOf } from '../domain/tree.ts';
import { layoutView, type CardRef, type ViewSpec } from '../domain/view.ts';
import sample from '../seed/sample-plan.json';
import { AxisPicker } from './AxisPicker.tsx';
import {
  chooseAxis,
  loadCompactHolding,
  optionId,
  loadViewChoice,
  loadZoomPath,
  axisNames,
  canZoomLane,
  validChoice,
  zoomLane,
  saveCompactHolding,
  saveViewChoice,
  saveZoomPath,
  toViewSpec,
} from './axes.ts';
import { Board, type Editing } from './Board.tsx';
import { Dialog } from './Dialog.tsx';
import { DragGhost } from './DragGhost.tsx';
import { datedFileName, downloadText } from './files.ts';
import { Legend, legendInitiallyOpen, rememberLegendClosed } from './Legend.tsx';
import { Menu } from './Menu.tsx';
import { PropertiesPanel } from './PropertiesPanel.tsx';
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

/** Why a file couldn't be opened. */
interface FileProblem {
  name: string;
  summary: string;
  details: string[];
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
  // A lane zoom whose value was deleted is dropped, rather than showing an empty board.
  const shown = useMemo(() => validChoice(plan, choice), [plan, choice]);
  const view = useMemo(() => ({ ...toViewSpec(plan, shown), root }), [plan, shown, root]);
  const names = { x: axisNames(plan, shown, 'x'), y: axisNames(plan, shown, 'y') };
  const layout = useMemo(() => layoutView(plan, view), [plan, view]);
  const zoomableLanes = useMemo(() => {
    const lanes = (which: 'x' | 'y', keys: string[]) =>
      new Set(keys.filter((key) => canZoomLane(plan, shown, which, key)));
    return {
      x: lanes('x', layout.columns.map((l) => l.key)),
      y: lanes('y', layout.rows.map((l) => l.key)),
    };
  }, [plan, shown, layout]);
  const laneChips = (['x', 'y'] as const).flatMap((which) => {
    const within = which === 'x' ? shown.xWithin : shown.yWithin;
    const property = plan.properties[view[which].property];
    if (!within || property?.kind !== 'select') return [];
    return [{ which, label: `${property.name}: ${property.values[within]?.label ?? within}` }];
  });
  const counts = useMemo(() => childCounts(plan), [plan]);
  const mismatches = useMemo(() => findMismatches(plan), [plan]);
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
  const [editingState, setEditing] = useState<Editing | null>(null);
  // Cards with a solid copy on screen: only those can show a title field. A
  // rename whose card has none (it's off-screen, or only a faded copy) is
  // dropped, rather than leaving the board waiting for a field that isn't there.
  const renamable = useMemo(
    () =>
      new Set(
        [...layout.cells.flat(2), ...layout.holding.rows.flat(), ...layout.holding.columns.flat(), ...layout.holding.corner]
          .filter((ref) => !ref.via)
          .map((ref) => ref.itemId),
      ),
    [layout],
  );
  const editing = editingState?.kind === 'rename' && !renamable.has(editingState.card.itemId) ? null : editingState;
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
      // It's no longer on screen, so it mustn't stay selected where Delete or ⌘G could reach it.
      setSelection((current) => new Set([...current].filter((id) => id !== card.itemId)));
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
  // Changing a lane zoom hides or shows cards, so the selection is cleared,
  // as it is for group zoom: Delete must never reach a card you can't see.
  // Starts from the axes as shown, which may be a fallback for a deleted property.
  const setLaneZoom = useCallback(
    (which: 'x' | 'y' | 'both', key: string | null) => {
      setChoice(which === 'both' ? zoomLane(zoomLane(shown, 'x', null), 'y', null) : zoomLane(shown, which, key));
      setSelection(new Set());
    },
    [shown],
  );
  const onLaneZoom = useCallback((which: 'x' | 'y', key: string) => setLaneZoom(which, key), [setLaneZoom]);

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
  // The notice's Undo only makes sense while its own step is the latest one. Once
  // anything else happens it's gone for good, rather than coming back when later
  // steps are undone.
  const noticeCurrent = notice !== null && canUndo && store.undoManager.undoStack.at(-1) === notice.step;
  useEffect(() => {
    if (!notice) return;
    const dismissIfStale = () => {
      if (store.undoManager.undoStack.at(-1) !== notice.step) setNotice(null);
    };
    const events = ['stack-item-added', 'stack-item-popped', 'stack-cleared'] as const;
    events.forEach((event) => store.undoManager.on(event, dismissIfStale));
    return () => events.forEach((event) => store.undoManager.off(event, dismissIfStale));
  }, [notice, store]);

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
      // Typing in a field (a title, the axis picker), a menu, or a dialog never triggers board shortcuts.
      const focus = e.target instanceof Element ? e.target : null;
      if (focus?.closest('input, textarea, select, [role="menu"], [role="dialog"]')) return;
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
      if (e.key === 'Escape') {
        // Esc clears the selection first, then zooms out a level. Buttons don't use Esc, so this works with one focused.
        if (selected.size > 0) clearSelection();
        else if (root !== null) zoomOut();
        else if (shown.xWithin || shown.yWithin) setLaneZoom('both', null);
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
        if (id === null || !renamable.has(id)) return;
        e.preventDefault();
        setEditing({ kind: 'rename', card: card ?? { itemId: id, x: null, y: null } });
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
    renamable,
    shown.xWithin,
    shown.yWithin,
    setLaneZoom,
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

  // Plan files (requirement 29, ADR 0005).
  const [fileProblem, setFileProblem] = useState<FileProblem | null>(null);
  const openInput = useRef<HTMLInputElement>(null);
  const savePlanFile = () => downloadText(datedFileName('planning-board', 'json'), planFileText(plan));
  const openPlanFile = async (file: File) => {
    const opened = readPlanFile(await file.text());
    if (!opened.ok) {
      setFileProblem({ name: file.name, summary: opened.summary, details: opened.details });
      return;
    }
    if (!empty && !window.confirm(`Replace the board with “${file.name}”? You can undo this.`)) return;
    loadPlan(store, opened.plan);
    setSelection(new Set());
    setEditing(null);
    setNotice({ text: `Opened “${file.name}”`, step: store.undoManager.undoStack.at(-1) });
  };
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const noticeLatest = useCallback(
    (text: string) => setNotice({ text, step: store.undoManager.undoStack.at(-1) }),
    [store],
  );
  const fileMenu = (
    <Menu
      label="File"
      testId="file-menu"
      entries={[
        { label: 'Open plan file…', onSelect: () => openInput.current?.click() },
        {
          label: 'Save plan to file',
          onSelect: savePlanFile,
          disabled: empty,
          title: 'Download the plan as a file you can open again, here or in another browser',
        },
        'divider',
        { label: 'Load sample plan', onSelect: loadSample },
        { label: 'Reset board', onSelect: reset, disabled: empty },
      ]}
    />
  );

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Planning Board</h1>
        <AxisPicker plan={plan} choice={shown} onChange={setChoice} />
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
          {fileMenu}
          <button
            type="button"
            onClick={() => setPropertiesOpen((open) => !open)}
            aria-pressed={propertiesOpen}
            disabled={empty}
            title="Add properties such as Team, and edit their values"
          >
            Properties
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
      {!empty && (
        <ZoomBar
          plan={plan}
          root={root}
          lanes={laneChips}
          onClearLane={(which) => setLaneZoom(which, null)}
          target={drag && isParentTarget(drag.target) ? drag.target.parent : undefined}
          dragging={drag !== null}
          empty={root !== null && childrenOf(plan, root).length === 0}
          onZoomTo={zoomTo}
        />
      )}
      {empty ? (
        <div className="empty-state">
          <h2>No plan yet</h2>
          <p>Load the sample plan: about 150 roadmap items for a fictional product line. Or open a plan file you saved earlier.</p>
          <div className="empty-actions">
            <button type="button" className="primary" onClick={loadSample}>
              Load sample plan
            </button>
            <button type="button" onClick={() => openInput.current?.click()}>
              Open plan file…
            </button>
          </div>
        </div>
      ) : (
        <div className="workspace">
        <Board
          plan={plan}
          view={view}
          layout={layout}
          xLabel={names.x.label}
          yLabel={names.y.label}
          xNone={names.x.none}
          yNone={names.y.none}
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
          zoomableLanes={zoomableLanes}
          mismatches={mismatches}
          onLaneZoom={onLaneZoom}
        />
        {propertiesOpen && (
          <PropertiesPanel
            store={store}
            plan={plan}
            onClose={() => setPropertiesOpen(false)}
            onShowAsRows={(property) => setChoice(chooseAxis(plan, shown, 'y', optionId(property, 0)))}
            onNotice={noticeLatest}
          />
        )}
        </div>
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
      <input
        ref={openInput}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="open-plan-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared, so choosing the same file again still counts as a change.
          e.target.value = '';
          if (file) void openPlanFile(file);
        }}
      />
      {fileProblem && (
        <Dialog title={`Couldn't open “${fileProblem.name}”`} onClose={() => setFileProblem(null)} testId="file-problem">
          <p>{fileProblem.summary}</p>
          {fileProblem.details.length > 0 && (
            <details>
              <summary>Details, for fixing the file by hand</summary>
              <ul className="problem-list">
                {fileProblem.details.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="dialog-actions">
            <button type="button" className="primary" onClick={() => setFileProblem(null)}>
              OK
            </button>
          </div>
        </Dialog>
      )}
      {drag && <DragGhost drag={drag} addAxes={addAxes} />}
    </div>
  );
}
