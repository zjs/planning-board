# Sprint 3

## Goal

Test the other half of the core bet. Do dependency links and order highlights make a plan's sequencing problems visible, and worth arguing about, without turning the board into spaghetti?

Sprints 0–2 showed that pivoting, grouping, zooming, and importing work on real data. Imported plans already carry their Jira "Blocks" links; this sprint draws them. Component contention and the conflicts panel are sprint 4 candidates.

Scope: single user, browser only, no server.

## Deliverables

### 1. Drawing links (requirement 15, Q24)

- [x] Select the prerequisite, then the dependent, and press **L** (or the **Link** button) to link them. Pressing L again on the same pair removes the link. Each is one undo step.
- [x] With one card selected, L starts a pending link that survives zooming: "Linking from X: select the card it comes before, then press L." Esc cancels. This is how cards at different group levels get linked.
- [x] Hovering over a line names it ("A → B"). Clicking a line selects it, and Delete removes it.

### 2. Showing links (Q14, Q39)

- [x] Out-of-order links and loops are always drawn. Other links show only for the hovered card (its direct links) or the selected cards (their whole chain, upstream and downstream).
- [x] Lines are curved, with an arrowhead at the dependent. A card with several copies is linked from its closest copy.

### 3. Order highlights (requirements 16 and 18)

- [x] A link is out of order when the prerequisite comes after its dependent on an axis the view orders by: to its right (or below) on a sequence axis, or in a later bucket on a time axis, judged at the level the view shows (Q12). Out-of-order links are drawn in the warning color. Views with no sequence or time axis don't judge order.
- [x] Links in a loop are flagged in every view (Q37).
- [x] A collapsed group's ⚠ count includes out-of-order links and loops inside it, and hovering lists them.

### 4. Links to hidden cards (Q38)

- [x] A link whose card is inside a collapsed group is drawn to the group, the nearest card on screen. A link that stays inside one group isn't drawn at that level, and a link to a card that isn't on screen at all isn't drawn.

### 5. Backlog fixes (`docs/backlog.md`)

- [x] Double-click always renames, groups included; select a group and click its child count to open it, and ⌘↓ still zooms. Faded copies still zoom on double-click (Q36).
- [x] Double-clicking a gap between sequence columns creates a card in a new column.
- [x] The Rows dropdown is to the left of Columns.

### 6. Tester-ready

- [x] The legend covers linking and the highlights.
- [x] A demo note (`docs/demos/sprint-3.md`) and a session script focused on reading and arguing about a plan's dependencies.

## Deferred (don't build)

Component contention and concurrency limits; the conflicts panel, reviewed conflicts, and per-type hiding; the card inspector (Q35); card levels, children in context, and nested axes (Q32–Q34); scenarios; filters; saved views; the relay or any server.

## Exit criteria

Sprint 3 is done when the PM can open the latest `main` build and do all of the following:

1. Select two cards and press L. The link shows for the selected card, and undo removes it.
2. Link a card to one inside a group, with a pending link across zoom levels.
3. In a sequence view, drag a prerequisite to the right of its dependent. The link turns red and stays drawn; drag it back and the highlight clears.
4. In a time view, see out-of-order highlights follow the level shown, quarters or releases.
5. Spot a collapsed group whose ⚠ count includes an out-of-order link inside it, and zoom in to find it.
6. Make a loop, and see both links flagged.
7. Remove a link, with L or by clicking the line and pressing Delete, and undo it.
8. Import the sample Jira export, and see its Blocks links on hover.
9. Double-click a group to rename it, open it with its zoom button, double-click a sequence gap to create a card in a new column, and find Rows on the left.
10. Reload without losing anything.

Then the PM runs a 20-minute session with one or two PMs or EMs on a plan with real dependencies (their own import, ideally). The questions are whether the highlights point at problems worth discussing, and whether the board stays readable. Feedback goes into `docs/backlog.md`.
