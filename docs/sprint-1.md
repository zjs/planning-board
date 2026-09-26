# Sprint 1

## Goal

Test the hierarchy half of the model. Can people decompose an item into parts and regroup parts under a new item, directly on the board? Does zooming into a group, or into one area or quarter, keep a 150-item plan readable without losing their place?

Sprint 0 showed that dragging to write values, then pivoting, works. This sprint makes the plan's structure something you can manipulate. Dependencies, contention, and real-data import come in sprint 2.

Scope: single user, browser only, no server.

## Deliverables

### 1. Selection and cards (requirement 10, the minimal part)

- [ ] Click selects a card, and every copy of it highlights. ⇧-click adds to the selection. Clicking empty space or pressing Esc clears it. The selection belongs to the viewer and is never saved in the plan.
- [ ] Double-clicking empty space in a cell or holding lane creates a card with that cell's values, ready for a title.
- [ ] Double-clicking a card, or pressing Enter, renames it.
- [ ] Delete or Backspace deletes the selected cards. Deleting a group deletes its contents, and one undo restores the whole subtree, including nested groups, values, and dependencies (Q17). A "Deleted 5 cards · Undo" notice appears after the delete.

### 2. Groups (requirements 11, 13, 14)

- [ ] ⌘G / Ctrl+G groups the selection under a new card, which is named on the spot. The new group takes the values all its children share, so it lands where they were.
- [ ] If the selection contains exactly one existing group, ⌘G moves the other cards into it instead.
- [ ] ⇧⌘G / Ctrl+Shift+G ungroups: the group card is removed, and its children move up one level, keeping their own values.
- [ ] Grouping never creates a cycle. A single-user check is enough for now (ADR 0004).

### 3. Zoom (requirements 1, 7, 12)

- [ ] Double-clicking a group zooms in to show only its children, with the same axes. A breadcrumb shows the path, and the header shows the group's own values (Q19). Esc or the breadcrumb zooms out.
- [ ] Cards created inside a zoomed group become its children. Dragging a card onto a breadcrumb segment moves it out to that level.
- [ ] The axis picker offers every hierarchy level: Area or Component, and Quarter or Release.
- [ ] Clicking a lane or column header zooms that axis one level down within that value (Identity → its components; Q2 → its releases). A removable chip shows the zoom. Cards outside the zoomed value are hidden (Q18).
- [ ] Refining replaces the coarser value. Dropping an area-only card from "No component" onto SSO turns Identity into Identity/SSO, rather than keeping both.

### 4. Roll-up and mismatches (requirements 13, 18)

- [ ] A collapsed group shows solid copies in its own lanes and faded "via children" copies in lanes only its children touch (Q16). Faded copies can't be dragged. Double-clicking one zooms into the group.
- [ ] A child dated outside its group, sized larger, or in a different area gets a mismatch marker. Values are never changed automatically.
- [ ] A collapsed group card shows how many mismatches it contains, and hovering lists them.

### 5. Tester-ready

- [ ] The legend covers selection, grouping, and zoom.
- [ ] The seed plan has a few deliberate group mismatches, and groups nested 2–3 deep.
- [ ] A session script and demo note (`docs/demos/sprint-1.md`), checked in Chrome, Firefox, and Safari.

## Deferred (don't build)

Dependency lines, drawing, and order highlights (their display is settled, see Q14); contention; the conflicts panel and reviewed conflicts; scenarios; custom properties; editing property values; CSV import; plan files; filters; saved views; card descriptions; the relay or any server.

## Exit criteria

Sprint 1 is done when the PM can open the latest `main` build, load the sample plan, and do all of the following without help from the legend beyond a first read:

1. Select three cards, group them, and name the group.
2. Zoom into the group, add a child, rename one, and move one out through the breadcrumb.
3. Ungroup it.
4. Zoom Identity down to its components, and tag an area-only card with a component.
5. Switch Time to releases.
6. See a group's faded copies in the lanes its children touch.
7. Spot a mismatch marker on a collapsed group, and zoom in to find the child that causes it.
8. Undo every step, and reload without losing anything.

Then the PM runs a 20-minute session with one or two PMs or EMs, focused on decomposing an epic and on finding their way around zoom levels. Feedback goes into `docs/questions.md` and drives sprint 2 planning.
