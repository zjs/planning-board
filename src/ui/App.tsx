import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  addDependency,
  createItem,
  deleteItems,
  dropCard,
  groupItems,
  importPlan,
  loadPlan,
  moveToParent,
  openPlanStore,
  redo,
  removeDependencies,
  removeDependency,
  renameItem,
  resetPlan,
  snapshotSource,
  undo,
  ungroupItems,
  type PersistenceStatus,
  type PlanStore,
} from '../commands/store.ts';
import { parseCsv, type CsvTable } from '../domain/csv.ts';
import {
  chain,
  describeLinkProblem,
  directLinks,
  hasLink,
  linkKey,
  linkProblems,
  linkProblemsInside,
  visibleLinks,
  type VisibleLink,
} from '../domain/dependencies.ts';
import { SYSTEM, TIME, type Dependency, type ItemId, type Plan } from '../domain/model.ts';
import type { DropMode, DropTarget } from '../domain/move.ts';
import { mismatches as findMismatches } from '../domain/mismatches.ts';
import { parsePlanJson, planFileText, readPlanFile } from '../domain/planJson.ts';
import { ancestry, childCounts, childrenOf } from '../domain/tree.ts';
import { inZoomedScope, layoutView, type AxisSpec, type CardRef, type Lane, type ViewSpec } from '../domain/view.ts';
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
  inSentence,
  loadCollapsed,
  loadExpanded,
  loadZoomAlso,
  saveExpanded,
  saveZoomAlso,
  saveCollapsed,
  toggleCollapsed,
  withCollapsed,
} from './axes.ts';
import { Board, type Editing } from './Board.tsx';
import { Dialog } from './Dialog.tsx';
import type { DrawnLine } from './DependencyLines.tsx';
import { DragGhost } from './DragGhost.tsx';
import { ImportDialog } from './ImportDialog.tsx';
import { datedFileName, downloadText } from './files.ts';
import { Legend, legendInitiallyOpen, rememberLegendClosed } from './Legend.tsx';
import { Menu } from './Menu.tsx';
import { Inspector } from './Inspector.tsx';
import { PropertiesPanel } from './PropertiesPanel.tsx';
import { keyNames } from './platform.ts';
import { isParentTarget, useCardDrag, type BoardTarget } from './useCardDrag.ts';
import { ZoomBar } from './ZoomBar.tsx';

