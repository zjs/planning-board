# Sprint 4

## Goal

Test whether the board can show a plan's structure as well as its items. Can people tell an initiative from a story? Can they sort in two stages, by area and then by component? Can they see which children make up a group? And can they do all of this without leaving the board, or pivoting just to edit one card?

Sprints 0–3 built the core bet: pivots, groups, import, and dependencies. PM testing on 2026-10-01 found three gaps, now backlog themes A, B and C:

- the card hierarchy is invisible on the board;
- hierarchical axes hide their parents;
- editing one card means pivoting.

This sprint takes all three. Component contention and the conflicts panel move to sprint 5.

Scope: single user, browser only, no server.

## Deliverables

### 1. Card inspector (Q35, requirements 4 and 10)

- [x] A side panel for the selected cards. It opens from **Inspect** in the toolbar or with the **I** key, follows the selection until closed, and shares the side-panel slot with Properties.
- [x] **Fields:**
  - the title;
  - the description, editable (imported descriptions finally show);
  - the Jira key, read-only;
  - the card's group, as a breadcrumb;
  - every select property, with a picker that follows the property's hierarchy and allows several values where the property does;
  - the card's dependencies, listed as "Comes after" and "Comes before". Clicking an entry selects that card, and ✕ removes the link.
- [x] **With several cards selected,** each property shows the value they share, or "Mixed". Setting a value sets it on all of them, as one undo step.
- [x] Sequence isn't editable here. It's a position on the board, set by dragging.

### 2. Card levels (Q32)

- [ ] A built-in, ordered, single-value **Level** property. The values are Initiative > Epic > Story by default, and can be renamed and reordered like Size. A card with no level hasn't been decided yet.
- [ ] A level badge on each card, and a heavier border for initiatives and epics, so levels can be told apart across the board. Level can be an axis like any property.
- [ ] A mismatch marker, on by default: a child at or above its group's level is flagged. It counts in the group's ⚠ like the other mismatches.
- [ ] Import maps Jira's Issue Type to Level, in the value table:
  - Initiative → Initiative;
  - Epic → Epic;
  - Story, Task, Bug, Sub-task → Story;
  - anything else → no level.

  The sample plan and the sample export get levels.
- [ ] Existing boards and plan files get the Level property when opened, with no card given a level.

### 3. Nested axes (Q34)

- [ ] With an axis at a child level, such as components or releases, each parent shows as a header band across its children. Areas sit to the left of component rows, and quarters above release columns.
- [ ] Each parent gets its own holding lane, such as "Identity: no component". It holds cards with only the parent value, and dropping a card there gives it that plain parent value (Q22's rule).
- [ ] The holding lanes at the board's edges hold only cards with no value at any level.
- [ ] A band can be collapsed into one lane that shows all its cards, and expanded again. Dragging a card within a collapsed band keeps its precise value. Collapsed bands are remembered per browser, like the view.
- [ ] Clicking a band's header still zooms into it (requirement 7).

### 4. Children in context (Q33)

- [ ] **Expand in place:** select one or more groups and press **E** (or the toolbar's **Expand**). Their children appear on the current board in their own lanes, each marked with a parent chip and a parent-colored edge. **E** again, on a group or on any of its expanded children, collapses it.
- [ ] **Multi-zoom:** select several groups and zoom in (⌘↓). The board shows only their children, each with a parent chip, and the breadcrumb reads "Plan › EU data residency + 1".
- [ ] **Faded copies become frames.** A collapsed group's faded "via children" copy becomes a faded frame, labeled with the group, around the real child cards that put it in that lane. Those cards can be dragged, and dragging one edits the child (amends Q16).
- [ ] Dependency lines, ⚠ counts and drops work on expanded children like on any card on screen.

### 5. Tester-ready

- [ ] The legend covers the inspector, levels, bands, and expanding groups.
- [ ] A demo note (`docs/demos/sprint-4.md`) and a session script about structuring a plan.

## Deferred (don't build)

- Component contention and concurrency limits.
- The conflicts panel, reviewed conflicts, and per-type hiding: the sprint 5 candidate (Q40, Q41).
- Hierarchical custom properties (Q25).
- Editing sequence from the inspector.
- Scenarios, filters, saved views, and the relay or any server.

## Exit criteria

Sprint 4 is done when the PM can open the latest `main` build and do all of the following:

1. Select a card and open the inspector. Set its size and components without pivoting. Select three cards and set their quarter at once. Each change is one undo step.
2. Read and edit a card's description, see its Jira key and dependencies, and remove a dependency from the inspector.
3. Give cards levels, and see the level badges and heavier borders. A story containing an epic is flagged.
4. Import the sample Jira export. Epics arrive as Epic, and stories as Story.
5. With components as rows, see area bands on the left and an "Identity: no component" lane. Drop a card there to give it plain Identity. The bottom lane holds only cards with no system value.
6. Collapse and expand an area band, and click an area header to zoom as before. Do the same with quarters over releases.
7. Expand two groups in place, and see their children on the board, marked with their parent. Collapse them again.
8. Zoom into two groups at once, and see only their children, each marked with its parent.
9. See a faded copy as a frame around the children that put the group there. Drag one of those children, and see the child change.
10. Reload without losing anything: the plan, the collapsed bands, and the expanded groups.

Then the PM runs a 20-minute session with one or two PMs or EMs on a plan with real structure. The questions:

- Do levels, bands and expanded groups make the plan's shape readable?
- Do people collapse bands or zoom (Q34)?
- Do they open the inspector or drag (Q35)?

Feedback goes into `docs/backlog.md`.
