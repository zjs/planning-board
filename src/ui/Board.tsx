import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  badgeProperties,
  cardAttributes,
  type CardAttribute,
} from "../domain/attributes.ts";
import { levelWeight } from "../domain/builtins.ts";
import { depthOf } from "../domain/hierarchy.ts";
import { SYSTEM, type ItemId, type Plan } from "../domain/model.ts";
import type { DropTarget } from "../domain/move.ts";
import { childCounts } from "../domain/tree.ts";
import {
  allCopies,
  unwrap,
  type Band,
  type CardRef,
  type Lane,
  type ViewLayout,
  type ViewSpec,
} from "../domain/view.ts";
import type { Found } from "../domain/finding.ts";
import type { Mismatches } from "../domain/mismatches.ts";
import { Card, DraftCard, type CommitHow } from "./Card.tsx";
import { areaPalette, cardAreas } from "./areas.ts";
import { inSentence, type HoldingCollapsed } from "./axes.ts";
import { DependencyLines, type DrawnLine } from "./DependencyLines.tsx";
import { HeaderField } from "./HeaderField.tsx";
import { keyNames } from "./platform.ts";
import { isCellTarget, isIntoTarget, type BoardTarget } from "./useCardDrag.ts";

interface Props {
  plan: Plan;
  view: ViewSpec;
  layout: ViewLayout;
  xLabel: string;
  yLabel: string;
  /** Header of each axis's holding lane, such as "No quarter". */
  xNone: string;
  yNone: string;
  /** Header of a parent's own lane on a nested axis, such as "No component". */
  xParentNone: string;
  yParentNone: string;
  /** Show holding-lane cards as one-line chips. */
  compact: boolean;
  /** Holding lanes collapsed to a thin rail, which still takes drops and shows its count. */
  holdingCollapsed: HoldingCollapsed;
  onHoldingCollapsedChange: (collapsed: HoldingCollapsed) => void;
  onCompactChange: (compact: boolean) => void;
  /** The copy being dragged, if any. */
  lifted: CardRef | null;
  /** What the dragged card is over. Kept referentially stable by the drag hook. */
  target: BoardTarget | null;
  onCardPointerDown: (
    e: PointerEvent<HTMLElement>,
    card: CardRef,
    title: string,
    draggable?: boolean,
  ) => void;
  /** Item to highlight after a drop. */
  justMoved: ItemId | null;
  /** The viewer's selected items. */
  selected: ReadonlySet<ItemId>;
  /** A title being typed: a new card at a spot, or a rename of one copy. */
  editing: Editing | null;
  onCardDoubleClick: (card: CardRef) => void;
  /** The child count on a group card, which expands it. */
  onCardExpand: (card: CardRef) => void;
  /** The ▾ on an expanded group's frame (Q57). */
  onCollapseGroup: (id: ItemId) => void;
  /** Double-click on empty space in a cell or holding lane. */
  onSpotDoubleClick: (spot: DropTarget) => void;
  onCommitEdit: (title: string, how: CommitHow) => void;
  onCancelEdit: () => void;
  /** A press on the board outside any card, which clears the selection. */
  onBackgroundPointerDown: () => void;
  /** A box dragged across empty space selects the cards it touches (Q48): the whole new selection. */
  onBoxSelect: (ids: ItemId[]) => void;
  /** Cards are gliding to a new view (ADR 0015): lines wait until they arrive. */
  pivoting?: boolean;
  /** Group mismatch markers (requirements 13, 18). */
  mismatches: Mismatches;
  /** Open a card's actions at a point on screen (Q54): right-click, or its "⋯". */
  onCardMenu: (id: ItemId, x: number, y: number) => void;
  /** Rename a value from its header (Q55). Returns why the name can't be used, or null once it's saved. */
  onRenameValue: (
    which: "x" | "y",
    value: string,
    name: string,
  ) => string | null;
  /** Add a value from a header: at the top level, or under `parent`. Returns why not, or null once added. */
  onAddValue: (
    which: "x" | "y",
    parent: string | null,
    name: string,
  ) => string | null;
  /** Fold or unfold a band on a nested axis (ADR 0013). */
  onBandToggle: (which: "x" | "y", key: string) => void;
  /** ⇧-click on a lane or band header: select every card in lanes `start` up to `end` (Q47). */
  onSelectLanes: (which: "x" | "y", start: number, end: number) => void;
  /** ⇧-click on a card's badge: select every card on the board with that value (Q47). */
  onSelectMatching: (property: string, value: string) => void;
  /** The level each axis shows, such as "component", for a collapsed lane's "4 components". */
  levelNames: { x: string; y: string };
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Dependency lines to draw (requirement 15). */
  lines: readonly DrawnLine[];
  /** Cards whose copies are joined and outlined: the hovered and selected ones with several (Q45). */
  copyFocus: readonly ItemId[];
  /** The card under the pointer, for its focus lines (Q39). */
  onHover: (id: ItemId | null) => void;
  onLineClick: (line: DrawnLine) => void;
  /** What's being found (Q50): cards that don't match dim. Null when nothing is typed. */
  found: Found | null;
}

