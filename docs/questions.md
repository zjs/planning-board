# Questions for the PM

Open product questions. Engineering adds entries here instead of deciding silently. The PM answers inline and moves the entry to Answered. Settled decisions belong in `requirements.md`.

Entry format:

```
### Q<n>: <short title>
- Context: why this came up, with requirement numbers
- Options: the realistic choices
- Recommendation: engineering's pick and why
- Status: open | answered <date>: <answer>
```

## Open

### Q2: Should sequence views show a softer "shares a component" hint?
- Context: Contention is only checked in time views, since sequence steps don't mean items run concurrently.
- Options: no hint; a subtle marker on cards that share a component with a neighbor; a toggle.
- Recommendation: defer until conflict UI exists.
- Status: open

### Q3: How are scenarios forked and named, and can more than two be compared at once?
- Context: Requirements 22–24. The scenario UI is deferred, but the data model is decided in sprint 0.
- Options: pairwise comparison only; one baseline against several.
- Recommendation: pairwise for M1.
- Status: open

### Q12: Conflict rules: what counts, and at what time granularity?
- Context: Requirements 13, 16, 17. Sprint 0's stretch goal built the conflict rules as tested functions with no UI yet (`src/domain/conflicts.ts`). Several choices aren't settled by the requirements, and sprint 1's conflicts panel will build on them.
- Choices made, each reversible:
  - **Groups in contention.** A group counts on a component only where none of its children already count on the same component in the same bucket. Children refine their group's estimate, and counting both would double-count. Req. 13 says a group's touches "include" its children's, which could also mean summing them.
  - **Loosely dated children.** A child dated to Q1 inside a group dated to release 27.1 isn't flagged, because it might fit. Only dates that can't overlap are flagged.
  - **Time bucket.** Contention and time-order checks default to quarters. The requirements table says contention is "measured here" on Time → Release, which may mean releases. The function takes either.
  - **Uncertain order.** A dependency is flagged only when the order is certain. A prerequisite in Q2 against a dependent in Q1/R1 is flagged; one in Q1 against Q1/R1 isn't.
- Recommendation: keep these for sprint 1 and revisit with real data. The time bucket is the one most likely to matter, since it changes which conflicts show at all.
- Status: open

### Q21: What happens to a group's dependencies when it's ungrouped?
- Context: Requirements 11 and 15. Ungrouping removes the group card, but other cards may depend on it, or it on them. Dependencies aren't visible until sprint 2, but ungrouping already has to do something with them.
- Options: (a) re-point each link at every child ("X before the epic" becomes "X before each of its parts"); (b) drop the links; (c) keep them on a hidden, deleted group.
- Recommendation: (a). It keeps every ordering constraint the plan had, and it's what decomposing an epic means (the "Group" definition in `requirements.md`). The catch is that one link can become many; the dependency UI will show whether that's noisy.
- Status: open. Built (a) in slice 2; one undo restores the original links.

### Q22: In a zoomed lane, what does dropping a card on "No component" do?
- Context: Requirements 3, 5, and 7, and Q18. Outside a zoom, a holding lane removes the dragged copy's value on that axis. Inside a zoom on Identity, the rows are Identity's components and the "No component" lane holds cards tagged Identity with no component yet. Removing the value would take the card out of Identity altogether, so it would vanish from the view you just dropped it into.
- Options: (a) inside a zoom, "No component" means "Identity, nothing more precise": the copy loses its component and goes back to plain Identity, so it stays in view; (b) the same as outside a zoom: the value is removed, and the card leaves the view.
- Recommendation: (a). It matches what the lane shows, and it's the inverse of refining (dropping an Identity-only card on SSO makes it Identity/SSO). The same goes for time: a release dropped on "No release" inside a Q2 zoom goes back to plain Q2.
- Status: open. Built (a) in slice 4.

### Q23: Are group mismatch markers too noisy on real plans?
- Context: Requirements 13 and 18, and the "Conflict noise" risk in `requirements.md`. With markers built in slice 5, 17 of the sample plan's 23 grouped cards are flagged: 9 dated outside their group, 9 in another area, and 3 larger than their group (some cards have more than one). The sample was written by hand, so real plans may be better or worse, but a PM's ballpark on an epic will often disagree with the refined children, which is the point of the marker and also the source of the noise.
- Options: (a) keep every marker and watch the session; (b) flag only time mismatches for now, since size and area mismatches are often intentional (an epic sized by its biggest part, or a platform epic with work in several areas); (c) add per-type hiding now rather than waiting for the conflicts panel in sprint 2.
- Recommendation: (a) for the sprint 1 session, with a specific question in the script ("which of these markers would you act on?"). The answer decides between (b) and (c), and it feeds sprint 2's conflicts panel.
- Status: open.

