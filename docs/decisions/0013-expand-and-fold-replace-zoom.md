# 0013: Expand and fold replace zoom

Status: Accepted (sprint 5, slice 3). Supersedes the zoom parts of [0008](0008-view-scope-and-zoom.md) (a view's root and roots, the zoom bar) and lane zoom in [0012](0012-nested-axes.md).

## Context

Sprint 4 left five ways to see detail: zooming into a group, zooming into several, zooming into a lane, expanding a group in place, and folding a band. In PM testing (2026-10-02), expanding and folding did everything zooming did, and kept the rest of the board and its links in view. Zoom also had jobs nothing else did: adding the first card inside a group, and moving a card out of one. Sprint 5's slice 2 gave those their own gestures. The PM decided to remove zoom (questions.md Q42) and to have one axis choice per property (Q43).

## Decision

**One layout, always from the top.** `ViewSpec` loses `root` and `roots`, and `AxisSpec` loses `within`. A view shows the top-level cards, with each expanded group replaced by its children at any depth (`viewItems` in `src/domain/view.ts`). Every card on the board therefore has a solid copy somewhere, in a cell or a holding lane.

**One axis choice per property.** `axisOptions` returns one option per property, at its deepest level, with an ID that's just the property's ID. A hierarchical property always shows its parents as bands (ADR 0012), so "System" covers what "System (area)" and "System (component)" did. An option carries two holding-lane names: `none` for the edge lane, which holds cards with no value at any level ("No area"), and `parentNone` for a parent's own lane ("No component").

**Folded by default.** Folding is viewer state per property, a `Folding` of `{ all: 'folded' | 'unfolded', except }` in `src/ui/axes.ts`. Absent means all folded, so a fresh view looks like the old top-level view. Fold all and Unfold all set `all` and clear the exceptions; a band's toggle, or a click on a folded lane's header, flips one band. A value added later follows `all`. `withFolding` turns this into the axis spec's `collapsed` list. Only parents with something below them can fold, since a childless parent looks the same either way.

**Order follows the lanes shown.** A time order is judged by the lanes on the board (`laneSpans` in `src/domain/dependencies.ts`), not by the axis level. A folded quarter is one bucket and an unfolded one a bucket per release, so a highlight never contradicts the board (Q12). A card dated only to an unfolded quarter spans all of its lanes, so it's only flagged when the order is certain.

**Carrying views over.** A browser last used by an earlier build may have saved `system:1`, sprint 1's `component`, a lane zoom, a group zoom, and collapsed bands. `loadViewChoice` maps each saved axis to its property and drops the lane zoom. `loadFoldings`, when no folding is saved yet, opens a property that was shown below its top level as unfolded, keeping the bands it had collapsed folded. The zoom path is no longer read.

**What zoom provided, and where it went:**

| Zoom did | Now |
| --- | --- |
| Show a group's children | Expand it in place (E, or its count) |
| Several groups' children | Expand several (Q33) |
| A lane's next level | Unfold its band |
| Add the first card inside a card (Q20) | Inspector: Add a card inside |
| Move a card out (breadcrumb drop) | The move-out strip while dragging |
| A group's own values (Q19) | The inspector |
| Show a linked card ("show it on the board") | Expand the groups around it |
| A pending link across levels | Works anywhere; nothing hides cards |

## Alternatives

- **Keep zoom as a secondary action.** Two ways to do one thing, and zoom's hidden board was what testers disliked.
- **Keep a choice per level, and add Fold all.** Two controls for one job; folding already moves between the levels.

## Consequences

- `ZoomBar.tsx`, `canZoomLane`, `zoomLane`, the zoom storage, and lane zoom in `layoutView`, `planDrop` and `valuesForNewItem` are gone. Q22's rule lives on in a parent's own lane on a nested axis.
- A new card is always made at the top level. "Add a card inside" makes children.
- A folded axis spends two header columns or rows: the band, then a lane header that says what's folded ("4 components ▸"). That's the price of one control; the session will show whether it reads well.
- Older end-to-end specs that zoomed now expand, fold, or unfold; the exit criteria of sprints 1–4 still run, step for step, with the replacement gestures.

## Amendment (sprint 7, Q54)

Groups **expand** and **collapse**; bands **fold** and **unfold**. ⇧E and its toolbar button were "Fold" until sprint 7. The PM chose to keep separate words for laying out the board (folding an area's components) and for showing more of the cards (expanding a group), with no word shared. Code that handles bands still says "fold"; the code for groups says "collapse".