const NONE: readonly string[] = [];
/** How far a press on empty space moves before it draws a box rather than counting as a click. */
const BOX_THRESHOLD_PX = 5;

const sameCopy = (a: CardRef, b: CardRef) =>
  a.itemId === b.itemId && a.x === b.x && a.y === b.y;

/**
 * A title being typed: a new card at a spot, or a rename. `chain` counts the
 * new cards typed one after another (Q51), so each gets a fresh field.
 */
export type Editing =
  | { kind: "new"; spot: DropTarget; chain?: number }
  | { kind: "rename"; card: CardRef };

/**
 * Which copy shows the rename field: the one asked for, or, if a pivot
 * moved it, the item's first copy on the board.
 */
function renameCopy(
  layout: ViewLayout,
  editing: Editing | null,
): CardRef | null {
  if (editing?.kind !== "rename") return null;
  const copies = allCopies(layout).filter(
    (c) => c.itemId === editing.card.itemId && !c.via,
  );
  return copies.find((c) => sameCopy(c, editing.card)) ?? copies[0] ?? null;
}

/**
 * One grid track: a lane, or on a sequence axis, the droppable gap before a
 * lane or after the last (questions.md Q8).
 */
type Track =
  | { kind: "lane"; lane: Lane; index: number }
  | { kind: "gap"; key: string };

function tracks(lanes: Lane[], layoutGaps: string[] | null): Track[] {
  // One gap per lane plus one at the end; anything else would misplace drops, so show no gaps.
  const gaps = layoutGaps?.length === lanes.length + 1 ? layoutGaps : null;
  const out: Track[] = [];
  lanes.forEach((lane, index) => {
    if (gaps) out.push({ kind: "gap", key: gaps[index]! });
    out.push({ kind: "lane", lane, index });
  });
  if (gaps) out.push({ kind: "gap", key: gaps[lanes.length]! });
  return out;
}

const trackKey = (t: Track) => (t.kind === "lane" ? t.lane.key : t.key);

/**
 * One row of column bands at a band level: each band once, spanning its
 * lanes, and null for a lane no band at that level covers.
 */
function bandCells(
  bands: Band[],
  depth: number,
  lanes: number,
): (Band | null)[] {
  const out: (Band | null)[] = [];
  for (let i = 0; i < lanes; ) {
    const band = bands.find((b) => b.depth === depth && b.start === i);
    out.push(band ?? null);
    i = band ? band.end : i + 1;
  }
  return out;
}

/**
 * Memoized: during a drag only the ghost moves, and the board re-renders
 * only when the drop target changes.
 */
