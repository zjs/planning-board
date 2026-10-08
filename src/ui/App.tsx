import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  addDependency,
  addRelated,
  addValue,
  createChild,
  createItem,
  deleteItems,
  dropCard,
  dropCards,
  groupItems,
  importedPlan,
  moveToParent,
  openPlanStore,
  redo,
  removeDependencies,
  removeDependency,
  removeRelated,
  removeRelatedLinks,
  renameItem,
  renameValue,
  snapshotSource,
  startPlan,
  undo,
  ungroupItems,
  isEmptyPlan,
  namePlan,
  planName,
  type OpenPlan,
  type PersistenceStatus,
  type PlanStore,
} from '../commands/store.ts';
import {
  addPlan,
  dropPlanDatabase,
  expiredDeletes,
  fileSlug,
  findPlan,
  forgetPlan,
  hashFor,
  isPlanListKey,
  listPlans,
  markDeleted,
  nameFromFile,
  planDatabase,
  planFromHash,
  renamePlan,
  touchPlan,
  unmarkDeleted,
  UNTITLED,
  type PlanEntry,
  type PlanId,
} from '../commands/plans.ts';
import { parseCsv, type CsvTable } from '../domain/csv.ts';
import {
  chain,
  describeLinkProblem,
  directLinks,
  directRelated,
  hasLink,
  hasRelated,
  linkKey,
  linkProblems,
  linkProblemsInside,
  visibleLinks,
  type VisibleLink,
} from '../domain/dependencies.ts';
import { SYSTEM, TIME, type Dependency, type ItemId, type Plan } from '../domain/model.ts';
import type { DropMode, DropTarget } from '../domain/move.ts';
import { findOnBoard, queryWords, stepMatch } from '../domain/finding.ts';
import { mismatches as findMismatches } from '../domain/mismatches.ts';
import { parsePlanJson, planFileText, readPlanFile } from '../domain/planJson.ts';
import { valueLabelProblem } from '../domain/properties.ts';
import { cardsOnBoard, laneCards, matchingCards } from '../domain/selecting.ts';
import { blankPlan } from '../domain/builtins.ts';
import { newItemSpot } from '../domain/items.ts';
import { ancestry, canNest, childCounts } from '../domain/tree.ts';
import { allCopies, layoutView, shownInside, type AxisSpec, type CardRef } from '../domain/view.ts';
import sample from '../seed/sample-plan.json';
import {
  axisNames,
  chooseAxis,
  DEFAULT_VIEW,
  dropText,
  foldableBands,
  inSentence,
  loadCompactHolding,
  loadHoldingCollapsed,
  loadExpanded,
  loadFoldings,
  loadViewChoice,
  saveCompactHolding,
  saveHoldingCollapsed,
  saveExpanded,
  saveFoldings,
  saveViewChoice,
  setAllFolded,
  toggleFold,
  toViewSpec,
  unfoldBand,
  validChoice,
  withFolding,
  type ViewChoice,
} from './axes.ts';
import { Board, type Editing } from './Board.tsx';
import type { CommitHow } from './Card.tsx';
import { ContextMenu, type ContextEntry } from './ContextMenu.tsx';
import { Dialog } from './Dialog.tsx';
import type { DrawnLine } from './DependencyLines.tsx';
import { DragGhost } from './DragGhost.tsx';
import { FindBar, FindButton } from './FindBar.tsx';
import { ImportDialog } from './ImportDialog.tsx';
import { datedFileName, downloadText } from './files.ts';
import { Guide } from './Guide.tsx';
import { loadGuide, loadGuidePlan, offersGuide, saveGuide, saveGuidePlan, type GuideState } from './guide.ts';
import { Legend } from './Legend.tsx';
import { Menu, type MenuEntry } from './Menu.tsx';
import { PlanName } from './PlanName.tsx';
import { Inspector } from './Inspector.tsx';
import { ViewBar } from './ViewBar.tsx';
import { PropertiesPanel } from './PropertiesPanel.tsx';
import { capturePositions, playFrom, type Positions } from './motion.ts';
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

// Plans are opened once per page and plan, outside React, so StrictMode's
// double effects don't attach two storage providers to the same database.
const opening = new Map<PlanId, Promise<OpenPlan>>();
function openPlan(id: PlanId): Promise<OpenPlan> {
  let open = opening.get(id);
  if (!open) {
    open = openPlanStore(id);
    opening.set(id, open);
  }
  return open;
}
function closePlan(id: PlanId): Promise<void> {
  const open = opening.get(id);
  opening.delete(id);
  return open ? open.then((p) => p.close()) : Promise.resolve();
}

/** Show a plan's link in the address bar without adding a step to Back. */
function showHash(id: PlanId) {
  if (location.hash === hashFor(id)) return;
  try {
    history.replaceState(null, '', hashFor(id));
  } catch {
    location.hash = hashFor(id);
  }
}

/** What a new plan does first, once its board is showing. */
export interface PlanStart {
  /** Open a title field for the first card (Q51). */
  typing?: boolean;
  /** A notice to show, such as what was opened. */
  notice?: string;
}

/** What the App does with plans, for the board's menus and toolbar (ADR 0021). */
export interface PlanActions {
  plans: PlanEntry[];
  name: string;
  /** Make a new plan holding `content`, and switch to it. `prepare` sets its viewer state first. */
  make: (name: string, content: Plan, start?: PlanStart, prepare?: (id: PlanId) => void) => void;
  open: (id: PlanId) => void;
  rename: (name: string) => void;
  remove: () => void;
}

