# 0008: View scope and zoom

Status: Accepted (sprint 1, slices 3 and 4). Amended in sprint 4, slice 4: several roots, expanding groups in place, and frames (Q33). Zoom superseded in sprint 5 by [0013](0013-expand-and-fold-replace-zoom.md): views have no root, and expanding and frames are what remains of this record.

## Context

Requirements 7 and 12: zoom into a group to see only its children, and zoom into a lane or column to see the next hierarchy level. Q20 adds that any card can be zoomed into, so an epic can be broken down by adding cards inside it. Zooming has to keep the layout rules (holding lanes, multi-lane copies, drops) exactly as they are, and it has to stay testable without a browser.

## Decision

- **Zoom is part of the view spec.** `ViewSpec` gains `root`: the card zoomed into, or null for the top level. `layoutView` lays out `childrenOf(plan, root)` with the same rules as the top level, so zoomed views pivot, drop, and hold cards like any other view. Slice 4 adds a per-axis `within` value for lane zoom in the same way.
- **Lane zoom is part of the axis spec (slice 4).** `AxisSpec` gains `within`: the value zoomed into, with `level` one below it. Only that value's children become lanes, and cards with no value inside it are hidden (Q18). Cards with exactly that value wait in the holding lane, and a drop there puts a card back to that value (Q22). The UI keeps one lane zoom per axis in the view choice, remembered like the axes, and drops it if the value no longer exists.
- **The zoom is viewer state, like the chosen axes.** The UI keeps the *path* of cards zoomed into and remembers it per browser. If a card on the path is deleted (or the delete is undone), the view falls back to the deepest card on the path that still exists, so a delete never strands you in a view of nothing.
- **Tree helpers are cycle-safe and agree with each other.** `childrenOf`, `ancestry` (the breadcrumb), `topLevelItems`, and `childCounts` all treat an orphan or a card on a parent cycle as top-level, so no card ever shows in two places or in none (ADR 0004).
- **Moving between levels is a command, not a drop rule.** Dragging a card onto a breadcrumb segment calls `moveToParent`, which changes only the parent pointer and keeps every value. It skips any move that would make a card its own ancestor.
- **Changing zoom clears the selection.** A selection you can't see could still be deleted with the Delete key. Zooming out selects the card you came out of, so you can see where you were.

## Alternatives

- **A separate "group view" component.** It would duplicate the layout rules, holding lanes, and drops, and drift from them.
- **Filtering the top-level layout to a subtree.** Children aren't top-level items, so this would change what "one card per item" means in every view.

## Consequences

- One code path for every level: the drag rules, holding lanes, and badges tested at the top level also hold inside a group.
- The scroll position is remembered per zoom level in memory only, so it resets on reload; the zoom level itself is remembered.
- Selection doesn't survive a zoom change. If testers want it to, the delete-invisible-cards risk needs another answer first.

## Amendment: children in context (sprint 4, slice 4, Q33)

- **Several roots.** `ViewSpec.roots` lists the cards zoomed into when there's more than one. The view shows all their children, and each child carries its group as `CardRef.parent`, which the board shows as a chip and a tone on its edge. The UI keeps the extra roots beside the zoom path and remembers them. They must be on the same level as the first one. Zooming anywhere clears them.
- **Expanding in place.** `ViewSpec.expanded` lists groups replaced by their children wherever they'd be shown, at any depth. Each child is marked with its group, like with several roots. It's viewer state, remembered per browser. E expands the selected groups, and E on an expanded child (or on the group) folds the group back.
- **Frames.** A faded "via children" copy now carries the cards that put the group in that cell (`CardRef.inner`). These are the cards whose own parent doesn't already put the group there, so a story is listed rather than each of its tasks. The board shows the faded copy as a frame's header, with those cards inside it. They're real cards, so they can be dragged, and a drag changes that card. Their `x` and `y` are their own lanes, or null where they only inherit the group's value, so a drag adds a value there instead of moving one.
- **One layout still.** All three are inputs to `layoutView`, so drops, holding lanes and badges work the same on expanded children as on any card. Dependency lines treat expanded children as on screen. Cards inside a frame aren't counted as on screen, so a link to one is still drawn to the group's copy (Q38).

## Amendment: frames for expanded groups (sprint 8, slice 1, Q57)

- **One look for a group.** An expanded group is no longer replaced by its children. `layoutView` places it like a card, then wraps each cell's and holding lane's cards in their expanded groups' frames: a `CardRef` with `open: true` and `inner`, beside the faded `via: 'children'` frames above. `CardRef.parent`, the chips and the tones are gone.
- **Placement is unchanged.** Every card keeps its own lanes, so a child with no quarter is framed in "No quarter". A frame goes where its first card would sort, so a cell keeps its order (Q46). Where the group itself is placed, `own` is set and its header is the group's own card, which can be dragged, renamed and opened. Elsewhere the header is a one-line title. Both collapse it: the title's ▾, or the count on the group's card, which reads "4 ▾" while it's expanded.
- **Nesting.** Frames nest three deep (`FRAME_DEPTH`). A group expanded below that gets its frame inside the third, beside the third group's own frame, with the groups from the third level down as `trail`, shown as a breadcrumb.
- **Code that wants every card** calls `unwrap`, which opens the frames up into their cards plus each group's own header (marked `open`). `allCopies` does so, so dependency lines, copies (Q45), selection and find see the same cards as before, plus expanded groups' own cards. Cards in a faded frame are still not counted as on screen (Q38).
- **⇧E** collapses a selected expanded group itself, or the expanded group a selected card is in, read from the plan rather than from the layout.