export const Board = memo(function Board({
  plan,
  view,
  layout,
  xLabel,
  yLabel,
  xNone,
  yNone,
  xParentNone,
  yParentNone,
  compact,
  holdingCollapsed,
  onHoldingCollapsedChange,
  onCompactChange,
  lifted,
  target,
  onCardPointerDown,
  justMoved,
  scrollRef,
  lines,
  copyFocus,
  onHover,
  onLineClick,
  selected,
  editing,
  onCardDoubleClick,
  onCardExpand,
  onCollapseGroup,
  onSpotDoubleClick,
  onCommitEdit,
  onCancelEdit,
  onBackgroundPointerDown,
  onBoxSelect,
  onBandToggle,
  onCardMenu,
  onRenameValue,
  onAddValue,
  onSelectLanes,
  onSelectMatching,
  levelNames,
  mismatches,
  found,
  pivoting = false,
}: Props) {
  /**
   * A lane header. On a nested axis, a parent's own lane reads "No
   * component", and a folded one says how much it holds; clicking that
   * unfolds it, a bigger target than the band's ▸ (ADR 0013).
   */
  // A header being typed into (Q55): a value's new name, or a new value under `key` (null: the top level).
  const [headerEdit, setHeaderEdit] = useState<{
    which: "x" | "y";
    mode: "rename" | "add";
    key: string | null;
  } | null>(null);
  const editingHeader = (
    which: "x" | "y",
    mode: "rename" | "add",
    key: string | null,
  ) =>
    headerEdit !== null &&
    headerEdit.which === which &&
    headerEdit.mode === mode &&
    headerEdit.key === key;
  const stopHeaderEdit = () => setHeaderEdit(null);
  /** The level a new value would be at, in a sentence ("area", "component"), or null on an axis with none. */
  const newLevelName = (
    which: "x" | "y",
    parent: string | null,
  ): string | null => {
    const property = plan.properties[view[which].property];
    if (property?.kind !== "select") return null;
    const levels =
      property.levels.length > 0 ? property.levels : [property.name];
    const name = levels[parent === null ? 0 : depthOf(property, parent) + 1];
    return name === undefined ? null : inSentence(name);
  };
  /** "+ Add area", or the field for naming one. */
  const addControl = (which: "x" | "y", parent: string | null) => {
    const level = newLevelName(which, parent);
    if (level === null) return null;
    if (editingHeader(which, "add", parent)) {
      return (
        <HeaderField
          label={`New ${level}`}
          placeholder={`New ${level}`}
          chain
          onCommit={(name) => onAddValue(which, parent, name)}
          onDone={stopHeaderEdit}
        />
      );
    }
    return (
      <button
        type="button"
        className="header-add"
        data-testid={`add-${which}${parent === null ? "" : `-${parent}`}`}
        onClick={(e) => {
          e.stopPropagation();
          setHeaderEdit({ which, mode: "add", key: parent });
        }}
      >
        + Add {level}
      </button>
    );
  };
  /** A value's name in its header, which double-click renames. */
  const renameField = (which: "x" | "y", value: string, label: string) => (
    <HeaderField
      initial={label}
      label={`Rename ${label}`}
      onCommit={(name) => onRenameValue(which, value, name)}
      onDone={stopHeaderEdit}
    />
  );
  const renameOnDoubleClick = (which: "x" | "y", lane: Lane) =>
    lane.kind === undefined && lane.label !== null
      ? () => setHeaderEdit({ which, mode: "rename", key: lane.key })
      : undefined;
  const laneHeader = (which: "x" | "y", lane: Lane) => {
    if (lane.kind === "parent") {
      return (
        <>
          <span className="lane-note">
            {which === "x" ? xParentNone : yParentNone}
          </span>
          {addControl(which, lane.key)}
        </>
      );
    }
    if (lane.kind === "collapsed") {
      const n = lane.inner ?? 0;
      return (
        <button
          type="button"
          className="lane-unfold"
          onClick={() => onBandToggle(which, lane.key)}
          title={`Unfold ${lane.label ?? ""}: show each of its lanes`}
        >
          {`${n} ${levelNames[which]}${n === 1 ? "" : "s"}`} ▸
        </button>
      );
    }
    if (lane.label !== null && editingHeader(which, "rename", lane.key))
      return renameField(which, lane.key, lane.label);
    return lane.label;
  };
  /** A band's header: its name and a ▾ that folds it, or a ▸ that unfolds it. */
  const bandHeader = (which: "x" | "y", band: Band) =>
    editingHeader(which, "rename", band.key) ? (
      renameField(which, band.key, band.label)
    ) : (
      <button
        type="button"
        className="band-head band-toggle"
        aria-expanded={!band.collapsed}
        aria-label={`${band.collapsed ? "Unfold" : "Fold"} ${band.label}`}
        title={
          band.collapsed
            ? `Show each of ${band.label}'s lanes`
            : `Fold ${band.label} into one lane`
        }
        onClick={() => onBandToggle(which, band.key)}
        // A double-click's two clicks fold and unfold again, so it only renames.
        onDoubleClick={() =>
          setHeaderEdit({ which, mode: "rename", key: band.key })
        }
      >
        <span aria-hidden="true">{band.collapsed ? "▸" : "▾"}</span>{" "}
        <span>{band.label}</span>
      </button>
    );
  /** ⇧-click anywhere on a header selects its lanes' cards, before the click can fold or unfold. */
  const selectOnShift =
    (which: "x" | "y", start: number, end: number) =>
    (e: MouseEvent<HTMLElement>) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      onSelectLanes(which, start, end);
    };
  /**
   * Why no card is in a cell. On a blank plan's System axis there's nothing to sort into yet, so the note points at
   * where the first area is made (Q55).
   */
  const emptyAxisNote = () => {
    const which = noLanes(layout.columns, layout.gaps.x) ? "x" : "y";
    const property = plan.properties[view[which].property];
    const level = newLevelName(which, null);
    if (
      property?.kind === "select" &&
      Object.keys(property.values).length === 0 &&
      level !== null
    ) {
      const where = which === "y" ? "at the bottom left" : "at the top right";
      return (
        <>
          No {level}s yet. Click <b>+ Add {level}</b> {where} to make one, then
          drag cards into it.
        </>
      );
    }
    return (
      <>
        No cards have a {(which === "x" ? xLabel : yLabel).toLowerCase()} value
        yet. They're all in the holding lanes.
      </>
    );
  };
  const boardRef = useRef<HTMLDivElement>(null);
  // A new card's field stays in view as the cards typed before it arrive and push it down (Q51).
  const typingNew = editing?.kind === "new";
  useLayoutEffect(() => {
    if (typingNew)
      boardRef.current
        ?.querySelector(".card.draft")
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [typingNew, layout]);
  const renaming = renameCopy(layout, editing);
  const isDraftSpot = (row: string | null, column: string | null) =>
    editing?.kind === "new" &&
    editing.spot.x === column &&
    editing.spot.y === row;
  const draft = (
    <DraftCard
      key={`draft-${editing?.kind === "new" ? (editing.chain ?? 0) : 0}`}
      onCommit={onCommitEdit}
      onCancel={onCancelEdit}
    />
  );
  // A lane collapses only while there's a board beside it; with no rows or columns, the lane is the board (Q51).
  const rightRail = holdingCollapsed.right && layout.columns.length > 0;
  const bottomRail = holdingCollapsed.bottom && layout.rows.length > 0;
  const counts = useMemo(() => childCounts(plan), [plan]);
  const areas = useMemo(() => cardAreas(plan), [plan]);
  const palette = useMemo(() => areaPalette(plan), [plan]);
  /**
   * An area's color on its own header, where System is the axis: its band, or its lane when the axis shows
   * areas without bands. A folded area's lane and its "No component" lane sit under the band, which has it.
   */
  const headerArea = (which: "x" | "y", key: string, underBand = false) =>
    underBand || view[which].property !== SYSTEM ? undefined : palette.get(key);
  const weights = useMemo(
    () =>
      new Map(
        Object.values(plan.items).map((item) => [
          item.id,
          levelWeight(plan, item),
        ]),
      ),
    [plan],
  );
  const attributes = useMemo(() => {
    const properties = badgeProperties(plan);
    const out = new Map<ItemId, CardAttribute[]>();
    for (const item of Object.values(plan.items))
      out.set(item.id, cardAttributes(plan, item, view, properties));
    return out;
  }, [plan, view]);
  const collapseKey = keyNames().collapse;
  const renderCard = (
    ref: CardRef,
    chip = false,
    frame?: CardRef,
    onCollapse?: () => void,
  ) => {
    const item = plan.items[ref.itemId]!;
    const foldedMatches = found?.inside.get(ref.itemId);
    return (
      <Card
        key={`${frame ? `${frame.itemId}>` : ""}${ref.itemId}|${ref.x}|${ref.y}|${ref.via ?? ""}`}
        item={item}
        compact={chip}
        childCount={counts.get(ref.itemId) ?? 0}
        areaIndex={areas.get(ref.itemId)?.index ?? null}
        areaTitle={areas.get(ref.itemId)?.title}
        levelWeight={weights.get(ref.itemId) ?? 0}
        attributes={attributes.get(ref.itemId) ?? []}
        selected={selected.has(ref.itemId)}
        lifted={lifted !== null && sameCopy(lifted, ref)}
        nestTarget={isIntoTarget(target) && target.into === ref.itemId}
        copyFocus={!ref.via && copyFocus.includes(ref.itemId)}
        justMoved={justMoved === ref.itemId}
        editing={renaming !== null && sameCopy(renaming, ref)}
        viaChildren={ref.via === "children"}
        mismatches={mismatches.onCard.get(ref.itemId) ?? NONE}
        mismatchesInside={mismatches.inside.get(ref.itemId) ?? NONE}
        dimmed={
          found !== null &&
          !found.shown.has(ref.itemId) &&
          foldedMatches === undefined
        }
        foundInside={foldedMatches?.map((id) => plan.items[id]?.title ?? "")}
        onMenu={ref.via ? undefined : (x, y) => onCardMenu(ref.itemId, x, y)}
        // A faded copy isn't the group's own value, so it can be clicked but not dragged (Q16).
        onPointerDown={(e) =>
          onCardPointerDown(e, ref, item.title, ref.via !== "children")
        }
        // A card in a frame isn't on the board's level: double-click expands its group, like the frame's header.
        onDoubleClick={() => onCardDoubleClick(frame ?? ref)}
        onExpand={
          (counts.get(ref.itemId) ?? 0) > 0
            ? () => onCardExpand(ref)
            : undefined
        }
        onCollapse={onCollapse}
        onSelectMatching={onSelectMatching}
        onRename={onCommitEdit}
        onCancelEdit={onCancelEdit}
      />
    );
  };

  /** A card, or a group's frame around its cards. */
  const renderRef = (ref: CardRef, chip = false): ReactNode =>
    ref.open || ref.via ? renderFrame(ref, chip) : renderCard(ref, chip);

  /**
   * A group's frame (Q57). Collapsed, in a cell only its children reach
   * (Q33): its faded copy as a header, framing the real cards that put it
   * there, which can be dragged. Expanded: its cards here under a header,
   * which is the group's own card where it's placed itself and its title
   * elsewhere, with ▾ to collapse it.
   */
  const renderFrame = (ref: CardRef, chip = false): ReactNode => {
    if (!ref.open) {
      return (
        <div
          key={`frame|${ref.itemId}|${ref.x}|${ref.y}`}
          className="frame frame-via"
          data-frame={ref.itemId}
        >
          {renderCard(ref, chip)}
          {(ref.inner ?? []).map((inner) => renderCard(inner, chip, ref))}
        </div>
      );
    }
    const titles = (ref.trail ?? [ref.itemId]).map(
      (id) => plan.items[id]?.title ?? "",
    );
    const name = titles.join(" › ");
    return (
      <div
        key={`open|${ref.itemId}|${ref.x}|${ref.y}`}
        className="frame frame-open"
        data-frame={ref.itemId}
      >
        <div className="frame-head">
          {ref.own ? (
            <>
              {titles.length > 1 && (
                <span className="frame-trail">
                  {titles.slice(0, -1).join(" › ")} ›
                </span>
              )}
              {renderCard(
                { itemId: ref.itemId, x: ref.x, y: ref.y },
                chip,
                undefined,
                () => onCollapseGroup(ref.itemId),
              )}
            </>
          ) : (
            <>
              <span className="frame-title" title={name}>
                {name}
              </span>
              <button
                type="button"
                className="frame-collapse"
                aria-label={`Collapse ${name}`}
                title={`Collapse ${name} (${collapseKey})`}
                onClick={() => onCollapseGroup(ref.itemId)}
              >
                ▾
              </button>
            </>
          )}
        </div>
        {(ref.inner ?? []).map((inner) => renderRef(inner, chip))}
      </div>
    );
  };

  const columnTracks = tracks(layout.columns, layout.gaps.x);
  const rowTracks = tracks(layout.rows, layout.gaps.y);
  const noLanes = (lanes: Lane[], gaps: string[] | null) =>
    lanes.length === 0 && gaps === null;
  const empty =
    noLanes(layout.columns, layout.gaps.x) ||
    noLanes(layout.rows, layout.gaps.y);
  // A lone gap (no sequence columns yet) is full width, so there's somewhere obvious to drop.
  const gapSize = (lanes: Lane[]) =>
    lanes.length === 0 ? "minmax(var(--column-min), 1fr)" : "var(--gap-size)";
  // Band tracks for nested axes (ADR 0012): a column per level of row bands, a row per level of column bands.
  const depths = (bands: Band[]) =>
    bands.length === 0 ? 0 : Math.max(...bands.map((b) => b.depth)) + 1;
  const yDepth = depths(layout.bands.y);
  const xDepth = depths(layout.bands.x);
  const gridTemplateColumns = [
    ...Array.from({ length: yDepth }, () => "var(--band-width)"),
    "var(--row-header)",
    ...(columnTracks.length === 0
      ? ["minmax(var(--column-min), 1fr)"]
      : columnTracks.map((t) =>
          // A gap being typed into opens up to a column's width, so the new card has room.
          t.kind === "lane" ||
          (editing?.kind === "new" && editing.spot.x === t.key)
            ? "minmax(var(--column-min), 1fr)"
            : gapSize(layout.columns),
        )),
    "var(--holding-width)",
  ].join(" ");

  const isTarget = (row: string | null, column: string | null) =>
    isCellTarget(target) && target.x === column && target.y === row;
  // Sequence lanes stay unnumbered even for screen readers (requirement 6).
  const trackName = (t: Track, axis: string) =>
    t.kind === "gap"
      ? `new ${axis.toLowerCase()} position`
      : (t.lane.label ?? `${axis} column`);

  const cell = (row: Track, column: Track): ReactNode => {
    const rowKey = trackKey(row);
    const columnKey = trackKey(column);
    const isGap = row.kind === "gap" || column.kind === "gap";
    // With no sequence lanes yet, the single gap is a full-size cell, so there's somewhere obvious to drop.
    const lone =
      isGap &&
      (row.kind === "gap"
        ? layout.rows.length === 0
        : layout.columns.length === 0);
    const parentLane = (t: Track, lanes: Lane[]) =>
      t.kind === "lane" && lanes[t.index]!.kind === "parent";
    const classes = [
      "cell",
      (parentLane(row, layout.rows) || parentLane(column, layout.columns)) &&
        "parent-lane",
      isGap && !lone && "gap",
      isGap && !lone && row.kind === "gap" && "gap-row",
      lone && "lone-gap",
      isTarget(rowKey, columnKey) && "drop-target",
      isDraftSpot(rowKey, columnKey) && "drafting",
    ];
    return (
      <div
        key={`${rowKey}|${columnKey}`}
        className={classes.filter(Boolean).join(" ")}
        data-drop="cell"
        data-row={rowKey}
        data-column={columnKey}
        aria-label={`${trackName(row, yLabel)}, ${trackName(column, xLabel)}`}
      >
        {row.kind === "lane" &&
          column.kind === "lane" &&
          layout.cells[row.index]![column.index]!.map((ref) => renderRef(ref))}
        {isDraftSpot(rowKey, columnKey) && draft}
        {lone && (
          <span className="lone-hint">
            Drop a card here to start the sequence
          </span>
        )}
      </div>
    );
  };

  /**
   * A holding lane: at the end of a row (cards with that row but no column),
   * under a column (that column but no row), or the corner (neither).
   * The missing axis has no data attribute, which reads as null.
   */
  const holdingCell = (row: Track | null, column: Track | null): ReactNode => {
    const rowKey = row && trackKey(row);
    const columnKey = column && trackKey(column);
    const cards =
      row?.kind === "lane"
        ? layout.holding.rows[row.index]!
        : column?.kind === "lane"
          ? layout.holding.columns[column.index]!
          : row === null && column === null
            ? layout.holding.corner
            : [];
    const gapRow = row?.kind === "gap" && layout.rows.length > 0;
    const gapColumn = column?.kind === "gap" && layout.columns.length > 0;
    // A collapsed lane is a rail: its count, and still a drop target, with no cards to box-select or drag.
    const railed =
      (row === null ? bottomRail : false) ||
      (column === null ? rightRail : false);
    const classes = [
      "cell",
      "holding-cell",
      row === null ? "holding-bottom" : "holding-right",
      row === null && column === null && "holding-corner",
      gapRow && "gap gap-row",
      gapColumn && "gap",
      isTarget(rowKey, columnKey) && "drop-target",
    ];
    const rowName = row ? trackName(row, yLabel) : yNone;
    const columnName = column ? trackName(column, xLabel) : xNone;
    return (
      <div
        key={`holding|${rowKey}|${columnKey}`}
        className={classes.filter(Boolean).join(" ")}
        data-drop="cell"
        data-row={rowKey ?? undefined}
        data-column={columnKey ?? undefined}
        aria-label={`${rowName}, ${columnName}`}
      >
        {!gapRow && !gapColumn && railed && (
          <div className="holding-cards rail">
            {cards.length > 0 && (
              <span className="holding-count">{unwrap(cards).length}</span>
            )}
          </div>
        )}
        {!gapRow && !gapColumn && !railed && (
          // The lane fills its grid row; this inner box caps the height and scrolls.
          <div className="holding-cards">
            {cards.length > 0 && (
              <span className="holding-count">{unwrap(cards).length}</span>
            )}
            {cards.map((ref) => renderRef(ref, compact))}
            {isDraftSpot(rowKey, columnKey) && draft}
          </div>
        )}
      </div>
    );
  };

  const holdingHead = rightRail ? (
    <span className="holding-rail-head">
      <button
        type="button"
        className="holding-collapse"
        aria-label={`Show the ${xNone} lane`}
        title={`Show the ${xNone} lane`}
        onClick={() =>
          onHoldingCollapsedChange({ ...holdingCollapsed, right: false })
        }
      >
        «
      </button>
    </span>
  ) : (
    <>
      <span className="holding-name">
        <span>{xNone}</span>
        {addControl("x", null)}
      </span>
      <span
        className="holding-toggle"
        role="group"
        aria-label="Show holding cards as"
      >
        <button
          type="button"
          aria-pressed={!compact}
          onClick={() => onCompactChange(false)}
        >
          Cards
        </button>
        <button
          type="button"
          aria-pressed={compact}
          onClick={() => onCompactChange(true)}
        >
          Chips
        </button>
      </span>
      {layout.columns.length > 0 && (
        <button
          type="button"
          className="holding-collapse"
          aria-label={`Collapse the ${xNone} lane`}
          title={`Collapse the ${xNone} lane to a thin rail. It still takes drops.`}
          onClick={() =>
            onHoldingCollapsedChange({ ...holdingCollapsed, right: true })
          }
        >
          »
        </button>
      )}
    </>
  );

  /** Row bands that start at this row, one per band level; each spans its rows (ADR 0012). */
  const rowBandCells = (index: number): ReactNode[] =>
    Array.from({ length: yDepth }, (_, depth) => {
      const band = layout.bands.y.find(
        (b) => b.depth === depth && b.start <= index && index < b.end,
      );
      const left = { left: `calc(var(--band-width) * ${depth})` };
      if (!band)
        return (
          <div
            key={`yb-${depth}-${index}`}
            className="band band-y empty"
            style={left}
          />
        );
      if (band.start !== index) return null;
      return (
        <div
          key={`yb-${band.key}`}
          className={band.collapsed ? "band band-y collapsed" : "band band-y"}
          data-band={band.key}
          data-area={headerArea("y", band.key)}
          style={{ ...left, gridRow: `span ${band.end - band.start}` }}
          onClickCapture={selectOnShift("y", band.start, band.end)}
        >
          {bandHeader("y", band)}
        </div>
      );
    }).filter((cell) => cell !== null);

  // Box select (Q48): a drag that starts on empty space in a cell or holding lane draws a box, and the cards it
  // touches are selected, added to the selection with ⇧. A press that doesn't move still just clears the selection,
  // and two of them still make a card.
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const backgroundPress = (e: PointerEvent<HTMLDivElement>) => {
    const el = e.target as Element;
    if (el.closest(".card, button, textarea, input")) return;
    if (!e.shiftKey) onBackgroundPointerDown();
    if (e.button !== 0 || !el.closest(".cell")) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const base = e.shiftKey ? [...selected] : [];
    let boxing = false;
    const move = (ev: globalThis.PointerEvent) => {
      if (
        !boxing &&
        Math.hypot(ev.clientX - x0, ev.clientY - y0) < BOX_THRESHOLD_PX
      )
        return;
      boxing = true;
      const r = {
        left: Math.min(x0, ev.clientX),
        top: Math.min(y0, ev.clientY),
        right: Math.max(x0, ev.clientX),
        bottom: Math.max(y0, ev.clientY),
      };
      setBox({
        left: r.left,
        top: r.top,
        width: r.right - r.left,
        height: r.bottom - r.top,
      });
      const ids = new Set(base);
      for (const card of boardRef.current?.querySelectorAll<HTMLElement>(
        ".card[data-item]:not(.via-children)",
      ) ?? []) {
        const c = card.getBoundingClientRect();
        if (
          c.right > r.left &&
          c.left < r.right &&
          c.bottom > r.top &&
          c.top < r.bottom
        )
          ids.add(card.dataset.item!);
      }
      onBoxSelect([...ids]);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setBox(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  // Double-clicking empty space makes a card there. In a gap between
  // sequence columns, that's a card in a new column of its own.
  const spotDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const el = e.target as Element;
    if (el.closest(".card, button, textarea")) return;
    const spot = el.closest<HTMLElement>('[data-drop="cell"]');
    if (!spot) return;
    onSpotDoubleClick({
      x: spot.dataset.column ?? null,
      y: spot.dataset.row ?? null,
    });
  };

  return (
    <div className="board-wrap">
      <div
        className={pivoting ? "board-scroll pivoting" : "board-scroll"}
        ref={scrollRef}
        onPointerDown={backgroundPress}
        onDoubleClick={spotDoubleClick}
        onPointerOver={(e) =>
          onHover(
            (e.target as Element).closest<HTMLElement>(".card")?.dataset.item ??
              null,
          )
        }
        onPointerLeave={() => onHover(null)}
        onContextMenu={(e) => {
          // Right-click a card for its actions (Q54); anywhere else, the browser's own menu.
          const el = (e.target as Element).closest<HTMLElement>(
            ".card[data-item]:not(.via-children)",
          );
          if (!el || (e.target as Element).closest("input, textarea")) return;
          e.preventDefault();
          onCardMenu(el.dataset.item!, e.clientX, e.clientY);
        }}
      >
        {box && (
          <div className="select-box" style={box} data-testid="select-box" />
        )}
        <div
          className={[
            "board",
            layout.rows.length === 0 && "no-rows",
            layout.columns.length === 0 && "no-columns",
            rightRail && "right-rail",
            bottomRail && "bottom-rail",
            box && "boxing",
          ]
            .filter(Boolean)
            .join(" ")}
          ref={boardRef}
          style={{ gridTemplateColumns }}
          data-testid="board"
        >
          {(lines.length > 0 || copyFocus.length > 0) && (
            <DependencyLines
              lines={lines}
              copies={copyFocus}
              board={boardRef}
              scroller={scrollRef}
              layoutKey={layout}
              onLineClick={onLineClick}
            />
          )}
          <div
            className="corner"
            style={{
              gridRow: `span ${xDepth + 1}`,
              gridColumn: `span ${yDepth + 1}`,
            }}
          >
            <span className="axis-name y">{yLabel} ↓</span>
            <span className="axis-name x">{xLabel} →</span>
          </div>
          {Array.from({ length: xDepth }, (_, depth) => [
            ...bandCells(layout.bands.x, depth, layout.columns.length).map(
              (b, i) =>
                b === null ? (
                  <div
                    key={`xb-${depth}-${i}`}
                    className="band band-x empty"
                    style={{ top: `calc(var(--band-height) * ${depth})` }}
                  />
                ) : (
                  <div
                    key={`xb-${b.key}`}
                    className={
                      b.collapsed ? "band band-x collapsed" : "band band-x"
                    }
                    data-band={b.key}
                    data-area={headerArea("x", b.key)}
                    style={{
                      gridColumn: `span ${b.end - b.start}`,
                      top: `calc(var(--band-height) * ${depth})`,
                    }}
                    onClickCapture={selectOnShift("x", b.start, b.end)}
                  >
                    {bandHeader("x", b)}
                  </div>
                ),
            ),
            depth === 0 && (
              <div
                key="holding-head"
                className="holding-head"
                style={{ gridRow: `span ${xDepth + 1}` }}
              >
                {holdingHead}
              </div>
            ),
          ])}
          {columnTracks.map((t) =>
            t.kind === "lane" ? (
              <div
                key={t.lane.key}
                className={
                  t.lane.kind
                    ? `column-header lane-${t.lane.kind}`
                    : "column-header"
                }
                data-column={t.lane.key}
                data-area={headerArea(
                  "x",
                  t.lane.key,
                  t.lane.kind !== undefined,
                )}
                style={
                  xDepth > 0
                    ? { top: `calc(var(--band-height) * ${xDepth})` }
                    : undefined
                }
                onClickCapture={selectOnShift("x", t.index, t.index + 1)}
                onDoubleClick={renameOnDoubleClick("x", t.lane)}
              >
                {laneHeader("x", t.lane)}
              </div>
            ) : (
              <div key={t.key} className="column-header gap" />
            ),
          )}
          {xDepth === 0 && <div className="holding-head">{holdingHead}</div>}
          {empty && (
            <div className="empty-note">
              {Object.keys(plan.items).length === 0 ? (
                <>
                  No cards yet. Double-click anywhere to add one, and press
                  Enter to add the next.
                </>
              ) : (
                emptyAxisNote()
              )}
            </div>
          )}
          {/* Rows render even with no columns, so their holding lanes (and cards) still show. */}
          {rowTracks.map((row) => [
            ...(row.kind === "lane" ? rowBandCells(row.index) : []),
            row.kind === "lane" ? (
              <div
                key={`h-${row.lane.key}`}
                className={
                  row.lane.kind
                    ? `row-header lane-${row.lane.kind}`
                    : "row-header"
                }
                data-row={row.lane.key}
                data-area={headerArea(
                  "y",
                  row.lane.key,
                  row.lane.kind !== undefined,
                )}
                style={
                  yDepth > 0
                    ? { left: `calc(var(--band-width) * ${yDepth})` }
                    : undefined
                }
                onClickCapture={selectOnShift("y", row.index, row.index + 1)}
                onDoubleClick={renameOnDoubleClick("y", row.lane)}
              >
                {laneHeader("y", row.lane)}
              </div>
            ) : (
              <div
                key={`h-${row.key}`}
                className={
                  layout.rows.length === 0 ? "row-header" : "row-header gap-row"
                }
              />
            ),
            ...(columnTracks.length === 0
              ? [<div key={`c-${trackKey(row)}`} className="cell" />]
              : columnTracks.map((column) => cell(row, column))),
            holdingCell(row, null),
          ])}
          <div
            className="holding-row-header"
            style={
              yDepth > 0 ? { gridColumn: `span ${yDepth + 1}` } : undefined
            }
          >
            <span>{yNone}</span>
            {layout.rows.length > 0 && (
              <button
                type="button"
                className="holding-collapse holding-collapse-bottom"
                aria-label={
                  bottomRail
                    ? `Show the ${yNone} lane`
                    : `Collapse the ${yNone} lane`
                }
                title={
                  bottomRail
                    ? `Show the ${yNone} lane`
                    : `Collapse the ${yNone} lane to a thin strip. It still takes drops.`
                }
                onClick={() =>
                  onHoldingCollapsedChange({
                    ...holdingCollapsed,
                    bottom: !bottomRail,
                  })
                }
              >
                {bottomRail ? "▴" : "▾"}
              </button>
            )}
            {!bottomRail && addControl("y", null)}
          </div>
          {columnTracks.length === 0 ? (
            <div className="cell holding-bottom" />
          ) : (
            columnTracks.map((column) => holdingCell(null, column))
          )}
          {holdingCell(null, null)}
        </div>
      </div>
    </div>
  );
});
