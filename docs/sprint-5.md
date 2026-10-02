# Sprint 5

## Goal

Shore up what we have before adding anything new. That means:

- one clear way to look deeper: expand and fold;
- whiteboard gestures for moving cards between groups;
- confidence that no change breaks a saved plan.

It should also give the sprint 3 and 4 tester sessions a calmer build.

Sprint 4 left five overlapping ways to see detail: zooming into a group, zooming into a lane, zooming into several groups, expanding in place, and folding bands. In PM testing on 2026-10-02, expanding and folding did what zooming did, kept the rest of the board and its links in view, and were easier to find. This sprint removes zoom (Q42, Q43), gives adding and moving cards their own gestures, and makes a card's copies easy to follow (Q45). New functionality waits for sprint 6: "related to" links, and component contention with the conflicts panel.

Scope: single user, browser only, no server.

## Deliverables

### 1. Compatibility gate (backlog: Housekeeping)

- [x] Fixtures saved by every past version:
  - plan files written by each earlier build's own writer;
  - the hand-written sample files from sprints 0 and 1;
  - boards as stored in the browser by each earlier build.
- [x] Each fixture opens with every card, value, group and link intact. Saving it and opening it again gives the same plan.
- [x] The tests run in `npm run check`, so a compatibility break fails CI. Every future format change adds a fixture (ADR 0005).

### 2. Expand, fold, nest, and select (Q42, Q47)

- [x] **Expand and fold are separate actions.** **E** expands the selected groups at any depth, so an epic inside an expanded initiative expands too. **⇧E** folds the groups of the selected cards. A selected group's child count ("4 ›") expands it, and double-clicking a frame's group expands it.
- [x] **Hold to nest.**
  - Drag a card over another card and hold for about half a second. The target highlights, "Put inside *Passwordless login*", and dropping makes the dragged card its child. A quick drop still goes into the cell.
  - Nesting changes only the card's group, never its values, and a notice offers Undo.
  - It works on a plain card too, which gets its first child.
  - A drop that would put a card inside itself isn't allowed.
- [x] **Move out.** While a card that's in a group is dragged, a "Move out of *EU data residency*" strip appears at the top of the board. Dropping there moves the card up one level.
- [x] **Inspector fallbacks.** A **Group** field, which you can type into to search, moves the selected cards into a group or out to the top level. **Add a card inside** makes a child of the selected card, expands it, and opens the new card for naming.
- [x] **Select every card that matches.** ⇧-click a badge on any card, such as "Initiative", to select every card on the board with that value, in any pivot. ⇧-click a row or column header to select its lane. **⌘A** selects every card on the board.

### 3. Zoom goes; one axis choice per property (Q42, Q43)

- [ ] **Removed:**
  - zooming into a group, and into several groups at once;
  - the zoom bar and its breadcrumb;
  - lane zoom;
  - the separate "(area)" and "(component)" axis choices.
- [ ] A hierarchical property is one axis choice ("System", "Time"). It shows its deepest level, with each parent as a band, folded by default, so a fresh view looks like today's area or quarter view.
- [ ] **Fold all** and **Unfold all** sit beside each axis picker. Clicking a folded lane's header ("4 components ▸") unfolds it.
- [ ] Views saved in a browser carry over: "System (component)" opens as System with every band unfolded.
- [ ] What zoom used to provide has a new home:
  - "Show it on the board" in the inspector expands the groups around a card instead of zooming.
  - A pending link can be finished on any card.
  - A group's own values show in the inspector (Q19).

### 4. A card's copies (Q45)

- [ ] Hovering or selecting a card with several copies joins the copies with a dashed line, with no arrow and styled unlike a dependency. Every copy is outlined, and the links from every copy show.

### 5. Tester-ready

- [ ] The legend covers expand and fold, nesting, moving out, selecting matches, and copies.
- [ ] A demo note (`docs/demos/sprint-5.md`) and a session script, run together with the sprint 3 and 4 sessions.

## Deferred (don't build)

- "Related to" links (Q44).
- Order within a cell (Q46), and dragging several cards (Q48).
- Component contention and concurrency limits, and the conflicts panel, reviewed conflicts and per-type hiding (Q40, Q41).
- Scenarios, filters, saved views, and the relay or any server.

## Exit criteria

Sprint 5 is done when the PM can open the latest `main` build and do all of the following:

1. Open a plan file saved by an earlier build, and save it again, with nothing lost. CI fails if any past version's file doesn't open.
2. Expand an initiative, then one of its epics: both stay expanded. ⇧E on a story folds only its epic.
3. In Sequence × System, ⇧-click an "Initiative" badge, and every initiative is selected. Press E, and they all expand.
4. Hold a dragged card over an epic: it highlights, and dropping nests the card without changing its values. Undo puts it back. A quick drop still lands in the cell.
5. Drag a child, and "Move out of …" appears. Dropping there moves the card up a level.
6. In the inspector, move a card into another group with the Group field. Use "Add a card inside" to give a plain card its first child.
7. Find no zoom anywhere. Rows → System shows areas folded. Unfold all, Fold all, and click "4 components" to unfold one area.
8. Hover a card with copies: dashed lines join them, and every copy is outlined.
9. Reload without losing anything: the plan, folded and unfolded bands, and expanded groups.

Then the PM runs the sprint 3, 4 and 5 sessions together, on a plan with real structure and dependencies. Feedback goes into `docs/backlog.md`.