/** A notice the App shows across plans: a deleted plan, with its Undo. */
interface PlanNotice {
  text: string;
  undo: () => void;
  /** Called once the Undo can no longer be used. */
  expire: () => void;
}

/**
 * The plans in this browser (Q58, Q66, Q67, ADR 0021). One is open at a
 * time; the board for it is a Workspace, made afresh for each plan, so
 * viewer state never leaks from one plan to another.
 */
export function App() {
  const [session, setSession] = useState<{ plan: OpenPlan; start: PlanStart | null } | null>(null);
  const [plans, setPlans] = useState(listPlans);
  const refresh = useCallback(() => setPlans(listPlans()), []);
  const current = useRef<PlanId | null>(null);

  const show = useCallback(
    async (id: PlanId, start: PlanStart | null = null) => {
      const plan = await openPlan(id);
      const previous = current.current;
      current.current = id;
      touchPlan(id);
      // The document's name wins, since it's the one that will travel with a shared plan.
      const named = planName(plan.store);
      const entry = findPlan(id);
      if (named !== null && entry && named !== entry.name) renamePlan(id, named);
      else if (named === null && entry) namePlan(plan.store, entry.name);
      showHash(id);
      setSession({ plan, start });
      refresh();
      if (previous !== null && previous !== id) void closePlan(previous);
    },
    [refresh],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Plans deleted on a page closed before their Undo ran out.
    for (const id of expiredDeletes()) {
      forgetPlan(id);
      void dropPlanDatabase(id);
    }
    const linked = planFromHash(location.hash);
    const id = (linked !== null ? findPlan(linked)?.id : undefined) ?? listPlans()[0]?.id ?? addPlan(UNTITLED).id;
    void show(id);
  }, [show]);

  // Another tab made, renamed or deleted a plan. If it deleted this one, open the one used last instead.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!isPlanListKey(e.key)) return;
      refresh();
      const id = current.current;
      if (id !== null && !findPlan(id)) void show(listPlans()[0]?.id ?? addPlan(UNTITLED).id);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh, show]);

  // A link to another plan, pasted into the address bar, opens it.
  useEffect(() => {
    const onHash = () => {
      const id = planFromHash(location.hash);
      if (id !== null && id !== current.current && findPlan(id)) void show(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [show]);

  const [notice, setNoticeState] = useState<PlanNotice | null>(null);
  const noticeRef = useRef<PlanNotice | null>(null);
  const setNotice = useCallback((next: PlanNotice | null) => {
    noticeRef.current = next;
    setNoticeState(next);
  }, []);
  // A notice replaced, or run out, can't be undone any more.
  const retire = useCallback(() => {
    const old = noticeRef.current;
    setNotice(null);
    old?.expire();
  }, [setNotice]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(retire, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, retire]);

  const make = useCallback(
    (name: string, content: Plan, start: PlanStart = {}, prepare?: (id: PlanId) => void) => {
      void (async () => {
        const old = current.current;
        const oldPlan = old !== null ? await openPlan(old) : null;
        // An untouched empty plan is replaced rather than kept (ADR 0021): a first visit leaves no litter.
        const replace = old !== null && oldPlan !== null && isEmptyPlan(oldPlan.store) && !findPlan(old)?.named;
        const entry = addPlan(name);
        const plan = await openPlan(entry.id);
        startPlan(plan.store, content);
        namePlan(plan.store, name);
        prepare?.(entry.id);
        await show(entry.id, start);
        if (replace) {
          forgetPlan(old);
          await closePlan(old);
          void dropPlanDatabase(old);
          refresh();
        }
      })();
    },
    [show, refresh],
  );

  const remove = useCallback(() => {
    const id = current.current;
    if (id === null) return;
    const name = findPlan(id)?.name ?? UNTITLED;
    retire();
    markDeleted(id);
    void (async () => {
      const next = listPlans()[0] ?? addPlan(UNTITLED);
      await show(next.id);
      setNotice({
        text: `Deleted “${name}”`,
        undo: () => {
          unmarkDeleted(id);
          void show(id);
        },
        expire: () => {
          forgetPlan(id);
          void dropPlanDatabase(id);
          refresh();
        },
      });
    })();
  }, [show, refresh, retire, setNotice]);

  if (!session) return <div className="loading">Loading…</div>;
  const id = session.plan.id;
  const actions: PlanActions = {
    plans,
    name: plans.find((p) => p.id === id)?.name ?? UNTITLED,
    make,
    open: (other) => {
      retire();
      void show(other);
    },
    rename: (name) => {
      renamePlan(id, name, { byHand: true });
      namePlan(session.plan.store, name);
      refresh();
    },
    remove,
  };
  return (
    <>
      <Workspace
        key={id}
        planId={id}
        store={session.plan.store}
        persistence={session.plan.persistence}
        start={session.start}
        planActions={actions}
      />
      {notice && (
        <div className="notice" role="status" data-testid="plan-notice">
          {notice.text}
          <button
            type="button"
            onClick={() => {
              const undoing = notice;
              setNotice(null);
              undoing.undo();
            }}
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}

const JUST_MOVED_MS = 1400;
const EXPAND_HINT_KEY = 'planning-board:hint-expand';
/** A related link's key among selected lines: unlike a dependency's `a->b`, it has no direction (Q44). */
const relatedLineKey = (d: Dependency) => `${d.from}~${d.to}`;

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

function Workspace({
  planId,
  store,
  persistence,
  start,
  planActions,
}: {
  planId: PlanId;
  store: PlanStore;
  persistence: PersistenceStatus;
  start: PlanStart | null;
  planActions: PlanActions;
}) {
  const source = useMemo(() => snapshotSource(store), [store]);
  const { plan, empty, canUndo, canRedo } = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const [choice, setChoice] = useState(() => loadViewChoice(planId));
  useEffect(() => saveViewChoice(planId, choice), [planId, choice]);
  // Groups expanded in place (Q33, ADR 0013). Viewer state, remembered per plan (ADR 0021).
  const [expanded, setExpanded] = useState<ItemId[]>(() => loadExpanded(planId));
  useEffect(() => saveExpanded(planId, expanded), [planId, expanded]);
  // An axis whose property was deleted falls back, rather than showing an empty board.
  const shown = useMemo(() => validChoice(plan, choice), [plan, choice]);
  // Folded bands on nested axes (ADR 0013): viewer state per property, folded by default, remembered like the view.
  const [foldings, setFoldings] = useState(() => loadFoldings(planId));
  useEffect(() => saveFoldings(planId, foldings), [planId, foldings]);
  const view = useMemo(
    () => ({
      ...withFolding(plan, toViewSpec(plan, shown), foldings),
      ...(expanded.length > 0 ? { expanded } : {}),
    }),
    [plan, shown, foldings, expanded],
  );
  const names = useMemo(() => ({ x: axisNames(plan, shown, 'x'), y: axisNames(plan, shown, 'y') }), [plan, shown]);
  const layout = useMemo(() => layoutView(plan, view), [plan, view]);
  // Values named from the headers (Q55): rename one, or add one at the top level or under a parent.
  const onRenameValue = useCallback(
    (which: 'x' | 'y', value: string, name: string): string | null => {
      const property = plan.properties[view[which].property];
      const node = property?.kind === 'select' ? property.values[value] : undefined;
      if (property?.kind !== 'select' || !node) return 'This value no longer exists.';
      const problem = valueLabelProblem(property, name, node.parent, value);
      if (problem !== null) return problem;
      renameValue(store, property.id, value, name);
      return null;
    },
    [plan, view, store],
  );
  const onAddValue = useCallback(
    (which: 'x' | 'y', parent: string | null, name: string): string | null => {
      const property = plan.properties[view[which].property];
      if (property?.kind !== 'select') return 'Values can only be added to a property with a list of values.';
      const problem = valueLabelProblem(property, name, parent);
      if (problem !== null) return problem;
      if (addValue(store, property.id, name, parent) === null) return 'This value couldn’t be added.';
      // A band with something new inside it opens, so the new value is on the board.
      if (parent !== null) setFoldings((f) => unfoldBand(f, property.id, parent));
      return null;
    },
    [plan, view, store],
  );
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
  /** A drop that would swap one of the card's values for another, on an axis that could hold both (Q53's hint). */
  const replacesAValue = (d: { card: CardRef; target: BoardTarget | null; mode: DropMode }) => {
    const target = d.target;
    if (d.mode !== 'replace' || !isCellTarget(target)) return false;
    const swaps = (which: 'x' | 'y') =>
      addAxes[which] && target[which] !== null && d.card[which] !== null && d.card[which] !== target[which];
    return swaps('x') || swaps('y');
  };
  const [compact, setCompact] = useState(loadCompactHolding);
  useEffect(() => saveCompactHolding(compact), [compact]);
  const [holdingCollapsed, setHoldingCollapsed] = useState(() => loadHoldingCollapsed(planId));
  useEffect(() => saveHoldingCollapsed(planId, holdingCollapsed), [planId, holdingCollapsed]);

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
  // A new blank plan opens with the first card's title ready to type (Q51).
  const [editingState, setEditing] = useState<Editing | null>(() => {
    if (!start?.typing) return null;
    const first = layoutView(plan, toViewSpec(plan, DEFAULT_VIEW)).gaps.x?.[0];
    return first === undefined ? null : { kind: 'new', spot: { x: first, y: null } };
  });
  // Cards with a solid copy on screen: only those can show a title field. A
  // rename whose card has none (it's off-screen, or only a faded copy) is
  // dropped, rather than leaving the board waiting for a field that isn't there.
  const renamable = useMemo(
    () =>
      new Set(
        allCopies(layout)
          .filter((ref) => !ref.via)
          .map((ref) => ref.itemId),
      ),
    [layout],
  );
  const editing = editingState?.kind === 'rename' && !renamable.has(editingState.card.itemId) ? null : editingState;
  // A new plan's first notice says where it came from, such as the file it was opened from.
  const [notice, setNotice] = useState<Notice | null>(() => (start?.notice ? { text: start.notice } : null));
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
      // Dragging a selected card moves the whole selection (Q48).
      const several = selected.has(card.itemId) && selected.size > 1 ? [...selected] : null;
      if (isCellTarget(target)) {
        if (several) {
          const n = dropCards(store, view, card, several, target, mode);
          if (n === 0) return;
          setJustMoved(card.itemId);
          setNotice({
            text: `Moved ${n} ${n === 1 ? 'card' : 'cards'} to ${dropText(layout, target, names)}`,
            step: store.undoManager.undoStack.at(-1),
          });
        } else if (dropCard(store, view, card, target, mode)) setJustMoved(card.itemId);
        return;
      }
      // Held over a card (hold to nest), or dropped on the move-out strip or the breadcrumb.
      const parent = isIntoTarget(target) ? target.into : target.parent;
      const from = plan.items[card.itemId]?.parent ?? null;
      const titleOf = (id: ItemId | null) => (id === null ? 'the plan' : `“${plan.items[id]?.title ?? ''}”`);
      // Several cards: those that can go inside the target, or, for the strip, those in the dragged card's group.
      const ids = several
        ? several.filter((id) => (isIntoTarget(target) ? canNest(plan, id, target.into) : (plan.items[id]?.parent ?? null) === from))
        : [card.itemId];
      const what = (moved: ItemId[]) => (moved.length === 1 ? titleOf(moved[0]!) : `${moved.length} cards`);
      moveCards(ids, parent, (moved) =>
        isIntoTarget(target)
          ? `Put ${what(moved)} inside ${titleOf(parent)}`
          : parent === (from === null ? null : (plan.items[from]?.parent ?? null))
            ? `Moved ${what(moved)} out of ${titleOf(from)}`
            : `Moved ${what(moved)} out to ${titleOf(parent)}`,
      );
    },
    [store, view, plan, moveCards, selected, layout, names],
  );

  const onCardClick = useCallback(
    (card: CardRef, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
      // A one-time hint (Q53): the first time a group is clicked, say how to see inside it. Remembered per browser.
      if (!(e.shiftKey || e.metaKey || e.ctrlKey) && counts.has(card.itemId) && !card.via) {
        try {
          if (localStorage.getItem(EXPAND_HINT_KEY) !== '1') {
            localStorage.setItem(EXPAND_HINT_KEY, '1');
            setNotice((current) => current ?? { text: `Press ${keyNames().expand}, or click its count, to see what’s inside right here.` });
          }
        } catch {
          // Storage can be unavailable; a hint is a convenience.
        }
      }
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
    [counts],
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
  // Box select (Q48): the cards a box touches are the selection, without a notice for every move of the pointer.
  const onBoxSelect = useCallback((ids: ItemId[]) => {
    setSelection(new Set(ids));
    setSelectedLinks(new Set());
    setAnchor(null);
  }, []);
  const selectAll = useCallback(() => selectMany(cardsOnBoard(layout), 'on the board'), [layout, selectMany]);
  const clearSelection = useCallback(() => {
    setSelection(new Set());
    setSelectedLinks(new Set());
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Pivots move (Q52, ADR 0015): where the cards were, measured just before a new choice renders.
  const pivotFrom = useRef<Positions | null>(null);
  const [pivoting, setPivoting] = useState(false);
  const pivot = useCallback(
    (next: ViewChoice) => {
      if (next.x === shown.x && next.y === shown.y) return;
      if (scrollRef.current) pivotFrom.current = capturePositions(scrollRef.current);
      setChoice(next);
    },
    [shown],
  );
  useLayoutEffect(() => {
    const before = pivotFrom.current;
    pivotFrom.current = null;
    if (!before || !scrollRef.current) return;
    const ms = playFrom(scrollRef.current, before);
    // A pivot that moves nothing still ends one that was moving, whose timer this effect's cleanup cleared.
    if (ms === 0) {
      setPivoting(false);
      return;
    }
    // Lines are drawn where the cards end up, so they wait until the cards get there.
    setPivoting(true);
    const timer = setTimeout(() => setPivoting(false), ms);
    return () => clearTimeout(timer);
  }, [shown]);
  /** Every copy on the board, with expanded groups' frames opened up. */
  const shownCopies = useMemo(() => allCopies(layout), [layout]);
  /**
   * The group ⇧E collapses for a selected card: the card itself if it's an
   * expanded group, which is its frame's header (Q57), or else its group, if
   * that's expanded.
   */
  const collapseTarget = useCallback(
    (id: ItemId): ItemId | null => {
      if (expanded.includes(id)) return id;
      const parent = plan.items[id]?.parent ?? null;
      return parent !== null && expanded.includes(parent) ? parent : null;
    },
    [expanded, plan],
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
      // Expanded groups leave the selection, and their cards aren't selected in their place: dragging a selected
      // card moves the whole selection (Q48), so a card dragged out right after expanding would take its siblings
      // with it. The group's frame shows which cards are its (Q57).
      setSelection((current) => new Set([...current].filter((id) => !open.includes(id))));
    },
    [expanded, counts],
  );
  const expandSelection = useCallback(() => expandGroups([...selected]), [expandGroups, selected]);
  // ⇧E: collapse the groups the selected cards are shown for, one level up. Groups expand and collapse; bands
  // fold and unfold (Q54), so the two never share a word.
  const collapseSelection = useCallback(() => {
    const collapse = new Set<ItemId>();
    for (const id of selected) {
      const group = collapseTarget(id);
      if (group !== null) collapse.add(group);
    }
    if (collapse.size === 0) {
      setNotice({ text: 'Select a card inside an expanded group, then press ⇧E to collapse the group.' });
      return;
    }
    setExpanded((current) => current.filter((id) => !collapse.has(id)));
    setSelection(collapse);
  }, [selected, collapseTarget]);

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

  // Finding (Q50, ADR 0014): / and a few words dim every card that doesn't match. Viewer state, kept across
  // pivots, folds and expands, but not saved.
  const [query, setQuery] = useState('');
  const [findOpen, setFindOpen] = useState(false);
  const findRef = useRef<HTMLInputElement>(null);
  // Opens the bar, whose field takes focus as it appears; if it's already open, focuses it and selects what's typed.
  const openFind = useCallback(() => {
    if (findRef.current) {
      findRef.current.focus();
      findRef.current.select();
    } else setFindOpen(true);
  }, []);
  const words = useMemo(() => queryWords(query), [query]);
  const found = useMemo(() => (words.length === 0 ? null : findOnBoard(plan, layout, words)), [plan, layout, words]);
  // The match ↓ and ↑ last showed.
  const [findAt, setFindAt] = useState<ItemId | null>(null);
  const clearFind = useCallback(() => {
    setQuery('');
    setFindAt(null);
    setFindOpen(false);
  }, []);
  const stepFound = useCallback(
    (by: 1 | -1) => {
      const next = found ? stepMatch(found.matches, findAt, by) : null;
      if (next === null) return;
      setFindAt(next);
      revealCard(next);
    },
    [found, findAt, revealCard],
  );
  // Enter: select every match, expanding the groups that hide some of them, like "Show it on the board".
  // Focus goes back to the board, so E, L and I act on the matches straight away.
  const selectFound = useCallback(() => {
    if (!found) return;
    const open = new Set<ItemId>();
    for (const ids of found.inside.values()) {
      for (const id of ids) for (const group of ancestry(plan, id).slice(0, -1)) if (!expanded.includes(group)) open.add(group);
    }
    if (open.size > 0) setExpanded((current) => [...current, ...[...open].filter((g) => !current.includes(g))]);
    // An expanded group leaves the board (its cards take its place), so it can't stay selected.
    const ids = found.matches.filter((id) => !open.has(id));
    setSelection(new Set(ids));
    setSelectedLinks(new Set());
    setAnchor(null);
    const n = ids.length;
    const groups = open.size === 1 ? '1 group' : `${open.size} groups`;
    setNotice({
      text:
        n === 0
          ? `No cards match “${query.trim()}”`
          : `Selected ${n} ${n === 1 ? 'card' : 'cards'} matching “${query.trim()}”${open.size > 0 ? `, and expanded ${groups} to show them` : ''}`,
    });
    findRef.current?.blur();
  }, [found, plan, expanded, query]);

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
  const onCollapseGroup = useCallback((id: ItemId) => setExpanded((current) => current.filter((open) => open !== id)), []);
  const onSpotDoubleClick = useCallback((spot: DropTarget) => setEditing({ kind: 'new', spot }), []);
  const onCancelEdit = useCallback(() => setEditing(null), []);
  const onCommitEdit = useCallback(
    (title: string, how: CommitHow) => {
      setEditing(null);
      if (editing?.kind === 'rename') renameItem(store, editing.card.itemId, title);
      if (editing?.kind === 'new') {
        // Enter on a new card opens the next one beside it (Q51), so ideas can be typed one after another.
        const next = how === 'enter' ? newItemSpot(plan, view, editing.spot) : null;
        const id = createItem(store, view, editing.spot, title);
        if (id) {
          setSelection(new Set([id]));
          setJustMoved(id);
          if (next) setEditing({ kind: 'new', spot: next, chain: (editing.chain ?? 0) + 1 });
        }
      }
    },
    [store, plan, view, editing],
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
  // ⌥L does the same for related links (Q44), which have no direction.
  const [pendingLink, setPendingLink] = useState<ItemId | null>(null);
  const [pendingKind, setPendingKind] = useState<'depends' | 'related'>('depends');
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
  const toggleRelated = useCallback(
    (x: ItemId, y: ItemId) => {
      if (hasRelated(plan, x, y)) {
        removeRelated(store, x, y);
        setNotice({ text: `${titleOf(x)} and ${titleOf(y)} are no longer related`, step: store.undoManager.undoStack.at(-1) });
        return;
      }
      const problem = addRelated(store, x, y);
      if (problem !== null) setNotice({ text: problem });
      else setNotice({ text: `Related ${titleOf(x)} and ${titleOf(y)}`, step: store.undoManager.undoStack.at(-1) });
    },
    [plan, store, titleOf],
  );
  // ⌥L: relate the two selected cards, or start a related link from the one selected (Q44).
  const relateSelection = useCallback(() => {
    const ids = [...selected];
    if (pendingFrom !== null && pendingKind === 'related') {
      if (ids.length !== 1 || ids[0] === pendingFrom) {
        setNotice({ text: `Select one other card to relate to ${titleOf(pendingFrom)}. Esc cancels.` });
        return;
      }
      toggleRelated(pendingFrom, ids[0]!);
      setPendingLink(null);
      return;
    }
    if (ids.length === 1) {
      setPendingLink(ids[0]!);
      setPendingKind('related');
    } else if (ids.length === 2) toggleRelated(ids[0]!, ids[1]!);
    else {
      setNotice({
        text: ids.length === 0 ? `Select two cards, then press ${keyNames().relate} to relate them.` : 'Select just two cards to relate.',
      });
    }
  }, [selected, pendingFrom, pendingKind, titleOf, toggleRelated]);
  const linkSelection = useCallback(() => {
    const ids = [...selected];
    if (pendingFrom !== null && pendingKind === 'related') {
      relateSelection();
      return;
    }
    if (pendingFrom !== null) {
      if (ids.length !== 1 || ids[0] === pendingFrom) {
        setNotice({ text: `Select one other card: the one ${titleOf(pendingFrom)} comes before. Esc cancels.` });
        return;
      }
      toggleLink(pendingFrom, ids[0]!);
      setPendingLink(null);
      return;
    }
    if (ids.length === 1) {
      setPendingLink(ids[0]!);
      setPendingKind('depends');
    } else if (ids.length === 2) toggleLink(ids[0]!, ids[1]!);
    else {
      setNotice({
        text:
          ids.length === 0
            ? 'Select the card that comes first, then the one it comes before, and press L.'
            : 'Select just two cards: the one that comes first, then the one it comes before.',
      });
    }
  }, [selected, pendingFrom, pendingKind, titleOf, toggleLink, relateSelection]);

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

  // The cheat sheet opens from "?" only (Q53): a first-time visitor learns from the guided start and the board.
  const [legendOpen, setLegendOpen] = useState(false);
  const closeLegend = () => setLegendOpen(false);
  // The guided start (Q53): offered with a blank plan until it's been finished or skipped in this browser.
  // It runs in the plan it started in (ADR 0021), and waits there while another plan is open.
  const [guide, setGuideState] = useState<GuideState | null>(() => {
    const state = loadGuide();
    return state === 'running' && loadGuidePlan() !== planId ? null : state;
  });
  const setGuide = useCallback((state: GuideState) => {
    setGuideState(state);
    saveGuide(state);
  }, []);
  const keys = keyNames();
  const canNestCard = useCallback((id: ItemId, into: ItemId) => canNest(plan, id, into), [plan]);
  const { drag, startDrag } = useCardDrag(onDrop, scrollRef, onCardClick, canNestCard);
  const dragging = drag !== null;
  // A press on a card doesn't move focus (the drag stops the browser doing it), so whatever had it keeps it: the
  // find field would swallow E or L, and a button just clicked, such as a view or Expand, would take Enter and
  // Delete for itself. Take focus off anything outside the board, so keys act on the card.
  const onCardPointerDown = useCallback(
    (...args: Parameters<typeof startDrag>) => {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body && !scrollRef.current?.contains(focused)) focused.blur();
      startDrag(...args);
    },
    [startDrag],
  );
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
    // While finding, a red line between two cards that don't match dims with them. Focus lines don't: they
    // only show for the card you're pointing at or have selected.
    const bright = (id: ItemId) => found === null || found.shown.has(id) || found.inside.has(id);
    const problemLines = visibleLinks(plan, flagged, renamable)
      .map(drawn('problem'))
      .map((line) => (bright(line.from) || bright(line.to) ? line : { ...line, dimmed: true }));
    // A pair of cards with both kinds of link gets one red line.
    const taken = new Set(problemLines.map((l) => `${l.from}->${l.to}`));
    const focusLines = visibleLinks(plan, [...focus.values()], renamable)
      .filter((l) => !taken.has(`${l.from}->${l.to}`))
      .map(drawn('focus'));
    // Related links (Q44): dotted, for the hovered card and each selected card, direct ones only. Never flagged.
    const relatedFocus = new Map<string, Dependency>();
    const relate = (d: Dependency) => relatedFocus.set(relatedLineKey(d), d);
    for (const id of selected) directRelated(plan, id).forEach(relate);
    if (hovered !== null && plan.items[hovered]) directRelated(plan, hovered).forEach(relate);
    for (const l of plan.related) if (selectedLinks.has(relatedLineKey({ from: l.a, to: l.b }))) relate({ from: l.a, to: l.b });
    const relatedLines = visibleLinks(plan, [...relatedFocus.values()], renamable).map(
      (line): DrawnLine => ({
        ...line,
        tone: 'related',
        label: line.links.map((d) => `${plan.items[d.from]?.title ?? ''} and ${plan.items[d.to]?.title ?? ''} are related`).join('\n'),
        selected: line.links.some((d) => selectedLinks.has(relatedLineKey(d))),
      }),
    );
    return [...relatedLines, ...focusLines, ...problemLines];
  }, [plan, problems, selected, hovered, selectedLinks, renamable, dragging, found]);

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
    setSelectedLinks(new Set(line.links.map(line.tone === 'related' ? relatedLineKey : linkKey)));
    setSelection(new Set());
  }, []);
  const deleteSelectedLinks = useCallback(() => {
    const doomedRelated = plan.related.filter((l) => selectedLinks.has(relatedLineKey({ from: l.a, to: l.b })));
    if (doomedRelated.length > 0) {
      const removed = removeRelatedLinks(store, doomedRelated);
      setSelectedLinks(new Set());
      if (removed === 0) return;
      const first = doomedRelated[0]!;
      setNotice({
        text: removed === 1 ? `${titleOf(first.a)} and ${titleOf(first.b)} are no longer related` : `Removed ${removed} related links`,
        step: store.undoManager.undoStack.at(-1),
      });
      return;
    }
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
        else if (findOpen) clearFind();
        return;
      }
      if (e.key === '/' && !e.altKey && !empty) {
        e.preventDefault();
        openFind();
        return;
      }
      if (e.key.toLowerCase() === 'l' && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        linkSelection();
        return;
      }
      // ⌥L types "¬" on a Mac, so the key's position is what counts (Q44).
      if (e.code === 'KeyL' && e.altKey && !e.shiftKey) {
        e.preventDefault();
        relateSelection();
        return;
      }
      if (e.key.toLowerCase() === 'e' && !e.altKey && !empty) {
        e.preventDefault();
        if (e.shiftKey) collapseSelection();
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
    relateSelection,
    selectedLinks,
    deleteSelectedLinks,
    groupSelection,
    ungroupSelection,
    togglePanel,
    empty,
    expandSelection,
    collapseSelection,
    selectAll,
    findOpen,
    openFind,
    clearFind,
  ]);

  // A card's actions (Q54): right-click a card, or its "⋯". The menu acts on the selection; a card that isn't in it
  // becomes the selection first, as a right-click does in file managers.
  const [cardMenu, setCardMenu] = useState<{ x: number; y: number } | null>(null);
  const closeCardMenu = useCallback(() => setCardMenu(null), []);
  const openCardMenu = useCallback((id: ItemId, x: number, y: number) => {
    setSelection((current) => (current.has(id) ? current : new Set([id])));
    setSelectedLinks(new Set());
    setCardMenu({ x, y });
  }, []);
  const cardMenuEntries = (): ContextEntry[] => {
    const ids = [...selected];
    const one = ids.length === 1 ? ids[0]! : null;
    const groups = ids.filter((id) => counts.has(id));
    const collapsible = ids.some((id) => collapseTarget(id) !== null);
    return [
      {
        label: 'Rename',
        shortcut: 'Enter',
        disabled: one === null || !renamable.has(one),
        onSelect: () => one !== null && setEditing({ kind: 'rename', card: { itemId: one, x: null, y: null } }),
      },
      { label: 'Inspect', shortcut: keys.inspect, onSelect: () => setPanel('inspector') },
      { label: 'Add a card inside', disabled: one === null, onSelect: () => one !== null && addInside(one) },
      'divider',
      {
        label: 'Expand',
        shortcut: keys.expand,
        disabled: !groups.some((id) => !expanded.includes(id)),
        title: 'Show what’s inside, right here',
        onSelect: expandSelection,
      },
      { label: 'Collapse', shortcut: keys.collapse, disabled: !collapsible, onSelect: collapseSelection },
      { label: ids.length > 1 ? 'Group these cards' : 'Put in a new group', shortcut: keys.group, onSelect: groupSelection },
      { label: 'Ungroup', shortcut: keys.ungroup, disabled: groups.length === 0, onSelect: ungroupSelection },
      'divider',
      {
        label: ids.length === 2 ? 'Link: first comes before second' : 'Start a link from here',
        shortcut: keys.link,
        disabled: ids.length > 2,
        onSelect: linkSelection,
      },
      {
        label: ids.length === 2 ? 'Relate these two' : 'Relate to…',
        shortcut: keys.relate,
        disabled: ids.length > 2,
        onSelect: relateSelection,
      },
      'divider',
      { label: ids.length > 1 ? `Delete ${ids.length} cards` : 'Delete', shortcut: keys.delete, onSelect: deleteSelection },
    ];
  };

  // Each of these makes a new plan, and nothing is overwritten (Q66).
  const loadSample = () => {
    // The sample opens on Roadmap, which reads as a grid of two properties straight away (Q52).
    planActions.make('Sample plan', samplePlan(), {}, (id) => saveViewChoice(id, { x: TIME, y: SYSTEM }));
  };
  // Starting from scratch (Q51): the built-in properties, no cards, and the first card's title ready to type.
  const startBlank = () => {
    planActions.make(UNTITLED, blankPlan(), { typing: true }, (id) => {
      if (!offersGuide(guide)) return;
      saveGuide('running');
      saveGuidePlan(id);
    });
  };

  // Plan files (requirement 29, ADR 0005).
  const [fileProblem, setFileProblem] = useState<FileProblem | null>(null);
  const openInput = useRef<HTMLInputElement>(null);
  const savePlanFile = () => downloadText(datedFileName(fileSlug(planActions.name), 'json'), planFileText(plan, planActions.name));
  const openPlanFile = async (file: File) => {
    const opened = readPlanFile(await file.text());
    if (!opened.ok) {
      setFileProblem({ name: file.name, summary: opened.summary, details: opened.details });
      return;
    }
    planActions.make(opened.name ?? nameFromFile(file.name), opened.plan, { notice: `Opened “${file.name}”` });
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
  const yourPlans: MenuEntry[] = planActions.plans.map((entry) => ({
    key: entry.id,
    label: entry.name,
    current: entry.id === planId,
    onSelect: () => entry.id !== planId && planActions.open(entry.id),
  }));
  const fileMenu = (
    <Menu
      label="File"
      testId="file-menu"
      entries={[
        {
          label: 'New blank plan',
          onSelect: startBlank,
          title: 'Start a new, empty plan, ready to type ideas into',
        },
        {
          label: 'Open plan file…',
          onSelect: () => openInput.current?.click(),
          title: 'Open a saved plan file as a new plan',
        },
        {
          label: 'Import CSV (Jira export)…',
          onSelect: () => csvInput.current?.click(),
          title: 'Make a new plan from a CSV file, such as a Jira export',
        },
        { label: 'Load sample plan', onSelect: loadSample, title: 'Open a sample product line as a new plan' },
        'divider',
        {
          label: 'Save plan to file',
          onSelect: savePlanFile,
          disabled: empty,
          title: 'Download the plan as a file you can open again, here or in another browser',
        },
        {
          label: 'Delete plan',
          onSelect: planActions.remove,
          disabled: empty && planActions.plans.length <= 1,
          title: 'Delete this plan from this browser. You can undo it for a few seconds.',
        },
        'divider',
        { heading: 'Your plans' },
        ...yourPlans,
      ]}
    />
  );

  return (
    <div className="app" data-plan-db={planDatabase(planId)}>
      <header className="toolbar">
        <PlanName name={planActions.name} onRename={planActions.rename} />
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
            onClick={collapseSelection}
            disabled={![...selected].some((id) => collapseTarget(id) !== null)}
            title={`Collapse the groups the selected cards are in (${keys.collapse})`}
          >
            Collapse
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
          {!empty && <FindButton open={findOpen} onClick={() => (findOpen ? clearFind() : openFind())} />}
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
      {!empty && <ViewBar plan={plan} choice={shown} onChange={pivot} foldAll={{ x: foldAll('x'), y: foldAll('y') }} />}
      {persistence === 'unavailable' && (
        <div className="banner" role="status">
          This browser isn't letting the board save, so changes will be lost when you reload. Chrome and Edge are
          known to work.
        </div>
      )}
      {pendingFrom !== null && !empty && (
        <div className="link-bar" role="status" data-testid="link-bar">
          {pendingKind === 'related' ? (
            <>
              Relating {titleOf(pendingFrom)}: select the other card, then press <kbd>{keys.relate}</kbd>.
            </>
          ) : (
            <>
              Linking from {titleOf(pendingFrom)}: select the card it comes before, then press <kbd>{keys.link}</kbd>.
            </>
          )}
          <button type="button" onClick={() => setPendingLink(null)}>
            Cancel
          </button>
        </div>
      )}
      {findOpen && !empty && (
        <FindBar
          query={query}
          onChange={(text) => {
            setQuery(text);
            setFindAt(null);
          }}
          found={found}
          onSelect={selectFound}
          onStep={stepFound}
          onClose={clearFind}
          inputRef={findRef}
        />
      )}
      {empty ? (
        <div className="empty-state">
          <h2>Sort out a release plan</h2>
          <p>
            Put your ideas on cards, then sort the same cards by area, time, size or level, just by dragging. Start
            with a blank plan and a short guide, or look around a sample product line first.
          </p>
          <div className="empty-actions">
            <button type="button" className="primary" onClick={startBlank}>
              Start a blank plan
            </button>
            <button type="button" onClick={loadSample}>
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
          holdingCollapsed={holdingCollapsed}
          onHoldingCollapsedChange={setHoldingCollapsed}
          onCompactChange={setCompact}
          lifted={drag?.card ?? null}
          target={drag?.target ?? null}
          onCardPointerDown={onCardPointerDown}
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
          onCollapseGroup={onCollapseGroup}
          onSpotDoubleClick={onSpotDoubleClick}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
          onBackgroundPointerDown={clearSelection}
          onBoxSelect={onBoxSelect}
          mismatches={mismatches}
          onBandToggle={onBandToggle}
          onCardMenu={openCardMenu}
          onRenameValue={onRenameValue}
          onAddValue={onAddValue}
          onSelectLanes={onSelectLanes}
          onSelectMatching={onSelectMatching}
          levelNames={levelNames}
          found={found}
          pivoting={pivoting}
        />
        {guide === 'running' && (
          // A column beside the board, not over it, so it never hides a card a step asks you to drag.
          <Guide
            plan={plan}
            onSkip={() => setGuide('skipped')}
            onFinish={() => setGuide('finished')}
            onHelp={() => {
              setGuide('finished');
              setLegendOpen(true);
            }}
            onSample={() => {
              setGuide('finished');
              loadSample();
            }}
          />
        )}
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
            onShowAsRows={(property) => pivot(chooseAxis(shown, 'y', property))}
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
      {cardMenu && selected.size > 0 && (
        <ContextMenu
          x={cardMenu.x}
          y={cardMenu.y}
          label={selected.size === 1 ? 'Card actions' : `Actions for ${selected.size} cards`}
          entries={cardMenuEntries()}
          onClose={closeCardMenu}
        />
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
            const result = importedPlan(draft, choices, quarterOrder);
            setImporting(null);
            const n = result.counts.cards;
            // Imported cards have no sequence position, so a sequence view would hold them all in
            // one lane. Time × System shows them where the export put them (questions.md Q30).
            planActions.make(
              nameFromFile(importing.fileName),
              result.plan,
              { notice: `Imported ${n} ${n === 1 ? 'card' : 'cards'} from “${importing.fileName}”` },
              (id) => saveViewChoice(id, { x: TIME, y: SYSTEM }),
            );
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
      {drag && (
        <DragGhost
          drag={drag}
          addAxes={addAxes}
          titleOf={(id) => plan.items[id]?.title ?? ''}
          where={isCellTarget(drag.target) ? dropText(layout, drag.target, names) : null}
          count={selected.has(drag.card.itemId) ? selected.size : 1}
          hint={replacesAValue(drag) ? `${keys.add} adds instead` : null}
        />
      )}
    </div>
  );
}