### Q27: Where do flat Jira values go in our two-level hierarchies?
- Context: Requirements 27 and 28, sprint 2 slices 4–5. Jira components are a flat list with no area, and fix versions have no quarter. System is Area → Component and Time is Quarter → Release, so every imported component needs an area and every version needs a quarter.
- Options: (a) a value table in the import dialog that asks for a parent for each value, with defaults; (b) import components as areas and versions as quarters, and let people restructure afterwards with value editing; (c) infer parents from names or release dates.
- Recommendation: (a). Each component defaults to a new area named after its Jira project, and each version defaults to "not imported", so those cards get no time until you pick a quarter. Nothing is guessed silently, and value editing (slice 3) fixes anything chosen wrong. (c) could come later as a suggestion in the same table, using the versions' release dates.
- Status: open. Built (a).
  - Slices 4–5: the import dialog's Values step lists each component with an area field (defaulting to the project's name) and each version with a quarter menu (defaulting to "Not dated").

### Q28: How do story points become sizes?
- Context: Requirement 28 and the Size property (ordered XS–XL, no roll-up). Jira exports story points as numbers, and teams use different scales.
- Options: (a) fixed buckets, editable in the import's value table; (b) buckets by quantile of the imported points; (c) don't import points.
- Recommendation: (a), with defaults 1 → XS, 2–3 → S, 5 → M, 8 → L, 13 and up → XL. They follow the usual Fibonacci scale _(recalled)_ and are easy to read and change. (b) shifts every card's size whenever the export changes.
- Status: open. Built (a).
  - Slices 4–5: the Values step lists each story point value with its size, editable.

### Q29: What happens to Jira fields with no built-in home?
- Context: Requirements 26 and 28. Status, Priority, Sprint and Assignee are in most exports. None of them match a built-in property, and several describe execution rather than planning.
- Options: (a) off by default, and any of them can become a custom property in the mapping step; (b) import all of them as custom properties; (c) not importable.
- Recommendation: (a). The board stays about the plan, and anyone who wants to pivot by Status can turn it on. Team and Labels are on by default, because they're the pivots the sprint tests.
- Status: open. Built (a).
  - Slice 4: the mapping step shows them as "Don't import", and any column can be turned into a custom property.

### Q30: Should imported cards get sequence positions?
- Context: Requirements 6 and 28. Jira exports carry an order (rank, or just row order), but the board's sequence is a hand-placed layout, and dependency links carry all the ordering the tool checks. Imported cards have no position, so in a sequence view every one of them waits in "No position".
- Options: (a) no positions, and the board switches to Time × System after an import, so cards land where the export put them; (b) give each card its own column in file order, which could mean 150 columns and would read as a claim of order; (c) put them all in one column, which is a tidier version of "No position".
- Recommendation: (a). Sequencing is the brainstorming work the board is for, and a PM can drag cards into order after looking at them by time and area. Revisit if testers expect the Jira rank to survive.
- Status: open. Built (a) in slice 5.

### Q32: Card levels
- Context: Requirements 11 and 13, and the backlog's theme A. Testers want to tell a story that doesn't have a parent yet from an initiative that doesn't have children yet. Today both look like plain cards. Q20 lets any card become a group by adding children, but "group" only describes what a card contains, not what it is.
- Options: (a) a built-in, ordered Level property, such as Initiative > Epic > Story; (b) an explicit "this is a group" flag on cards without children; (c) leave it to a custom property.
- Recommendation: (a). The open details:
  - **Values:** Initiative > Epic > Story by default, renamable and reorderable like Size.
  - **On the card:** a badge, plus a subtle style (heavier border or a header strip) so levels can be told apart across the board.
  - **Import:** Jira's Issue Type maps to Level in the value table. Epic → Epic; Story, Task, and Bug → Story.
  - **Mismatch marker:** flag a child whose level is at or above its parent's, like the size and date markers. It's on by default, and Q23's noise question applies.
  - **No level:** means "not decided yet", which keeps the brainstorming feel testers liked.
- Status: open. Direction agreed 2026-10-01: (a). The details above are open, and it's a sprint 4 candidate.