/** The name of the level an axis shows, in a sentence: "component", "release". */
function levelName(plan: Plan, axis: AxisSpec): string {
  const property = plan.properties[axis.property];
  if (property?.kind !== 'select') return 'value';
  return inSentence(property.levels[axis.level] ?? property.name);
}

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
  /** The undo step it offers to undo. A hint (no step) has no Undo button. */
  step?: unknown;
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
  // Multi-zoom (Q33): cards zoomed into alongside the root, at the same level. Viewer state, remembered.
  const [zoomAlso, setZoomAlso] = useState<ItemId[]>(loadZoomAlso);
  useEffect(() => saveZoomAlso(zoomAlso), [zoomAlso]);
  const roots = useMemo(
    () => (root === null ? [] : [root, ...zoomAlso.filter((id) => id !== root && plan.items[id])]),
    [root, zoomAlso, plan],
  );
  // Groups expanded in place (Q33). Viewer state, remembered per browser.
  const [expanded, setExpanded] = useState<ItemId[]>(loadExpanded);
  useEffect(() => saveExpanded(expanded), [expanded]);
  // A lane zoom whose value was deleted is dropped, rather than showing an empty board.
  const shown = useMemo(() => validChoice(plan, choice), [plan, choice]);
  // Collapsed bands on nested axes (ADR 0012): viewer state per property, remembered like the view.
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  useEffect(() => saveCollapsed(collapsed), [collapsed]);
  const view = useMemo(
    () => ({
      ...withCollapsed(toViewSpec(plan, shown), collapsed),
      root,
      ...(roots.length > 1 ? { roots } : {}),
      ...(expanded.length > 0 ? { expanded } : {}),
    }),
    [plan, shown, collapsed, root, roots, expanded],
  );
  const names = { x: axisNames(plan, shown, 'x'), y: axisNames(plan, shown, 'y') };
  const layout = useMemo(() => layoutView(plan, view), [plan, view]);
  // A parent's own lane and a collapsed lane aren't zoomed from their headers: their band is (ADR 0012).
  const zoomableLanes = useMemo(() => {
    const lanes = (which: 'x' | 'y', keys: string[]) =>
      new Set(keys.filter((key) => canZoomLane(plan, shown, which, key)));
    const own = (lanes: Lane[]) => lanes.filter((l) => !l.kind).map((l) => l.key);
    return {
      x: lanes('x', [...own(layout.columns), ...layout.bands.x.map((b) => b.key)]),
      y: lanes('y', [...own(layout.rows), ...layout.bands.y.map((b) => b.key)]),
    };
  }, [plan, shown, layout]);
  const onBandToggle = useCallback(
    (which: 'x' | 'y', key: string) => setCollapsed((c) => toggleCollapsed(c, view[which].property, key)),
    [view],
  );
  const levelNames = {
    x: levelName(plan, view.x),
    y: levelName(plan, view.y),
  };
  const laneChips = (['x', 'y'] as const).flatMap((which) => {
    const within = which === 'x' ? shown.xWithin : shown.yWithin;
    const property = plan.properties[view[which].property];
    if (!within || property?.kind !== 'select') return [];
    return [{ which, label: `${property.name}: ${property.values[within]?.label ?? within}` }];
  });
  const counts = useMemo(() => childCounts(plan), [plan]);
  // Flagged links (requirements 16 and 18, Q37): out of order in this view, or on a loop. A collapsed
  // group's ⚠ count includes the flagged links inside it.
  const problems = useMemo(() => linkProblems(plan, view), [plan, view]);
  const mismatches = useMemo(() => {
    const found = findMismatches(plan);
    const inside = new Map(found.inside);
    for (const [group, lines] of linkProblemsInside(plan, problems)) inside.set(group, [...(inside.get(group) ?? []), ...lines]);
    return { ...found, inside };
  }, [plan, problems]);
  // A clicked line's links, ready for Delete. Viewer state, like the selection.
  const [selectedLinks, setSelectedLinks] = useState<ReadonlySet<string>>(() => new Set());
  // One side panel at a time: Properties, or the card inspector (Q35), which follows the selection.
  const [panel, setPanel] = useState<'properties' | 'inspector' | null>(null);
  const togglePanel = useCallback((which: 'properties' | 'inspector') => setPanel((open) => (open === which ? null : which)), []);
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
      setSelectedLinks(new Set());
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
  const clearSelection = useCallback(() => {
    setSelection(new Set());
    setSelectedLinks(new Set());
  }, []);
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
      setZoomAlso([]);
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

  // Several cards selected: zoom into all of them at once (Q33), as long as they're on the same level.
  const zoomInto = useCallback(
    (ids: ItemId[]) => {
      const [first, ...rest] = ids.filter((id) => plan.items[id]);
      if (first === undefined) return;
      const level = plan.items[first]!.parent;
      const same = rest.filter((id) => plan.items[id]!.parent === level);
      zoomTo(first);
      setZoomAlso(same);
      if (same.length < rest.length) {
        setNotice({ text: 'Zoomed into the cards on the same level as the first one selected.' });
      }
    },
    [plan, zoomTo],
  );
  // E: expand the selected groups in place, or collapse them, or the group of a selected expanded child (Q33).
  const toggleExpand = useCallback(() => {
    const ids = [...selected];
    if (ids.length === 0) {
      setNotice({ text: 'Select a group, then press E to show what’s inside it here.' });
      return;
    }
    const collapse = new Set<ItemId>();
    const open = new Set<ItemId>();
    for (const id of ids) {
      if (expanded.includes(id)) {
        collapse.add(id);
        continue;
      }
      const parent = layout.cells
        .flat(2)
        .concat(layout.holding.rows.flat(), layout.holding.columns.flat(), layout.holding.corner)
        .find((ref) => ref.itemId === id && ref.parent !== undefined && expanded.includes(ref.parent))?.parent;
      if (parent !== undefined) collapse.add(parent);
      else if (counts.has(id)) open.add(id);
    }
    if (collapse.size === 0 && open.size === 0) {
      setNotice({ text: 'Only a group can be expanded: select one with cards inside it.' });
      return;
    }
    setExpanded((current) => [...current.filter((id) => !collapse.has(id)), ...[...open].filter((id) => !current.includes(id))]);
    // Expanded groups leave the board, and collapsed ones come back: select what's now on screen.
    setSelection(new Set(collapse.size > 0 ? collapse : [...open].flatMap((id) => childrenOf(plan, id))));
  }, [selected, layout, expanded, counts, plan]);

  // Show a card from the inspector: zoom to the level it's on, clear a lane zoom that hides it, select it, and
  // scroll it into view once it's drawn.
  const revealing = useRef<ItemId | null>(null);
  const revealCard = useCallback(
    (id: ItemId) => {
      const item = plan.items[id];
      if (!item) return;
      zoomTo(item.parent);
      if (!inZoomedScope(plan, item, view.x) || !inZoomedScope(plan, item, view.y)) {
        setChoice(zoomLane(zoomLane(shown, 'x', null), 'y', null));
      }
      setSelection(new Set([id]));
      setJustMoved(id);
      revealing.current = id;
    },
    [plan, view, shown, zoomTo],
  );
  useEffect(() => {
    const id = revealing.current;
    if (id === null) return;
    revealing.current = null;
    const el = scrollRef.current?.querySelector(`.card[data-item="${CSS.escape(id)}"]:not(.via-children)`);
    el?.scrollIntoView({ block: 'center', inline: 'center' });
  });

  // Double-click renames, groups included (Q36). A faded copy can't be renamed, so it zooms in;
  // group cards zoom with their button or ⌘↓.
  const onCardDoubleClick = useCallback(
    (card: CardRef) => {
      if (card.via === 'children') {
        zoomTo(card.itemId);
        return;
      }
      setSelection(new Set([card.itemId]));
      setAnchor(card);
      setEditing({ kind: 'rename', card });
    },
    [zoomTo],
  );
  const onCardZoom = useCallback((card: CardRef) => zoomTo(card.itemId), [zoomTo]);
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

  // Dependency links (requirement 15, Q24, Q39). Selection order decides direction: the first card
  // selected comes before the second. With one card selected, L starts a pending link that survives
  // zooming, so cards at different group levels can be linked; it's viewer state, never saved.
  const [pendingLink, setPendingLink] = useState<ItemId | null>(null);
  const pendingFrom = pendingLink !== null && plan.items[pendingLink] ? pendingLink : null;
  const titleOf = useCallback((id: ItemId) => `“${plan.items[id]?.title ?? 'card'}”`, [plan]);
  const toggleLink = useCallback(
    (from: ItemId, to: ItemId) => {
      if (hasLink(plan, from, to)) {
        removeDependency(store, from, to);
        setNotice({ text: `Removed the link ${titleOf(from)} → ${titleOf(to)}`, step: store.undoManager.undoStack.at(-1) });
        return;
      }
      const problem = addDependency(store, from, to);
      if (problem !== null) setNotice({ text: problem });
      else setNotice({ text: `Linked ${titleOf(from)} → ${titleOf(to)}`, step: store.undoManager.undoStack.at(-1) });
    },
    [plan, store, titleOf],
  );
  const linkSelection = useCallback(() => {
    const ids = [...selected];
    if (pendingFrom !== null) {
      if (ids.length !== 1 || ids[0] === pendingFrom) {
        setNotice({ text: `Select one other card: the one ${titleOf(pendingFrom)} comes before. Esc cancels.` });
        return;
      }
      toggleLink(pendingFrom, ids[0]!);
      setPendingLink(null);
      return;
    }
    if (ids.length === 1) setPendingLink(ids[0]!);
    else if (ids.length === 2) toggleLink(ids[0]!, ids[1]!);
    else {
      setNotice({
        text:
          ids.length === 0
            ? 'Select the card that comes first, then the one it comes before, and press L.'
            : 'Select just two cards: the one that comes first, then the one it comes before.',
      });
    }
  }, [selected, pendingFrom, titleOf, toggleLink]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  // The notice's Undo only makes sense while its own step is the latest one. Once
  // anything else happens it's gone for good, rather than coming back when later
  // steps are undone.
  const noticeCurrent =
    notice !== null && (notice.step === undefined || (canUndo && store.undoManager.undoStack.at(-1) === notice.step));
  useEffect(() => {
    if (!notice || notice.step === undefined) return;
    const dismissIfStale = () => {
      if (store.undoManager.undoStack.at(-1) !== notice.step) setNotice(null);
    };
    const events = ['stack-item-added', 'stack-item-popped', 'stack-cleared'] as const;
    events.forEach((event) => store.undoManager.on(event, dismissIfStale));
    return () => events.forEach((event) => store.undoManager.off(event, dismissIfStale));
  }, [notice, store]);

  // First-visit help opens once there's a board to explain, so it never covers the empty board's buttons.
  // Null until the viewer opens or closes it themselves.
  const [legendChoice, setLegendOpen] = useState<boolean | null>(null);
  const [firstVisit] = useState(legendInitiallyOpen);
  const legendOpen = legendChoice ?? (firstVisit && !empty);
  const closeLegend = () => {
    setLegendOpen(false);
    rememberLegendClosed();
  };
  const keys = keyNames();
  const { drag, startDrag } = useCardDrag(onDrop, scrollRef, onCardClick);
  const dragging = drag !== null;

  // Focus lines (Q14, Q39): the hovered card's direct links, and the selected cards' whole chains.
  const [hovered, setHovered] = useState<ItemId | null>(null);
  // Problem links are always drawn (Q14): out of order in this view, or on a loop (Q37). A clicked line
  // stays drawn, ready for Delete.
  const lines = useMemo((): DrawnLine[] => {
    if (dragging) return [];
    const flagged = plan.dependencies.filter((d) => problems.has(linkKey(d)));
    const focus = new Map<string, Dependency>();
    for (const id of selected) for (const d of chain(plan, id)) focus.set(linkKey(d), d);
    if (hovered !== null && plan.items[hovered]) for (const d of directLinks(plan, hovered)) focus.set(linkKey(d), d);
    for (const d of plan.dependencies) if (selectedLinks.has(linkKey(d))) focus.set(linkKey(d), d);
    for (const d of flagged) focus.delete(linkKey(d));
    const label = (d: Dependency) => {
      const problem = problems.get(linkKey(d));
      return problem
        ? describeLinkProblem(plan, d, problem)
        : `${plan.items[d.from]?.title ?? ''} → ${plan.items[d.to]?.title ?? ''}`;
    };
    const drawn = (tone: DrawnLine['tone']) => (line: VisibleLink): DrawnLine => ({
      ...line,
      tone,
      label: line.links.map(label).join('\n'),
      selected: line.links.some((d) => selectedLinks.has(linkKey(d))),
    });
    const problemLines = visibleLinks(plan, flagged, renamable).map(drawn('problem'));
    // A pair of cards with both kinds of link gets one red line.
    const taken = new Set(problemLines.map((l) => `${l.from}->${l.to}`));
    const focusLines = visibleLinks(plan, [...focus.values()], renamable)
      .filter((l) => !taken.has(`${l.from}->${l.to}`))
      .map(drawn('focus'));
    return [...focusLines, ...problemLines];
  }, [plan, problems, selected, hovered, selectedLinks, renamable, dragging]);

  const onLineClick = useCallback((line: DrawnLine) => {
    setSelectedLinks(new Set(line.links.map(linkKey)));
    setSelection(new Set());
  }, []);
  const deleteSelectedLinks = useCallback(() => {
    const doomed = plan.dependencies.filter((d) => selectedLinks.has(linkKey(d)));
    const removed = removeDependencies(store, doomed);
    setSelectedLinks(new Set());
    if (removed === 0) return;
    const first = doomed[0]!;
    setNotice({
      text:
        removed === 1
          ? `Removed the link ${titleOf(first.from)} → ${titleOf(first.to)}`
          : `Removed ${removed} links`,
      step: store.undoManager.undoStack.at(-1),
    });
  }, [plan, selectedLinks, store, titleOf]);


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
        // Several cards at once is multi-zoom (Q33).
        else if (key === 'arrowdown' && selected.size > 0) zoomInto([...selected]);
        else if (key === 'arrowup' && root !== null) zoomOut();
        else return;
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        // Esc cancels a pending link, then clears the selection, then zooms out a level. Buttons don't use Esc,
        // so this works with one focused.
        if (pendingFrom !== null) setPendingLink(null);
        else if (selectedLinks.size > 0) setSelectedLinks(new Set());
        else if (selected.size > 0) clearSelection();
        else if (root !== null) zoomOut();
        else if (shown.xWithin || shown.yWithin) setLaneZoom('both', null);
        return;
      }
      if (e.key.toLowerCase() === 'l' && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        linkSelection();
        return;
      }
      if (e.key.toLowerCase() === 'e' && !e.altKey && !e.shiftKey && !empty) {
        e.preventDefault();
        toggleExpand();
        return;
      }
      if (e.key.toLowerCase() === 'i' && !e.altKey && !e.shiftKey && !empty) {
        e.preventDefault();
        togglePanel('inspector');
        return;
      }
      // Enter and Delete on a focused button belong to the button.
      if (focus?.closest('button, a')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLinks.size > 0) {
          e.preventDefault();
          deleteSelectedLinks();
          return;
        }
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
    pendingFrom,
    linkSelection,
    selectedLinks,
    deleteSelectedLinks,
    groupSelection,
    ungroupSelection,
    zoomTo,
    zoomOut,
    togglePanel,
    empty,
    zoomInto,
    toggleExpand,
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
  // CSV import (requirement 28, ADR 0010).
  const csvInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<{ fileName: string; table: CsvTable } | null>(null);
  const readCsvFile = async (file: File) => {
    const table = parseCsv(await file.text());
    if (table.header.length === 0 || table.rows.length === 0) {
      setFileProblem({
        name: file.name,
        summary: table.header.length === 0 ? 'This file is empty.' : 'This file has column headers but no rows to import.',
        details: [],
      });
      return;
    }
    setImporting({ fileName: file.name, table });
  };

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
          label: 'Import CSV (Jira export)…',
          onSelect: () => csvInput.current?.click(),
          title: 'Replace the board with cards from a CSV file, such as a Jira export',
        },
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
          <button
            type="button"
            className="icon"
            onClick={() => undo(store)}
            disabled={!canUndo}
            aria-label="Undo"
            title={`Undo (${keys.undo})`}
          >
            ↶
          </button>
          <button
            type="button"
            className="icon"
            onClick={() => redo(store)}
            disabled={!canRedo}
            aria-label="Redo"
            title={`Redo (${keys.redo})`}
          >
            ↷
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
            onClick={() => zoomInto([...selected])}
            disabled={selected.size === 0}
            title={`Zoom into the selected cards to see or add what's inside (${keys.zoomIn})`}
          >
            Zoom in
          </button>
          <button
            type="button"
            onClick={toggleExpand}
            disabled={selected.size === 0}
            title={`Show what's inside the selected groups right here, or fold them back (${keys.expand})`}
          >
            Expand
          </button>
          <button
            type="button"
            onClick={linkSelection}
            disabled={pendingFrom === null && selected.size === 0}
            aria-pressed={pendingFrom !== null}
            title={`Link the selected cards: the first selected comes before the second (${keys.link})`}
          >
            Link
          </button>
          <span className="divider" />
          {fileMenu}
          <button
            type="button"
            onClick={() => togglePanel('inspector')}
            aria-pressed={panel === 'inspector'}
            disabled={empty}
            title={`See and edit the selected cards without pivoting (${keys.inspect})`}
          >
            Inspect
          </button>
          <button
            type="button"
            onClick={() => togglePanel('properties')}
            aria-pressed={panel === 'properties'}
            disabled={empty}
            title="Add properties such as Team, and edit their values"
          >
            Properties
          </button>
          <span className="divider" />
          <button
            type="button"
            className="icon"
            onClick={() => (legendOpen ? closeLegend() : setLegendOpen(true))}
            aria-pressed={legendOpen}
            aria-label="Help"
            title="How it works"
          >
            ?
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
          also={roots.slice(1)}
          lanes={laneChips}
          onClearLane={(which) => setLaneZoom(which, null)}
          target={drag && isParentTarget(drag.target) ? drag.target.parent : undefined}
          dragging={drag !== null}
          empty={root !== null && childrenOf(plan, root).length === 0}
          onZoomTo={zoomTo}
        />
      )}
      {pendingFrom !== null && !empty && (
        <div className="link-bar" role="status" data-testid="link-bar">
          Linking from {titleOf(pendingFrom)}: select the card it comes before, then press <kbd>{keys.link}</kbd>.
          <button type="button" onClick={() => setPendingLink(null)}>
            Cancel
          </button>
        </div>
      )}
      {empty ? (
        <div className="empty-state">
          <h2>No plan yet</h2>
          <p>Load the sample plan: about 150 roadmap items for a fictional product line. Or open a plan file you saved earlier, or import a Jira export.</p>
          <div className="empty-actions">
            <button type="button" className="primary" onClick={loadSample}>
              Load sample plan
            </button>
            <button type="button" onClick={() => openInput.current?.click()}>
              Open plan file…
            </button>
            <button type="button" onClick={() => csvInput.current?.click()}>
              Import CSV…
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
          lines={lines}
          onHover={setHovered}
          onLineClick={onLineClick}
          selected={selected}
          editing={editing}
          onCardDoubleClick={onCardDoubleClick}
          onCardZoom={onCardZoom}
          onSpotDoubleClick={onSpotDoubleClick}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
          onBackgroundPointerDown={clearSelection}
          zoomableLanes={zoomableLanes}
          mismatches={mismatches}
          onLaneZoom={onLaneZoom}
          onBandToggle={onBandToggle}
          levelNames={levelNames}
        />
        {panel === 'inspector' && (
          <Inspector
            store={store}
            plan={plan}
            selected={[...selected]}
            mismatches={mismatches.onCard}
            onClose={() => setPanel(null)}
            onReveal={revealCard}
            onNotice={noticeLatest}
          />
        )}
        {panel === 'properties' && (
          <PropertiesPanel
            store={store}
            plan={plan}
            onClose={() => setPanel(null)}
            onShowAsRows={(property) => setChoice(chooseAxis(plan, shown, 'y', optionId(property, 0)))}
            onNotice={noticeLatest}
          />
        )}
        </div>
      )}
      {notice && noticeCurrent && (
        <div className="notice" role="status" data-testid="notice">
          {notice.text}
          {notice.step !== undefined && (
            <button
              type="button"
              onClick={() => {
                undo(store);
                setNotice(null);
              }}
            >
              Undo
            </button>
          )}
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
      <input
        ref={csvInput}
        type="file"
        accept=".csv,text/csv"
        hidden
        data-testid="import-csv-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void readCsvFile(file);
        }}
      />
      {importing && (
        <ImportDialog
          fileName={importing.fileName}
          table={importing.table}
          onCancel={() => setImporting(null)}
          onImport={(draft, choices, quarterOrder) => {
            const result = importPlan(store, draft, choices, quarterOrder);
            setImporting(null);
            // Imported cards have no sequence position, so a sequence view would hold them all in
            // one lane. Time × System shows them where the export put them (questions.md Q30).
            setChoice({ x: TIME, y: SYSTEM });
            setZoomPath([]);
            setSelection(new Set());
            setEditing(null);
            const n = result.counts.cards;
            noticeLatest(`Imported ${n} ${n === 1 ? 'card' : 'cards'} from “${importing.fileName}”`);
          }}
        />
      )}
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
