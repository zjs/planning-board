# 0008: View scope and zoom

Status: Accepted (sprint 1, slices 3 and 4).

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