### Q33: Showing children in context
- Context: Requirements 12, 13 and 18, Q16, and the backlog's theme A. Testers want to zoom into several groups at once and see which cards belong to which parent. They also want a faded "via children" copy of a group to show which children put it there.
- Options: (a) expand in place: select groups and expand them, so their children appear on the current board, each marked with its parent (a chip, or the group's frame around them); (b) multi-zoom: zoom into several groups at once, showing only their children, each with a parent chip; (c) both, built as one mechanism, where multi-zoom is expanding with everything else hidden.
- Recommendation: (c). For faded copies, the group becomes a frame around the real child cards that put it in that lane. Those cards stay draggable, and dragging one edits the child, so faded copies stop being a dead end. This turns the view's zoom root into a set (an amendment to ADR 0008).
- Status: open. Sprint 4 candidate.

### Q34: Nested axes
- Context: Requirements 1, 5 and 7, Q18 and Q22, and the backlog's theme B. With components as rows, the areas above them disappear, and every card with an area but no component waits in one lane at the bottom, far from its area. Testers sort in two stages: by area first, then area by area by component.
- Options: at a child level, show each parent as a header band spanning its children (areas over components, quarters over releases), with a holding lane per parent, such as "Identity: no component". A drop there gives the card the plain parent, the same rule as Q22. Then for lane zoom: (a) keep clicking a header to zoom; (b) collapse and expand bands instead; (c) both. Also open: whether the edge holding lanes then hold only cards with no value at any level.
- Recommendation: nested bands with per-parent lanes, and (c) at first, then see whether people still zoom. Edge lanes hold only cards with no value at all. It's the biggest layout change since sprint 0, so it gets an ADR first.
- Status: open. Sprint 4 candidate.

### Q35: Editing a card without pivoting
- Context: Requirements 2, 4 and 10, and the backlog's theme C. Dragging is the fastest way to set a value on many cards, but sizing one new card means pivoting to Size, dragging, then pivoting back.
- Options: (a) an inspector panel for the selection: every property with a picker, bulk edits for a multi-selection, and room for the description and Jira key; (b) click a badge on a card to change it in a popover; (c) both.
- Recommendation: (a) first. It's one place for every property. It's also the home for card descriptions, which are imported but not shown yet, and later for a card's dependencies. Add (b) if testers reach for the badges. Dragging stays the way to sort many cards.
- Status: open. Sprint 4 candidate, or late in sprint 3 if there's room.

### Q36: Double-click does three jobs
- Context: Requirements 10 and 12, and the backlog's theme C. Double-click creates a card in empty space, renames a card, and zooms into a group. So testers can't find how to rename a group. Enter on a selected group renames it, but nobody finds that. The sprint 1 plan listed this as a risk, with this fallback.
- Options: (a) double-click always renames, and group cards get a small zoom button, with ⌘↓ still zooming; (b) double-clicking the title renames and double-clicking the rest of the card zooms; (c) keep it as it is, and add F2 and a line in the help.
- Recommendation: (a). One meaning everywhere, and zooming gets a visible control. Faded copies, which can't be renamed, would still zoom on double-click.
- Status: open. Sprint 3.

## Answered

### Q1: Is a modifier-key drop discoverable enough for adding a value?
- Context: Requirement 3. Dropping with a modifier adds a value to a multi-valued property instead of replacing one.
- Options: modifier key only; a visible "add to lane" control on hover; both.
- Recommendation: build the modifier drop in sprint 0 and watch whether testers find it in the user session.
- Status: answered. Sufficiently discoverable, especially with the help menu that opens automatically and can be re-opened as needed.

### Q4: What happens to cards placed in a view when an axis value is deleted?
- Context: Requirement 27 lets users edit property values, such as removing a release.
- Options: the cards lose that value and move to the holding area; deletion is blocked while cards use the value; the cards move to the parent value in the hierarchy.
- Recommendation: move to the parent value when there is one, otherwise to the holding area. It keeps information and never blocks the user.
- Status: answered 2026-09-30: move to the parent value, as recommended. Sprint 2, slice 3. A notice with Undo says how many cards moved.
  - Built in slice 3. Deleting a value also deletes everything below it (an area's components). That asks first, because it removes more than you clicked; deleting a single value doesn't.

### Q5: Where do builds go so the PM can click through them?
- Context: The repo is private with no Pages site. The sprint doc asked for a static URL on every merge.
- Options: public repo + GitHub Pages; private + paid Pages; Cloudflare/Netlify previews; local only.
- Recommendation: public + Pages.
- Status: answered 2026-09-26: keep the repo private for now and move to public + Pages later. The PM will sort out private hosting. Until then, CI builds one self-contained HTML file for every PR and `main` push and attaches it as a workflow artifact.
  - 2026-09-30: moving to public + Pages now (Q31). A Pages workflow publishes every `main` build; CI still attaches the file to every run.

### Q6: Who merges to `main`?
- Status: answered 2026-09-26: engineering merges once CI is green and self-review is done. The PM accepts on the build.

### Q7: In user sessions, who drives?
- Status: answered 2026-09-26: both. The PM demos first, then hands over to testers. The build needs an on-screen legend for gestures, and it has to work in testers' own browsers (the single HTML file can be sent to them directly).

### Q8: How does the sequence axis get new columns?
- Context: Requirements 2 and 6, sprint 0 walking skeleton. Sequence is an unlabeled layout position, so there's no fixed list of columns to drop into. This sits at the center of the "drag writes values" bet.
- Options: (a) columns are the distinct sequence values in use, plus a thin drop gutter between columns and at each end, and dropping in a gutter creates a new column; (b) a fixed grid of N columns with empty ones allowed; (c) free horizontal placement with no columns.
- Recommendation: (a). Values are fractional ordering keys, so inserting never renumbers other items, and empty columns disappear on their own. (b) keeps showing empty slots that read as "planned gaps". (c) turns cells into pixel positions, which the requirements rule out ("remembering card positions within a cell").
- Status: answered. (a) is sufficiently intuitive and discoverable.

### Q9: Should cards show their non-axis values in sprint 0?
- Context: Requirement 4 isn't in the sprint 0 deliverables. But the exit criterion is "drag cards and watch values change". Right after a drag in sequence × system, the card doesn't show which quarter it's in, so the only way to check is to pivot.
- Options: no attributes until sprint 1; a minimal badge row (size, quarter, system count); a click-to-inspect panel.
- Recommendation: the minimal badge row. It's small, it's read-only, and testers need it to trust what the drag did.
- Status: answered. Display of non-axis values was clear. There may be ways to improve the Release data (currently values like "27.3") once release curation is built

### Q10: Dropping a card from the holding area when it already has a value on one axis
- Context: Requirements 2, 3, and 5. A card sits in the holding area if it's missing a value on either axis, but it may still have values on the other one. In time × system, a card tagged Identity with no quarter sits in holding. If it's dropped in the Billing row, Q2 column, should it lose Identity? Slice 2 needs an answer.
- Options: (a) replace: the card ends up in exactly the cell where it was dropped; (b) on a multi-valued axis, add the dropped lane to the existing values and keep the old ones, while single-valued axes are replaced; (c) only fill the missing axis and ignore the other.
- Recommendation: (b). Nothing is lost silently, and for single-valued axes it's the same as (a). The catch is that after the drop the card also shows in its old lane, which may surprise people. The user session will tell.
- Status: answered 2026-09-26: The holding area itself likely needs to be reconsidered. I suspect we want multiple holding areas around the right and bottom perimeter: holding areas on the right represent "cards have a row assigned but not a column", holding areas on the bottom represent "cards have a column assigned but not a row", bottom right corner is "cards have neither a column or row assigned". I think this would make current state clearer, and provide a clearer resolution to this Q10: the UX for a dealing with a multi-value axis can be the same drop to replace or modifier-key drop to add, moving from holding area for a particular column into the holding area for a different column sets that axis without setting the other, moving (without the modifier-key drop) to a specific cell sets both axes.
  - Built in sprint 0, slice 5. The holding lanes stay pinned to the right and bottom edges while the board scrolls, and a Cards/Chips toggle shows their cards as full cards or one-line chips. A card in Identity's "No quarter" lane dropped in (Billing, Q2) now moves out of Identity; ⌥/Alt keeps Identity. See Q13 for one side effect.

### Q11: What does dropping a card on the holding area remove?
- Context: Requirement 3 says "dragging a copy to the holding area removes only that value", but a card in a cell has a value on *both* axes. In time × system, dropping a card on the holding area could mean "we don't know when" (clear the quarter) or "not this component" (clear the lane).
- Options: (a) always clear the multi-valued axis; (b) clear both axes; (c) when a drag starts, the holding area shows two drop zones, one per axis, such as "Clear sequence position" and "Remove Billing".
- Recommendation: (c). It's explicit, and it covers both intents. The cost is a slightly busier holding area during a drag.
- Status: answered 2026-09-26: Proposal for Q10 likely provides an intuitive solution for this.
  - Built in slice 5 as the Q10 holding lanes. A drop gives the dragged copy the values of the lane it lands in. Dropping a card from (Billing, Q2) on Billing's "No quarter" lane clears the quarter ("we don't know when"). Dropping it on Q2's "No area" lane removes Billing ("not this component"). The corner clears both.

### Q13: A multi-area card dropped on "No area" lands in its other rows
- Context: Requirement 3 and the Q10/Q11 answer. A drop gives the dragged copy the values of the lane it lands in, and a holding lane removes only that copy's value. So if a card is in Billing and Identity, dropping its Billing copy on Q2's "No area" lane removes Billing. The card still has Identity, so it shows up in the Identity row, not in "No area". The landing flash shows where it went, but the card doesn't end up where it was dropped.
- Options: (a) keep it: remove only the dragged copy's value; (b) clear every area, so the card lands in "No area"; (c) show a hint during the drag, such as "Removes Billing; stays in Identity".
- Recommendation: (a) for now, since (b) silently deletes Identity. Add (c) if testers are surprised.
- Status: answered 2026-09-26: agreed, keep (a).

### Q14: How do dependencies show on the board?
- Context: Requirements 15 and 16. The sample plan has dependency chains across areas; drawing every link at once gives about 100 crossing lines.
- Options: (a) always draw out-of-order links, and draw the rest only for the hovered or selected card, both upstream and downstream; (b) draw everything, with a toggle to hide; (c) nothing until hover, with violations shown only as a badge.
- Recommendation: (a). It keeps the board calm while the problems stand out.
- Status: answered 2026-09-26: (a). Built with dependencies, after sprint 1.

### Q15: How do people create groups and move cards in and out?
- Context: Requirements 10–12, sprint 1 planning.
- Options: (a) select cards, then Group (⌘G), and zoom in to add or move children out; (b) ⇧-drop a card onto another card to nest it; (c) both.
- Recommendation: (a). It's how diagram editors work, it avoids a third drop modifier, and dependency focus reuses the selection later.
- Status: answered 2026-09-26: (a). Sprint 1, slices 1–3.

### Q16: Does a collapsed group show in lanes its children touch?
- Context: Requirement 13 says a group's component touches include its children's. An epic tagged Identity with a child in Billing: does the group show in the Billing row?
- Options: (a) solid copies in its own lanes, plus faded "via children" copies elsewhere, which can't be dragged and zoom in on double-click; (b) own lanes only, with a "+Billing" badge; (c) full copies everywhere, all draggable.
- Recommendation: (a). The Billing row then shows everything that touches Billing, and no drag writes a value the group never had.
- Status: answered 2026-09-26: (a). Sprint 1, slice 5.

### Q17: What does deleting a group delete?
- Context: Requirements 10 and 11, sprint 1. Delete and ungroup are both available on a selected group.
- Options: (a) the group and everything inside it; (b) only the group, with its children moving up a level (the same as ungroup); (c) ask each time.
- Recommendation: (a), because it matches diagram editors, and ungroup already covers keeping the children. It's undoable, and a large delete flashes a count ("Deleted 5 cards · Undo").
- Status: answered 2026-09-26: (a), but it needs full support for undo.
  - Engineering reads "full support" as: one undo brings back the whole deleted subtree exactly as it was, including nested groups, every child's values and parent links, and any dependencies that involved a deleted card. Redo deletes it all again. Slice 1 tests this, including a delete, undo, and reload round trip.
  - Undo history still doesn't survive a reload, as in sprint 0. PM, 2026-09-26: that's still acceptable; undo that survives a reload could be a future feature (listed under Later in `requirements.md`).

### Q18: What happens to other cards when you zoom into a lane?
- Context: Requirement 7, sprint 1. Zooming Identity into its components raises two questions: where do Billing cards go, and where do cards tagged only "Identity", with no component, go?
- Options: for cards in other lanes, (a) hide them or (b) keep them in the holding lanes. For area-only cards, (c) show them in "No component" or (d) show them in every component lane.
- Recommendation: (a) and (c). A zoomed view is about one area, and "No component" doubles as the to-do list for refining, just as system views double as a tagging tool (req. 21).
- Status: answered 2026-09-26: (a) and (c), as recommended. Sprint 1, slice 4.

### Q19: When zoomed into a group, how do its own values show?
- Context: Requirement 13. A group keeps its own values, such as a PM's ballpark quarter, while its children refine them. Inside the group, you see only the children.
- Options: (a) as badges in the zoom header; (b) also shade the lane or column matching the group's value, so children outside it stand out; (c) both.
- Recommendation: (a) for sprint 1, since the mismatch markers already flag children that don't fit. Revisit (b) after the session.
- Status: answered 2026-09-26: (a), as recommended. Sprint 1, slice 3.

### Q20: How does a plain card become a group, so an epic can be decomposed?
- Context: Requirements 11 and 12, the "Group" definition ("decomposing an item means turning it into a group"), and Q15. As built in slice 2, ⌘G adds cards to a card only if it's already a group. With a plain epic plus some stories selected, ⌘G makes a *new* group containing all of them, including the epic, which is the wrong shape for decomposing.
- Options: (a) in slice 3, let any card be zoomed into, not just groups, and treat a card with no children as an empty group you can add child cards to (once it has one child, ⌘G can move more cards into it); (b) a second shortcut, such as ⌥⌘G, that puts the selection inside the card you clicked last; (c) a "Move into…" command that picks the target from a list.
- Recommendation: (a). Decomposing usually means writing new child cards, which (a) covers directly, and it adds no new gesture. The cost is that moving existing cards into a plain card takes two steps: create one child first, then ⌘G.
- Status: answered 2026-09-26: (a), as recommended. Built in slice 3: select any card and press ⌘↓ (or Zoom in); an empty card shows "Nothing inside yet", and its first child makes it a group.

### Q24: How are dependency links drawn?
- Context: Requirements 15 and 16, and Q14 (how they're displayed). Sprint 2 planning, for building in sprint 3.
- Options: (a) select the prerequisite, then the dependent, and press L; (b) drag from a handle on the card to another card; (c) both.
- Recommendation: (a). It reuses the selection from sprint 1, and it adds no drag gesture to compete with moving cards.
- Status: answered 2026-09-30: (a). Sprint 3.

### Q25: Are custom properties in scope for sprint 2, and where do they come from?
- Context: Requirements 26 and 28. An import is only recognizable if people can pivot by their own fields, such as Team.
- Options: (a) created from imported columns and by hand, flat for now; (b) by hand only; (c) wait for sprint 3.
- Recommendation: (a). Hierarchical custom properties wait until someone needs one.
- Status: answered 2026-09-30: (a). Sprint 2, slices 2 and 5.

### Q26: What does an import do to the current board?
- Context: Requirement 28. The board may already hold a plan when someone imports.
- Options: (a) replace the board, undoably, and keep each card's Jira key; (b) add the imported cards to the board; (c) merge by Jira key.
- Recommendation: (a). It's simple to reason about and one undo reverses it. Keeping the key leaves room for (c) later, as "update from a fresh export".
- Status: answered 2026-09-30: (a). The build targets Jira's CSV format, tested with a synthetic export in the repo. The PM checks their own export locally.

### Q31: Is the repository ready to open, and how?
- Context: After sprint 2, the CSV import lets potential users try the tool on their own data without a guided session. Before opening: no secrets or real data in the history, the build makes no network requests, and the dependencies are MIT or CC0. What was missing was a way to open the app without a GitHub login, CI for pull requests, a README for strangers, and a feedback route.
- Options: how far to open (public only; public and hosted, shared quietly; public and announced); whether to take code contributions; whether the process docs stay public.
- Recommendation: public and hosted on GitHub Pages, shared quietly, with wider promotion after sprint 3 draws dependencies (the other half of the core bet). Issues welcome, code PRs not yet. Keep the process docs public as a decision log.
- Status: answered 2026-09-30: public and hosted, shared quietly; issues only for now; process docs published as they are. Housekeeping done in one PR: CI on pull requests with read-only permissions, a Pages workflow, a README for new visitors, CONTRIBUTING, SECURITY, issue templates (bug, import problem asking for the header row only, feedback), and the build commit plus a feedback link in the help panel. The PM makes the repo public, sets Pages to deploy from GitHub Actions, turns on private vulnerability reporting, and does the Firefox and Safari check before sharing widely.
