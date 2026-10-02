# 0007: Drag-and-drop approach

Status: Accepted (sprint 0, slice 2). Amended in sprint 1 (click and double-click), sprint 3, slice 1 (double-click's single job), and sprint 5, slice 2 (hold to nest and the move-out strip).

## Context

Dragging is the interaction sprint 0 exists to test. A drop writes two values at once. A card with several values appears in several lanes, and dragging one copy moves only that lane. A modifier key at drop time adds a lane instead. The holding area removes a value. The drag should feel like moving a sticky note: no jumps, clear targets, and the board scrolls when you hold a card at its edge.

## Decision

**Custom pointer-event handling** in one hook (`src/ui/useCardDrag.ts`), with the semantics of a drop in a pure domain function (`planDrop` in `src/domain/move.ts`).

- A drag starts after the pointer moves 4px, so clicks stay clicks. A press released before that is reported as a click, which selects the card (⇧/⌘/Ctrl-click toggles it). Double-clicking a card renames it, and double-clicking empty space in a cell creates a card there; neither involves the drag hook. _Amended in sprint 1, slice 1._ The ghost card keeps the exact grab offset, and the source copy fades.
- Drop targets are ordinary elements marked `data-drop="cell"`, with a lane key per axis in `data-row` and `data-column`. The holding lanes on the board's edges are cells that leave out the axis they have no value on (questions.md Q10, Q11). The hook finds targets with `elementFromPoint`, so there's no registration and no measuring.
- ⌥ Option / Alt switches to "add a lane". The ghost shows a "+ add" badge, and the key is read at drop time, so pressing or releasing it mid-drag works.
- Holding the pointer near the board's edge for 200ms scrolls it. The dwell stops the board from jittering when you merely cross the edge. "The edge" is the inner edge of the pinned headers and holding lanes, so hovering a holding lane never scrolls the board under the pointer. _Amended in sprint 0, slice 5, when the side holding area became pinned lanes._
- Escape cancels. A drop that changes nothing records no undo step.
- **Double-click has one job on a card: rename it** (questions.md Q36, sprint 3). Until sprint 3 it also zoomed into groups, so a group couldn't be renamed by double-clicking. A group card's child count is now a button that opens the group, once the group is selected (so a click meant to select it never opens it); ⌘↓ still zooms into any selected card. A faded "via children" copy can't be renamed, so double-clicking it still zooms in. On empty space, double-click creates a card with that spot's values; in a gap between sequence columns, that's a card in a new column, and the gap widens while the title is typed.

## Alternatives

- **HTML5 drag-and-drop API.** Built in, but the drag image is a browser snapshot we can't style, drop-time modifier keys are inconsistent across browsers _(recalled)_, auto-scroll is the browser's own, and it doesn't work with touch.
- **dnd-kit.** A good React library, but our targets are simple and our rules unusual (per-copy moves, add mode, clear zones). A library would give us sensors and collision detection we'd then work around, in exchange for a dependency.

## Consequences

- About 200 lines we own. The rules live in `planDrop`, where they're unit-tested; the hook only turns pointer movement into targets.
- Not yet supported: keyboard drag (an accessibility gap to close before M1), and touch (pointer events would support it, but it's untested and would need long-press to tell a drag from a scroll).
- Alt-drag is taken by some Linux window managers. If testers on Linux can't add lanes, the Q1 fallback (a visible "add to lane" control) becomes necessary.

## Hold to nest and moving out (sprint 5)

Moving a card between groups is a drag too (questions.md Q42), so it needs no picker:

- **Hold to nest.** While dragging, the hook notes the card under the pointer (`.card[data-item]`). If the pointer rests over it for `NEST_DWELL_MS` (500 ms), the target becomes `{ into: card }`: the card gets a dashed outline, and the ghost says "Put inside …". Moving off the card, or the board scrolling under the pointer, drops back to the cell underneath. Dropping calls `moveToParent`, so values never change. `canNest` in `src/domain/tree.ts` decides which cards highlight: not the card itself, not its current group, and nothing inside it.
- **Moving out.** While a card that's in a group is dragged, a strip floats at the top of the board with the same `data-drop="parent"` target the breadcrumb uses, for the group's own parent. It floats over the headers rather than pushing the board down, so the card under the pointer doesn't move when the drag starts.
- A quick drop is still a cell drop. The dwell is long enough that dragging across cards on the way to a cell never nests by accident; the session will tell whether half a second is right.
