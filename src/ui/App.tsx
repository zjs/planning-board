import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  addDependency,
  createChild,
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
import { cardsOnBoard, laneCards, matchingCards } from '../domain/selecting.ts';
import { ancestry, canNest, childCounts, childrenOf } from '../domain/tree.ts';
import { layoutView, shownInside, type AxisSpec, type CardRef } from '../domain/view.ts';
import sample from '../seed/sample-plan.json';
import { AxisPicker } from './AxisPicker.tsx';
import {
  axisNames,
  chooseAxis,
  foldableBands,
  inSentence,
  loadCompactHolding,
  loadExpanded,
  loadFoldings,
  loadViewChoice,
  saveCompactHolding,
  saveExpanded,
  saveFoldings,
  saveViewChoice,
  setAllFolded,
  toggleFold,
  toViewSpec,
  validChoice,
  withFolding,
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
import { isCellTarget, isIntoTarget, isParentTarget, useCardDrag, type BoardTarget } from './useCardDrag.ts';

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
  // Groups expanded in place (Q33, ADR 0013). Viewer state, remembered per browser.
  const [expanded, setExpanded] = useState<ItemId[]>(loadExpanded);
  useEffect(() => saveExpanded(expanded), [expanded]);
  // An axis whose property was deleted falls back, rather than showing an empty board.
  const shown = useMemo(() => validChoice(plan, choice), [plan, choice]);
  // Folded bands on nested axes (ADR 0013): viewer state per property, folded by default, remembered like the view.
  const [foldings, setFoldings] = useState(loadFoldings);
  useEffect(() => saveFoldings(foldings), [foldings]);
  const view = useMemo(
    () => ({
      ...withFolding(plan, toViewSpec(plan, shown), foldings),
      ...(expanded.length > 0 ? { expanded } : {}),
    }),
    [plan, shown, foldings, expanded],
  );
  const names = { x: axisNames(plan, shown, 'x'), y: axisNames(plan, shown, 'y') };
  const layout = useMemo(() => layoutView(plan, view), [plan, view]);
  const onBandToggle = useCallback(
    (which: 'x' | 'y', key: string) => setFoldings((f) => toggleFold(f, view[which].property, key)),
    [view],
  );
  /** Fold all, or unfold all, beside each axis picker; shown only for an axis with bands. */
  const foldAll = (which: 'x' | 'y') =>
    foldableBands(plan, view[which]).length === 0
      ? undefined
      : (folded: boolean) => setFoldings((f) => setAllFolded(f, view[which].property, folded));
  const levelNames = {
    x: levelName(plan, view.x),
    y: levelName(plan, view.y),
  };
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
  const isMulti = (axis: AxisSpec) => {
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

  // Move cards to another group: hold to nest, the move-out strip, the breadcrumb, or the inspector. Only
  // the group changes, never the values. Cards that leave the board leave the selection, so Delete can't
  // reach them, and their new group is selected instead when it's on screen.
  const moveCards = useCallback(
    (ids: ItemId[], parent: ItemId | null, text: (moved: ItemId[]) => string) => {
      const moved = moveToParent(store, ids, parent);
      if (moved.length === 0) return;
      if (shownInside(plan, view, parent)) {
        setJustMoved(moved[0]!);
      } else if (parent !== null && renamable.has(parent)) {
        setSelection(new Set([parent]));
        setJustMoved(parent);
      } else {
        setSelection((current) => new Set([...current].filter((id) => !moved.includes(id))));
      }
      setNotice({ text: text(moved), step: store.undoManager.undoStack.at(-1) });
    },
    [store, plan, view, renamable],
  );

  const onDrop = useCallback(
    (card: CardRef, target: BoardTarget, mode: DropMode) => {
      if (isCellTarget(target)) {
        if (dropCard(store, view, card, target, mode)) setJustMoved(card.itemId);
        return;
      }
      // Held over a card (hold to nest), or dropped on the move-out strip or the breadcrumb.
      const parent = isIntoTarget(target) ? target.into : target.parent;
      const from = plan.items[card.itemId]?.parent ?? null;
      const titleOf = (id: ItemId | null) => (id === null ? 'the plan' : `“${plan.items[id]?.title ?? ''}”`);
      moveCards([card.itemId], parent, () =>
        isIntoTarget(target)
          ? `Put ${titleOf(card.itemId)} inside ${titleOf(parent)}`
          : parent === (from === null ? null : (plan.items[from]?.parent ?? null))
            ? `Moved ${titleOf(card.itemId)} out of ${titleOf(from)}`
            : `Moved ${titleOf(card.itemId)} out to ${titleOf(parent)}`,
      );
    },
    [store, view, plan, moveCards],
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
  // Selecting many at once (Q47): every match for a badge, every card in a lane, or everything.
  const selectMany = useCallback((ids: ItemId[], what: string) => {
    setSelection(new Set(ids));
    setSelectedLinks(new Set());
    setAnchor(null);
    setNotice({ text: ids.length === 0 ? `No cards ${what}` : `Selected ${ids.length} ${ids.length === 1 ? 'card' : 'cards'} ${what}` });
  }, []);
  const onSelectMatching = useCallback(
    (property: string, value: string) => {
      const prop = plan.properties[property];
      const label = prop?.kind === 'select' ? (prop.values[value]?.label ?? value) : value;
      selectMany(matchingCards(plan, layout, property, value), `with ${label}`);
    },
    [plan, layout, selectMany],
  );
  const onSelectLanes = useCallback(
    (which: 'x' | 'y', start: number, end: number) => {
      const lanes = which === 'x' ? layout.columns : layout.rows;
      const band = [...layout.bands[which]].reverse().find((b) => b.start === start && b.end === end && end - start > 1);
      const label = band?.label ?? (end - start === 1 ? lanes[start]?.label : null);
      selectMany(laneCards(layout, which, start, end), label ? `in ${label}` : 'in this lane');
    },
    [layout, selectMany],
  );
  const selectAll = useCallback(() => selectMany(cardsOnBoard(layout), 'on the board'), [layout, selectMany]);
  const clearSelection = useCallback(() => {
    setSelection(new Set());
    setSelectedLinks(new Set());
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Every copy on the board, for finding which group a selected card is shown for. */
  const shownCopies = useMemo(
    () => layout.cells.flat(2).concat(layout.holding.rows.flat(), layout.holding.columns.flat(), layout.holding.corner),
    [layout],
  );
  // E: expand the selected groups in place, at any depth (Q33, Q42). Expanding never folds anything.
  const expandGroups = useCallback(
    (ids: ItemId[]) => {
      if (ids.length === 0) {
        setNotice({ text: 'Select a group, then press E to show what’s inside it here.' });
        return;
      }
      const open = ids.filter((id) => counts.has(id) && !expanded.includes(id));
      if (open.length === 0) {
        setNotice({
          text: ids.some((id) => counts.has(id)) ? 'Already expanded.' : 'Only a group can be expanded: select one with cards inside it.',
        });
        return;
      }
      setExpanded((current) => [...current, ...open.filter((id) => !current.includes(id))]);
      // Expanded groups leave the board, and their children take their place: select those.
      setSelection(new Set(open.flatMap((id) => childrenOf(plan, id))));
    },
    [expanded, counts, plan],
  );
  const expandSelection = useCallback(() => expandGroups([...selected]), [expandGroups, selected]);
  // ⇧E: fold the groups the selected cards are shown for, one level up.
  const foldSelection = useCallback(() => {
    const fold = new Set<ItemId>();
    for (const id of selected) {
      const parent = shownCopies.find((ref) => ref.itemId === id && ref.parent !== undefined && expanded.includes(ref.parent))?.parent;
      if (parent !== undefined) fold.add(parent);
    }
    if (fold.size === 0) {
      setNotice({ text: 'Select a card inside an expanded group, then press ⇧E to fold the group back up.' });
      return;
    }
    setExpanded((current) => current.filter((id) => !fold.has(id)));
    setSelection(fold);
  }, [selected, shownCopies, expanded]);

  // The inspector's Group field.
  const onInspectorMove = useCallback(
    (ids: ItemId[], parent: ItemId | null) =>
      moveCards(ids, parent, (moved) => {
        const what = moved.length === 1 ? `“${plan.items[moved[0]!]?.title ?? ''}”` : `${moved.length} cards`;
        return parent === null ? `Moved ${what} to the top level` : `Moved ${what} into “${plan.items[parent]?.title ?? ''}”`;
      }),
    [moveCards, plan],
  );
  // "Add a card inside": the new card takes the parent's place on the board, so the parent is expanded,
  // and the new card's title is ready to type over.
  const addInside = useCallback(
    (parent: ItemId) => {
      const id = createChild(store, view, parent, 'New card');
      if (id === null) return;
      setExpanded((current) => (current.includes(parent) ? current : [...current, parent]));
      setSelection(new Set([id]));
      setAnchor(null);
      setEditing({ kind: 'rename', card: { itemId: id, x: null, y: null } });
    },
    [store, view],
  );

  // Show a card from the inspector: expand the groups around it (ADR 0013), select it, and scroll it into view
  // once it's drawn.
  const revealing = useRef<ItemId | null>(null);
  const revealCard = useCallback(
    (id: ItemId) => {
      if (!plan.items[id]) return;
      const around = ancestry(plan, id).slice(0, -1);
      if (around.length > 0) setExpanded((current) => [...current, ...around.filter((g) => !current.includes(g))]);
      setSelection(new Set([id]));
      setJustMoved(id);
      revealing.current = id;
    },
    [plan],
  );
  useEffect(() => {
    const id = revealing.current;
    if (id === null) return;
    revealing.current = null;
    const el = scrollRef.current?.querySelector(`.card[data-item="${CSS.escape(id)}"]:not(.via-children)`);
    el?.scrollIntoView({ block: 'center', inline: 'center' });
  });

  // Double-click renames, groups included (Q36). A faded copy can't be renamed, so it expands its group;
  // a group card expands with its child count or E.
  const onCardDoubleClick = useCallback(
    (card: CardRef) => {
      if (card.via === 'children') {
        expandGroups([card.itemId]);
        return;
      }
      setSelection(new Set([card.itemId]));
      setAnchor(card);
      setEditing({ kind: 'rename', card });
    },
    [expandGroups],
  );
  const onCardExpand = useCallback((card: CardRef) => expandGroups([card.itemId]), [expandGroups]);
  const onSpotDoubleClick = useCallback((spot: DropTarget) => setEditing({ kind: 'new', spot }), []);
  const onCancelEdit = useCallback(() => setEditing(null), []);
  const onCommitEdit = useCallback(
    (title: string) => {
      setEditing(null);
      if (editing?.kind === 'rename') renameItem(store, editing.card.itemId, title);
      if (editing?.kind === 'new') {
        const id = createItem(store, view, editing.spot, title);
        if (id) {
          setSelection(new Set([id]));
          setJustMoved(id);
        }
      }
    },
    [store, view, editing],
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
  // expanding and folding, so cards at different group levels can be linked; it's viewer state, never saved.
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
  const canNestCard = useCallback((id: ItemId, into: ItemId) => canNest(plan, id, into), [plan]);
  const { drag, startDrag } = useCardDrag(onDrop, scrollRef, onCardClick, canNestCard);
  const dragging = drag !== null;
  // While a card in a group is dragged, a strip moves it up one level.
  const draggedParent = drag ? (plan.items[drag.card.itemId]?.parent ?? null) : null;
  const moveOut =
    draggedParent !== null && plan.items[draggedParent]
      ? {
          from: plan.items[draggedParent].title,
          to: plan.items[draggedParent].parent,
          over: isParentTarget(drag?.target ?? null) && (drag!.target as { parent: ItemId | null }).parent === plan.items[draggedParent].parent,
        }
      : null;

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

  // A card's copies (Q45): the hovered card's and the selected cards', when there's more than one on the board.
  const copyCounts = useMemo(() => {
    const counts = new Map<ItemId, number>();
    for (const ref of shownCopies) {
      for (const real of ref.via ? (ref.inner ?? []) : [ref]) counts.set(real.itemId, (counts.get(real.itemId) ?? 0) + 1);
    }
    return counts;
  }, [shownCopies]);
  const copyFocus = useMemo(
    () =>
      dragging
        ? []
        : [...new Set([...(hovered === null ? [] : [hovered]), ...selected])].filter((id) => (copyCounts.get(id) ?? 0) > 1),
    [dragging, hovered, selected, copyCounts],
  );

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
        else if (key === 'a' && !e.shiftKey) selectAll();
        else return;
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        // Esc cancels a pending link, then clears the selection. Buttons don't use Esc, so this works with one focused.
        if (pendingFrom !== null) setPendingLink(null);
        else if (selectedLinks.size > 0) setSelectedLinks(new Set());
        else if (selected.size > 0) clearSelection();
        return;
      }
      if (e.key.toLowerCase() === 'l' && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        linkSelection();
        return;
      }
      if (e.key.toLowerCase() === 'e' && !e.altKey && !empty) {
        e.preventDefault();
        if (e.shiftKey) foldSelection();
        else expandSelection();
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
    renamable,
    deleteSelection,
    clearSelection,
    pendingFrom,
    linkSelection,
    selectedLinks,
    deleteSelectedLinks,
    groupSelection,
    ungroupSelection,
    togglePanel,
    empty,
    expandSelection,
    foldSelection,
    selectAll,
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
        <AxisPicker plan={plan} choice={shown} onChange={setChoice} foldAll={{ x: foldAll('x'), y: foldAll('y') }} />
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
            onClick={expandSelection}
            disabled={selected.size === 0}
            title={`Show what's inside the selected groups right here (${keys.expand})`}
          >
            Expand
          </button>
          <button
            type="button"
            onClick={foldSelection}
            disabled={![...selected].some((id) => shownCopies.some((ref) => ref.itemId === id && ref.parent !== undefined))}
            title={`Fold the groups the selected cards are in back up (${keys.fold})`}
          >
            Fold
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
        {moveOut && (
          <div
            className={moveOut.over ? 'move-out drop-target' : 'move-out'}
            data-drop="parent"
            data-parent={moveOut.to ?? ''}
            data-testid="move-out"
          >
            Move out of “{moveOut.from}”
          </div>
        )}
        <Board
          plan={plan}
          view={view}
          layout={layout}
          xLabel={names.x.label}
          yLabel={names.y.label}
          xNone={names.x.none}
          yNone={names.y.none}
          xParentNone={names.x.parentNone}
          yParentNone={names.y.parentNone}
          compact={compact}
          onCompactChange={setCompact}
          lifted={drag?.card ?? null}
          target={drag?.target ?? null}
          onCardPointerDown={startDrag}
          justMoved={justMoved}
          scrollRef={scrollRef}
          lines={lines}
          copyFocus={copyFocus}
          onHover={setHovered}
          onLineClick={onLineClick}
          selected={selected}
          editing={editing}
          onCardDoubleClick={onCardDoubleClick}
          onCardExpand={onCardExpand}
          onSpotDoubleClick={onSpotDoubleClick}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
          onBackgroundPointerDown={clearSelection}
          mismatches={mismatches}
          onBandToggle={onBandToggle}
          onSelectLanes={onSelectLanes}
          onSelectMatching={onSelectMatching}
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
            onMove={onInspectorMove}
            onAddInside={addInside}
          />
        )}
        {panel === 'properties' && (
          <PropertiesPanel
            store={store}
            plan={plan}
            onClose={() => setPanel(null)}
            onShowAsRows={(property) => setChoice(chooseAxis(shown, 'y', property))}
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
      {drag && <DragGhost drag={drag} addAxes={addAxes} titleOf={(id) => plan.items[id]?.title ?? ''} />}
    </div>
  );
}
