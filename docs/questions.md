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
- Status: partly answered 2026-10-01: for dependency order, a time view judges at the level it shows (quarters or releases), so a highlight never contradicts the board in front of you. Sprint 3. Contention's time bucket and the other choices stay open until contention is built (a sprint 10 candidate).
  - Sprint 5 (ADR 0013): with one Time axis that folds, "the level it shows" became the lanes it shows. A folded quarter is one bucket, and an unfolded one a bucket per release.
  - 2026-10-07: the PM has no preference on contention's time bucket. Engineering's default, for when contention is built (a sprint 10 candidate): the lanes shown, the same rule as dependency order, so a contention highlight never contradicts the board in front of you.

### Q21: What happens to a group's dependencies when it's ungrouped?
- Context: Requirements 11 and 15. Ungrouping removes the group card, but other cards may depend on it, or it on them. Dependencies aren't visible until sprint 2, but ungrouping already has to do something with them.
- Options: (a) re-point each link at every child ("X before the epic" becomes "X before each of its parts"); (b) drop the links; (c) keep them on a hidden, deleted group.
- Recommendation: (a). It keeps every ordering constraint the plan had, and it's what decomposing an epic means (the "Group" definition in `requirements.md`). The catch is that one link can become many; the dependency UI will show whether that's noisy.
- Status: open. Built (a) in slice 2; one undo restores the original links.
  - Sprint 8: related links (Q44) are re-pointed the same way.

### Q23: Are group mismatch markers too noisy on real plans?
- Context: Requirements 13 and 18, and the "Conflict noise" risk in `requirements.md`. With markers built in slice 5, 17 of the sample plan's 23 grouped cards are flagged: 9 dated outside their group, 9 in another area, and 3 larger than their group (some cards have more than one). The sample was written by hand, so real plans may be better or worse, but a PM's ballpark on an epic will often disagree with the refined children, which is the point of the marker and also the source of the noise.
- Options: (a) keep every marker and watch the session; (b) flag only time mismatches for now, since size and area mismatches are often intentional (an epic sized by its biggest part, or a platform epic with work in several areas); (c) add per-type hiding now rather than waiting for the conflicts panel in sprint 2.
- Recommendation: (a), and watch the tester session, with a specific question in the script ("which of these markers would you act on?"). The answer decides between (b) and (c), and it feeds the conflicts panel.
- Status: open. Sprint 4 added a level marker, so there's more to watch. The combined sprint 3–5 session (`docs/demos/sprint-5-session.md`) asks the question; the conflicts panel, with per-type hiding, is a sprint 10 candidate (sprint 9 went to designing collaboration). The session now covers sprints 3–7. Sprint 7's review counted 45 ⚠ markers in the sample's first view, which a first-time visitor reads as a plan with problems everywhere.

### Q27: Where do flat Jira values go in our two-level hierarchies?
- Context: Requirements 27 and 28, sprint 2 slices 4–5. Jira components are a flat list with no area, and fix versions have no quarter. System is Area → Component and Time is Quarter → Release, so every imported component needs an area and every version needs a quarter.
- Options: (a) a value table in the import dialog that asks for a parent for each value, with defaults; (b) import components as areas and versions as quarters, and let people restructure afterwards with value editing; (c) infer parents from names or release dates.
- Recommendation: (a). Each component defaults to a new area named after its Jira project, and each version defaults to "not imported", so those cards get no time until you pick a quarter. Nothing is guessed silently, and value editing (slice 3) fixes anything chosen wrong. (c) could come later as a suggestion in the same table, using the versions' release dates.
- Status: open. Built (a).
  - Slices 4–5: the import dialog's Values step lists each component with an area field (defaulting to the project's name) and each version with a quarter menu (defaulting to "Not dated").

### Q49: How housekeeping fits into our way of working
- Context: The repo is public, and its README, help panel, backlog and questions drifted out of date over sprints 3–5. Dependencies and CI actions aged on their own. A cleanup pass on 2026-10-02 fixed them, and [`docs/housekeeping.md`](housekeeping.md) proposes how to keep it that way.
- Options:
  - **The process.** (a) Four activities, each with its own trigger: a definition of done in every slice; a release pass in each sprint's last slice; a maintenance pass before planning each sprint; and intake when feedback arrives. (b) One periodic cleanup pass, as on 2026-10-02.
  - **Automation.** (c) Dependabot for npm and GitHub Actions, monthly, with minor and patch updates grouped into one PR. (d) A scheduled routine that runs the maintenance pass and opens a PR. (e) Neither, for now.
- Recommendation: (a), because each kind of rot is cheapest to fix when it's caused. Also (c): it catches security fixes between sprints, and its PRs go through the same CI and merge-on-green as engineering's. Skip (d) while sprints follow each other closely.
- Status: open. The 2026-10-02 pass followed (a)'s checklists, and `CLAUDE.md` points to them as a proposal.

### Q54: Making actions findable
- Context: The backlog's theme K. These are reachable only by a key or an invisible gesture:
  - E, ⇧E, L, I and /;
  - Alt-drop;
  - holding to nest;
  - ⇧-click on a badge or a header;
  - double-click on empty space.
- The toolbar's selection buttons wrap the toolbar at 1280 wide. Groups use Expand and Fold, and bands use Fold and Unfold.
- Options: (a) a card menu, on right-click and on a "⋯" that shows on hover, listing actions with their keys; (b) a command palette on ⌘K; (c) both, with the selection buttons moving out of the toolbar. Separately: (d) the drag ghost names what a drop will write ("→ Q2 2027 · Billing"); (e) one word pair for showing the level below, such as Expand and Collapse for both groups and bands.
- Recommendation: (c), (d) and (e). Menus that show keys are how people learn shortcuts _(recalled)_. The ghost puts "drag writes values" into words at the moment it happens. (e) renames what Q42 and Q43 settled, so it's the PM's call.
- Status: partly answered 2026-10-07: not (e). Changing how the board is laid out (showing an area's components) and changing how much of the cards you see (showing a group's children) are different operations, and keep different words, but they must not share any. (a)–(d) are open.
  - Engineering's default, since the PM isn't attached to particular terms: bands keep **Fold** and **Unfold**, and groups use **Expand** and **Collapse**. Only ⇧E's label changes, from Fold to Collapse, along with the help and notices.
  - Sprint 7 (the PM had no preference on its scope) built (a), (d) and the new words, and deferred (b):
    - **(a), the card menu:** right-click or ⋯, every action with its key, acting on the selection (slice 4).
    - **(d), the drop label:** a dragged card names what the drop will write, "→ Q3 2027 · Billing", with "Alt adds instead" where it applies (slice 3).
    - **The words:** Collapse replaces Fold for groups (slice 3, ADR 0013).
    - **(b), the command palette:** still open, and still worth building if the session shows people looking for one.

### Q46: Order within a cell
- Context: The backlog's theme H. Cards in a cell sort by sequence, then title. In PM testing, people wanted to put cards in order within a cell, in views without a sequence axis. Sequence is already a layout, though: its keys are the sequence view's columns (Q8), so changing a card's key to reorder it in a time view would also move it to another column in the sequence view. Remembering positions per view is out of scope for v1.
- Options: (a) cells keep sorting by sequence, and can't be reordered by hand; (b) dragging within a cell changes the card's sequence key, accepting that it moves in the sequence view too; (c) a separate plan-wide rank, like Jira's: cells sort by it in every view, dragging within a cell changes it, and imports can fill it from Jira's rank or row order (Q30); sequence stays the sequence view's columns.
- Recommendation: (c). Rearranging doesn't disturb the sequence view, there's still only one order for the whole plan (not one per view), and Jira's rank gets a home.
- Status: partly answered 2026-10-07: an MVP for sprint 7. Cells keep sequence order, and cards in one sequence column follow the order they were made, not their titles. There's no reordering by hand outside the sequence view. The PM's flow: brainstorm, sort into a rough sequence, then bucket into a timeline without redoing the sequence. Box select and dragging several cards (Q48) do the bucketing.
  - Engineering's default: the tie-break is an optional plan-wide `rank`, set when a card is made, so (c) can build on it later. Q56 asks whether sequence should also nest under time.

### Q56: Sequence nested under time
- Context: Requirements 6, 7 and 16, Q46, and the PM's planning flow (2026-10-07): brainstorm, sort into a rough sequence, then bucket into a timeline. Sequence and time are separate axes, so bucketing means dragging cards from a time view's "No quarter" lane, which lists them in sequence order. Sprint 7 makes that faster with box select and dragging several cards. The PM asked whether sequence could instead be a third level of the time hierarchy.
- Options: (a) keep them separate, and rely on sprint 7's bucketing; (b) a Timeline view: Time unfolds Quarter → Release → sequence columns, so a quarter band holds the sequence columns of the cards in it, and a drag sets both quarter and position; (c) cut lines: in a sequence view, time bands sit over the sequence columns, and dragging a boundary between columns dates every card on each side.
- Recommendation: (a) for sprint 7, then decide after the cold-start session asks testers to bucket a sequence. (b) is the strongest if they still feel they're redoing work. It's a layout change on the scale of nested axes (ADR 0012), and it needs rules for a column whose cards span quarters. (c) breaks down when one column's cards belong in different quarters.
- Status: open. Held for the combined cold-start session (sprints 3–8), then a sprint 10 candidate.

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
  - Sprint 5 (Q42): zoom is gone. Cards go into a group by holding them over it, or with the inspector's Group field, and come out through the "Move out" strip.

### Q16: Does a collapsed group show in lanes its children touch?
- Context: Requirement 13 says a group's component touches include its children's. An epic tagged Identity with a child in Billing: does the group show in the Billing row?
- Options: (a) solid copies in its own lanes, plus faded "via children" copies elsewhere, which can't be dragged and zoom in on double-click; (b) own lanes only, with a "+Billing" badge; (c) full copies everywhere, all draggable.
- Recommendation: (a). The Billing row then shows everything that touches Billing, and no drag writes a value the group never had.
- Status: answered 2026-09-26: (a). Sprint 1, slice 5.
  - Sprint 4 amends this (Q33): a faded copy becomes a faded frame around the real child cards that put the group in that lane, and those cards can be dragged.
  - Sprint 5 (Q42): double-clicking a frame's group expands it, rather than zooming in.

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
  - Superseded in sprint 5 (Q43): lane zoom is gone. Unfolding an area shows its components with every other area still on the board, and the area's own lane ("No component") holds its area-only cards.

### Q19: When zoomed into a group, how do its own values show?
- Context: Requirement 13. A group keeps its own values, such as a PM's ballpark quarter, while its children refine them. Inside the group, you see only the children.
- Options: (a) as badges in the zoom header; (b) also shade the lane or column matching the group's value, so children outside it stand out; (c) both.
- Recommendation: (a) for sprint 1, since the mismatch markers already flag children that don't fit. Revisit (b) after the session.
- Status: answered 2026-09-26: (a), as recommended. Sprint 1, slice 3.
  - Superseded in sprint 5 (Q42): there's no zoom header, and a group's own values show in the inspector.

### Q20: How does a plain card become a group, so an epic can be decomposed?
- Context: Requirements 11 and 12, the "Group" definition ("decomposing an item means turning it into a group"), and Q15. As built in slice 2, ⌘G adds cards to a card only if it's already a group. With a plain epic plus some stories selected, ⌘G makes a *new* group containing all of them, including the epic, which is the wrong shape for decomposing.
- Options: (a) in slice 3, let any card be zoomed into, not just groups, and treat a card with no children as an empty group you can add child cards to (once it has one child, ⌘G can move more cards into it); (b) a second shortcut, such as ⌥⌘G, that puts the selection inside the card you clicked last; (c) a "Move into…" command that picks the target from a list.
- Recommendation: (a). Decomposing usually means writing new child cards, which (a) covers directly, and it adds no new gesture. The cost is that moving existing cards into a plain card takes two steps: create one child first, then ⌘G.
- Status: answered 2026-09-26: (a), as recommended. Built in slice 3: select any card and press ⌘↓ (or Zoom in); an empty card shows "Nothing inside yet", and its first child makes it a group.
  - Sprint 5 (Q42): without zoom, the inspector's "Add a card inside" gives any card its first child, and holding a dragged card over a plain card puts it inside.

### Q22: In a zoomed lane, what does dropping a card on "No component" do?
- Context: Requirements 3, 5, and 7, and Q18. Outside a zoom, a holding lane removes the dragged copy's value on that axis. Inside a zoom on Identity, the rows are Identity's components and the "No component" lane holds cards tagged Identity with no component yet. Removing the value would take the card out of Identity altogether, so it would vanish from the view you just dropped it into.
- Options: (a) inside a zoom, "No component" means "Identity, nothing more precise": the copy loses its component and goes back to plain Identity, so it stays in view; (b) the same as outside a zoom: the value is removed, and the card leaves the view.
- Recommendation: (a). It matches what the lane shows, and it's the inverse of refining (dropping an Identity-only card on SSO makes it Identity/SSO). The same goes for time: a release dropped on "No release" inside a Q2 zoom goes back to plain Q2.
- Status: answered 2026-10-02: keep (a) until there's a reason to switch. Built (a) in sprint 1, slice 4.
  - Since sprint 5 there's no lane zoom, so the rule lives on a nested axis: dropping a card in an unfolded area's own "No component" lane gives it the plain area (ADR 0012, ADR 0013).

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
  - Superseded by Q66 (2026-10-08): an import makes a new plan, and the board it came from is untouched. Each card still keeps its Jira key.

### Q28: How do story points become sizes?
- Context: Requirement 28 and the Size property (ordered XS–XL, no roll-up). Jira exports story points as numbers, and teams use different scales.
- Options: (a) fixed buckets, editable in the import's value table; (b) buckets by quantile of the imported points; (c) don't import points.
- Recommendation: (a), with defaults 1 → XS, 2–3 → S, 5 → M, 8 → L, 13 and up → XL. They follow the usual Fibonacci scale _(recalled)_ and are easy to read and change. (b) shifts every card's size whenever the export changes.
- Status: answered 2026-10-02: keep (a) until there's a reason to switch.
  - Slices 4–5: the Values step lists each story point value with its size, editable.

### Q29: What happens to Jira fields with no built-in home?
- Context: Requirements 26 and 28. Status, Priority, Sprint and Assignee are in most exports. None of them match a built-in property, and several describe execution rather than planning.
- Options: (a) off by default, and any of them can become a custom property in the mapping step; (b) import all of them as custom properties; (c) not importable.
- Recommendation: (a). The board stays about the plan, and anyone who wants to pivot by Status can turn it on. Team and Labels are on by default, because they're the pivots the sprint tests.
- Status: answered 2026-10-02: keep (a) until there's a reason to switch.
  - Slice 4: the mapping step shows them as "Don't import", and any column can be turned into a custom property.

### Q30: Should imported cards get sequence positions?
- Context: Requirements 6 and 28. Jira exports carry an order (rank, or just row order), but the board's sequence is a hand-placed layout, and dependency links carry all the ordering the tool checks. Imported cards have no position, so in a sequence view every one of them waits in "No position".
- Options: (a) no positions, and the board switches to Time × System after an import, so cards land where the export put them; (b) give each card its own column in file order, which could mean 150 columns and would read as a claim of order; (c) put them all in one column, which is a tidier version of "No position".
- Recommendation: (a). Sequencing is the brainstorming work the board is for, and a PM can drag cards into order after looking at them by time and area. Revisit if testers expect the Jira rank to survive.
- Status: answered 2026-10-02: keep (a) until there's a reason to switch. Built (a) in sprint 2, slice 5.

### Q31: Is the repository ready to open, and how?
- Context: After sprint 2, the CSV import lets potential users try the tool on their own data without a guided session. Before opening: no secrets or real data in the history, the build makes no network requests, and the dependencies are MIT or CC0. What was missing was a way to open the app without a GitHub login, CI for pull requests, a README for strangers, and a feedback route.
- Options: how far to open (public only; public and hosted, shared quietly; public and announced); whether to take code contributions; whether the process docs stay public.
- Recommendation: public and hosted on GitHub Pages, shared quietly, with wider promotion after sprint 3 draws dependencies (the other half of the core bet). Issues welcome, code PRs not yet. Keep the process docs public as a decision log.
- Status: answered 2026-09-30: public and hosted, shared quietly; issues only for now; process docs published as they are. Housekeeping done in one PR: CI on pull requests with read-only permissions, a Pages workflow, a README for new visitors, CONTRIBUTING, SECURITY, issue templates (bug, import problem asking for the header row only, feedback), and the build commit plus a feedback link in the help panel. The PM makes the repo public, sets Pages to deploy from GitHub Actions, turns on private vulnerability reporting, and does the Firefox and Safari check before sharing widely.

### Q32: Card levels
- Context: Requirements 11 and 13, and the backlog's theme A. Testers want to tell a story that doesn't have a parent yet from an initiative that doesn't have children yet. Today both look like plain cards. Q20 lets any card become a group by adding children, but "group" only describes what a card contains, not what it is.
- Options: (a) a built-in, ordered Level property, such as Initiative > Epic > Story; (b) an explicit "this is a group" flag on cards without children; (c) leave it to a custom property.
- Recommendation: (a). The open details:
  - **Values:** Initiative > Epic > Story by default, renamable and reorderable like Size.
  - **On the card:** a badge, plus a subtle style (heavier border or a header strip) so levels can be told apart across the board.
  - **Import:** Jira's Issue Type maps to Level in the value table. Epic → Epic; Story, Task, and Bug → Story.
  - **Mismatch marker:** flag a child whose level is at or above its parent's, like the size and date markers. It's on by default, and Q23's noise question applies.
  - **No level:** means "not decided yet", which keeps the brainstorming feel testers liked.
- Status: answered 2026-10-01: (a), with every detail above as proposed, and the mismatch marker on from the start. Sprint 4, slice 2.
  - Built in slice 2. An initiative's border is heavier than an epic's, with a strip along the top. Sub-task maps to Story along with Story, Task and Bug; any other issue type gets no level. In the sample plan, groups and their contents have levels (a group of groups is an initiative), plus two epics with nothing inside yet; every other card has none.

### Q33: Showing children in context
- Context: Requirements 12, 13 and 18, Q16, and the backlog's theme A. Testers want to zoom into several groups at once and see which cards belong to which parent. They also want a faded "via children" copy of a group to show which children put it there.
- Options: (a) expand in place: select groups and expand them, so their children appear on the current board, each marked with its parent (a chip, or the group's frame around them); (b) multi-zoom: zoom into several groups at once, showing only their children, each with a parent chip; (c) both, built as one mechanism, where multi-zoom is expanding with everything else hidden.
- Recommendation: (c). For faded copies, the group becomes a frame around the real child cards that put it in that lane. Those cards stay draggable, and dragging one edits the child, so faded copies stop being a dead end. This turns the view's zoom root into a set (an amendment to ADR 0008).
- Status: answered 2026-10-02: move to (a), expanding in place, as part of Q42. Multi-zoom goes with the rest of zoom. Built (c) in sprint 4, slice 4 (ADR 0008, amended): E expands and folds, each child shown for its group has a chip and a colored edge, and a frame lists the cards that put a group in a cell. Frames and expanding stayed; multi-zoom was removed in sprint 5 (ADR 0013).

### Q34: Nested axes
- Context: Requirements 1, 5 and 7, Q18 and Q22, and the backlog's theme B. With components as rows, the areas above them disappear, and every card with an area but no component waits in one lane at the bottom, far from its area. Testers sort in two stages: by area first, then area by area by component.
- Options: at a child level, show each parent as a header band spanning its children (areas over components, quarters over releases), with a holding lane per parent, such as "Identity: no component". A drop there gives the card the plain parent, the same rule as Q22. Then for lane zoom: (a) keep clicking a header to zoom; (b) collapse and expand bands instead; (c) both. Also open: whether the edge holding lanes then hold only cards with no value at any level.
- Recommendation: nested bands with per-parent lanes, and (c) at first, then see whether people still zoom. Edge lanes hold only cards with no value at all. It's the biggest layout change since sprint 0, so it gets an ADR first.
- Status: answered 2026-10-01: nested bands with a holding lane per parent, and (c): bands collapse and expand, and clicking a header still zooms. The session will show which one people use. Edge lanes hold only cards with no value at all. Sprint 4, slice 3, with an ADR first.
  - Built in slice 3 (ADR 0012). A parent's own lane reads "No component" or "No release" under its band, shaded like a holding lane. A collapsed band is one lane that says how much it holds ("4 components"), and its cards show the component they're in as a badge. Collapsed bands are remembered per property, so they stay collapsed when you swap axes. Zooming into a band from a component view stays a component view.
  - 2026-10-02, PM testing: folding wins over zooming, so lane zoom goes, and one axis choice per property replaces the area and component choices (Q43). Both done in sprint 5 (ADR 0013).

### Q35: Editing a card without pivoting
- Context: Requirements 2, 4 and 10, and the backlog's theme C. Dragging is the fastest way to set a value on many cards, but sizing one new card means pivoting to Size, dragging, then pivoting back.
- Options: (a) an inspector panel for the selection: every property with a picker, bulk edits for a multi-selection, and room for the description and Jira key; (b) click a badge on a card to change it in a popover; (c) both.
- Recommendation: (a) first. It's one place for every property. It's also the home for card descriptions, which are imported but not shown yet, and later for a card's dependencies. Add (b) if testers reach for the badges. Dragging stays the way to sort many cards.
- Status: answered 2026-10-02: (a) works well so far. Built in sprint 4, slice 1: the inspector opens from the toolbar or the I key and follows the selection until closed. A multi-value property shows as chips, with "2 of 3" on a value only some selected cards have. Clicking a linked card shows it on the board and selects it; since sprint 5 that expands the groups around it rather than zooming.

### Q36: Double-click does three jobs
- Context: Requirements 10 and 12, and the backlog's theme C. Double-click creates a card in empty space, renames a card, and zooms into a group. So testers can't find how to rename a group. Enter on a selected group renames it, but nobody finds that. The sprint 1 plan listed this as a risk, with this fallback.
- Options: (a) double-click always renames, and group cards get a small zoom button, with ⌘↓ still zooming; (b) double-clicking the title renames and double-clicking the rest of the card zooms; (c) keep it as it is, and add F2 and a line in the help.
- Recommendation: (a). One meaning everywhere, and zooming gets a visible control. Faded copies, which can't be renamed, would still zoom on double-click.
- Status: answered 2026-10-02: superseded by Q42. Built (a) in sprint 3, slice 1, with the child count as the zoom button ("4 ›"). In sprint 5 zooming into a group went away: double-click keeps one job (rename), and the child count expands the group instead.

### Q37: Can a dependency loop be created?
- Context: Requirements 15 and 19. A before B and B before A can never both be satisfied.
- Options: (a) refuse the link that closes a loop, and say why; (b) allow it and flag every link in the loop.
- Recommendation: (a), since a loop isn't a placement to discuss but a contradiction.
- Status: answered 2026-10-01: (b), allow and flag, consistent with never blocking (requirement 19). Sprint 3.

### Q38: How does a link show when one of its cards is inside a collapsed group?
- Context: Requirements 13, 15, and 18. A link to a child is invisible at the top level, where only the group card is placed.
- Options: (a) draw it to the nearest card on screen (the group), and count out-of-order links inside on the group's ⚠ marker; (b) hide it until zoomed in, with a count on the group.
- Recommendation: (a). It's what "a group's dependencies include its children's" (requirement 13) looks like.
- Status: answered 2026-10-01: (a). Order is still judged on the child's own values, not the group's. Sprint 3.

### Q39: How much of a card's dependency chain shows on focus?
- Context: Requirement 15 and Q14: links other than out-of-order ones show only "for the hovered or selected card, upstream and downstream". That could mean direct links or the whole chain. Separately, "select the prerequisite, then the dependent" only defines two cards.
- Options: for focus, (a) direct links on hover, the whole chain for selected cards; (b) the whole chain in both cases; (c) direct links only. For L with three or more cards selected: (d) do nothing, with a hint; (e) chain them in the order they were selected.
- Recommendation: (a) and (d). Hovering stays light while you move around the board, and selecting is a deliberate "show me everything this touches". Chaining by click order is easy to get wrong by accident.
- Status: answered 2026-10-02: (a) and (d) work well so far. Built in sprint 3.

### Q40: What does the conflicts panel list as you pivot?
- Context: Requirements 16, 17 and 20, and Q12. Time-based checks are judged at the level the view shows, and a view by size or team doesn't judge order at all. So "every active conflict" depends on the view.
- Options: (a) the panel follows the view: it lists what the board in front of you highlights, and in a view with no time axis it says to pivot to a time view to check order and contention; loops and group mismatches show in every view; (b) the panel always checks the whole plan at one plan-wide level, whatever the view.
- Recommendation: (a), so the panel never names a conflict the board doesn't show.
- Status: answered 2026-10-01: (a). For the conflicts sprint, now a sprint 10 candidate.

### Q41: What brings a reviewed conflict back?
- Context: Requirement 19: a reviewed conflict "stays suppressed until an involved item moves".
- Options: (a) any relevant change: an involved card's values that the check uses change (its time or components, for contention), or a card joins or leaves the conflict; (b) only a change to the cards it was reviewed with; (c) never, until someone un-reviews it.
- Recommendation: (a). A fourth card on a component reviewed at three is a new situation. The note stays attached, so the earlier reasoning is still visible.
- Status: answered 2026-10-01: (a). For the conflicts sprint, now a sprint 10 candidate.

### Q42: Replace zooming with expand and fold
- Context: Requirements 7, 10, 11 and 12, Q20, Q33, Q34 and Q36, and the backlog's theme G. Sprint 4 left four ways to see detail: zooming into a group, zooming into a lane, expanding in place, and folding bands. In PM testing, expanding and folding did what zooming did, kept the rest of the board and its links in view, and were easier to find than zooming out with Esc. Zooming is also how you add the first card inside a group and move a card out of one, so those need new homes.
- Options: (a) replace zoom with expand and fold, and give adding and moving their own controls; (b) keep zoom as a secondary action beside expand; (c) decide after a session.
- Recommendation: (a). One way to look deeper, and it fixes the clumsy part of moving cards between groups.
- Status: answered 2026-10-02: (a). Details for sprint planning, engineering's defaults:
  - **Expand and fold are separate actions,** so an expanded group's children can be expanded in turn (the bug in theme G). E expands the selected groups; ⇧E folds the groups of the selected cards. The child count on a group card expands it.
  - **Moving cards into a group is a drag** (PM, 2026-10-02): hold a dragged card over another card for about half a second, and dropping puts it inside. Values never change on a nest, a quick drop still goes into the cell, and it works on a card with nothing inside yet (Q20).
  - **Moving a card out:** while a card that's in a group is dragged, a "Move out of X" strip appears at the top of the board, and dropping there moves it up a level.
  - **Inspector fallbacks:** a Group field moves the selected cards into a group or out to the top level, for targets that aren't on screen. "Add a card inside" adds a child to the selected card.
  - **Zoom goes:** group zoom, multi-zoom, lane zoom (Q43), the zoom bar's breadcrumb, and its drop-to-move-out. The group's own values, which the zoom bar showed (Q19), are in the inspector.
  - Built in sprint 5, slice 2, all but zoom's removal (slice 3). The hold delay is 0.5 s; the target gets a dashed outline, and the dragged card says "Put inside …". A card can't go inside itself, anything inside it, or the group it's already in. After a nest, the card leaves the board if its new group is folded, and the group is selected instead, so Delete can't reach a card you can't see. Double-clicking a frame's group expands it. The Group field searches every card by title, and each match says which groups it's in, so two cards with one title can be told apart. "Add a card inside" names the new card "New card" with its title ready to type over, and it takes the parent's values on the two axes shown.
  - Zoom removed in slice 3 (ADR 0013), along with lane zoom (Q43). "Show it on the board" in the inspector expands the groups around a card. A new card made by double-clicking is always at the top level; "Add a card inside" makes children.

### Q43: One axis choice per property
- Context: Requirements 1 and 7, Q34, and the backlog's theme G. With bands (ADR 0012), "System (area)" and "System (component)" show the same thing at two depths, and folding moves between them.
- Options: (a) one choice per property, showing its deepest level with every parent as a band, folded by default, with Fold all and Unfold all, and a click on a folded lane unfolding it; lane zoom goes; (b) keep a choice per level and lane zoom, and add fold all.
- Recommendation: (a). It's one control instead of two, and folding keeps the other areas and their links in view.
- Status: answered 2026-10-02: (a). For planning: views saved in a browser by level (`system:1`) fall back to the property, and their folded bands carry over.
  - Built in sprint 5, slice 3 (ADR 0013). The axis menu lists System and Time once each. Fold all and Unfold all sit beside each picker for a property with bands, and a folded lane's header ("4 components ▸") unfolds it. The edge lane is named for the top level ("No area"), and a parent's own lane for the level below ("No component"). Time order is judged by the lanes shown, so a folded quarter flags only across quarters. A browser that last showed "System (component)" opens with System unfolded, except the bands it had collapsed.

### Q44: "Related to" links
- Context: Requirement 15 and the backlog's theme F. Dependencies have one type, "comes before". Plans also have looser relationships worth seeing that don't imply an order. The "typed dependencies" out of scope for v1 are ordering types, such as finish-to-start; this one carries no order at all.
- Options: (a) a second, undirected kind of link, drawn dotted with no arrow, never judged for order or counted in ⚠, shown by the same focus rules as dependencies (Q14, Q39); (b) leave it to descriptions or a custom tag.
- Recommendation: (a).
- Status: answered 2026-10-02: (a). First agreed for the next sprint, then moved to sprint 6 when sprint 5 became a cleanup sprint, and to sprint 7 when find took sprint 6 (2026-10-03). Details for planning, engineering's defaults:
  - **Making one:** select two cards and press ⌥L. Order doesn't matter, and ⌥L again removes it.
  - **On the board:** dotted, with no arrow, drawn on hover and selection, and never red.
  - **In the inspector:** a "Related" list beside Comes after and Comes before.
  - **On import:** Jira's "Relates" link columns become related links.
  - **Plan files:** related links are stored beside dependencies. Older readers ignore them, so the file version stays at 1 (ADR 0005).
  - Moved again when first-visit work took sprint 7 (2026-10-07), and scheduled in sprint 8, slice 2 (PM, 2026-10-07).
  - Built in sprint 8, slice 2 (ADR 0005, amended). ⌥L relates the two selected cards, or with one selected starts a link finished on another, as L does. Lines are dotted in the accent color, with no arrow. They show the direct related links of the hovered card and of each selected card, never a chain, and a clicked one is removed with Delete. The inspector's links section, now called Links, lists them under Related. An import reads Jira's "Outward/Inward issue link (Relates)" columns, keeping each pair once. Ungrouping re-points them at each child, as with dependencies (Q21). The sample plan has five.

### Q45: Showing a card's copies
- Context: Requirements 3 and 15, and the backlog's theme E. A card in several lanes has a copy in each, often off screen. A card's dependency lines leave from whichever copy is closest, so its links can be split across copies.
- Options: (a) hovering or selecting any copy joins all its copies with a dashed line, no arrow, styled differently from related links, and shows the links from every copy; (b) only highlight the copies, as selection does now.
- Recommendation: (a).
- Status: answered 2026-10-02: (a). Sprint 5, slice 4.
  - Built in slice 4 (ADR 0011, amended). Copies are joined each to its nearest neighbor, dashed and gray with no arrow, and every copy gets a dashed outline. This works for the hovered card and for every selected card. Each dependency is still drawn once, from the copy nearest its other end; the joined copies show whose it is. Hovering *Seat sync from directory* shows both its copies and both its links.

### Q47: Selecting every card that matches
- Context: The backlog's theme G. "Expand every initiative" is a selection problem: select them all, then Expand. Filters (requirement 9) are deferred.
- Options: (a) ⇧-click a row or column header to select every card in that lane, so pivoting to Level and ⇧-clicking Initiative selects every initiative; (a′) ⇧-click a badge on any card to select every card with that value, in any pivot; (b) a "Select all like this" command that matches the selected card on a property you pick; (c) wait for filters, then ⌘A selects what's visible.
- Recommendation: (a) and (a′), plus ⌘A for every card on the board. They reuse what's on screen, and they work for any property, not just levels.
- Status: answered 2026-10-02: ⇧-click a badge on any card to select every card on the board with that value, in any pivot, so "every initiative" works without pivoting to Level. ⇧-click a row or column header to select its lane, and ⌘A to select everything on the board. Sprint 5, slice 2.
  - Built in slice 2. A badge showing several values ("Identity +1") selects by the first. A header's ⇧-click selects every card in the lane, its holding cell included, and a band's selects every lane under it. Only cards on the board are selected: the cards inside a folded group aren't, but those framed in a cell are. A notice says how many were selected.

### Q50: Typing / to find cards
- Context: Requirement 9 (filters, deferred), and the backlog's theme I. During a demo on 2026-10-03, a viewer asked to press / and type to narrow the board. Engineering's survey of the pattern (`docs/plans/sprint-6-plan.md`):
  - / focuses search in Gmail, GitHub, Linear and Jira.
  - Trello separates filtering cards in place (F) from searching across boards (/).
  - Miro's find dims everything that doesn't match.
  - Notion's and Slack's / opens a command menu, not search.
- Options: for cards that don't match, (a) dim them, (b) hide them, or (c) dim while typing and hide on Enter. For what's matched, (d) card text (title, Jira key, description), (e) text plus value names suggested as you type, or (f) `key:value` syntax. For timing, (g) after the sprint 3–5 tester session, or (h) before it.
- Recommendation: (a), (d) and (g). Dimming keeps the layout and links, which keeps spatial memory, and composes with selection: Enter selects the matches, and then E, L and the inspector act on them.
- Status: answered 2026-10-03: (a) and (d), as recommended, and (h): it ships before the session, as sprint 6. Hiding stays with requirement 9's filters.
  - Built in sprint 6, slices 1–2 (ADR 0014). Engineering's defaults:
    - / opens a bar under the toolbar, since a field in the toolbar didn't fit at 1440px; a magnifier button opens it too.
    - Every word typed must start a word on the card. Matching anywhere let "sso" find "processor".
    - Enter expands the groups that hide matches, and selects every match. Expanding stays outside undo, as it does with E.
    - ⌘F stays with the browser.
    - The words typed survive pivots, but not a reload.

### Q51: Starting a blank plan
- Context: Requirement 10, and the backlog's theme J. The empty board offered the sample plan, a plan file, or a Jira CSV. Someone with a new idea and nothing to import had to load the sample and delete it, or import a dummy file. Brain dumping was also slow: every card needed its own double-click, and after naming one, typing on fired shortcuts.
- Options:
  - **Fast entry.** (a) Enter, after naming a new card, starts the next one in the same cell, on any board; (b) only in a new blank plan; (c) no change, and only the button for now.
  - **What a blank plan holds.** (d) the generic values only: Size and Level as usual, with no areas or quarters; (e) also the next four quarters; (f) example areas and quarters to rename.
  - **Reset board.** (g) replace it with New blank plan; (h) keep both.
- Recommendation: (a), (d) and (g).
- Status: answered 2026-10-03: (a), (d) and (h). Reset board stays beside New blank plan.
  - Superseded in part by Q66 (2026-10-08): New blank plan makes a new plan rather than replacing the board, and Reset board becomes Delete plan.
  - Built 2026-10-03, as a slice before sprint 7. **Start a blank plan** is on the empty board, and **File › New blank plan** replaces a board after asking, in one undo step. The plan opens in Sequence × System with the first card's title ready to type.
  - Enter after a new card's title starts the next one. In a gap between sequence columns, the next card goes in the column the first one started. Esc, Enter on an empty title, or clicking away stops. Each card is its own undo step. Renaming doesn't chain.
  - Engineering's defaults:
    - First-visit help stays closed on a blank start, because it would cover the card being named. It isn't remembered as closed, so it still opens on the next visit.
    - With no rows (no areas yet), the bottom holding lane grows with its cards and scrolls with the board, rather than staying a short strip pinned to the edge. The right lane does the same with no columns.

### Q52: Showing the pivot
- Context: Requirements 1, 2 and 8, the "pivoting erases spatial memory" risk, and the backlog's theme K. Pivoting is the core bet, but it's two dropdowns, and the board redraws instantly. The sample opens in Sequence × System, which has unlabeled columns, so it doesn't read as a grid of two properties. Time × System does.
- Options: (a) a row of built-in perspectives above the board (Sequence, Roadmap = time × area, Sizing = size × level, Structure = level × area), one click each, with Rows and Columns kept for anything else; (b) keep the pickers and only animate; (c) both, and the sample opens on Roadmap.
- Recommendation: (c). The cards glide to their new places in about 300 ms, with reduced motion respected. The presets aren't saved views, so requirement 8 stays deferred. Opening on Roadmap shows the grid first; Sequence is one click away, and the guided start (Q53) can make that click the first step.
- Status: answered 2026-10-07: preset views, and pivots that are clearer. The audience to optimize for is a new user who finds the board from a public link or word of mouth.
  - Engineering's defaults, each reversible: the presets sit above the board, with Rows and Columns kept beside them for any other pair; a pivot animates, so cards visibly move; and the sample opens on Roadmap. Which presets ship is settled in sprint 7 planning.
  - Built in sprint 7, slice 1 (ADR 0015):
    - **The presets** are Sequence, Roadmap (Time × System), Sizing (Size × Level) and Structure (Level × System). They sit in a view bar under the toolbar, beside the Rows and Columns pickers, which moved there so the toolbar fits on one row at 1280px.
    - **Pivots** animate over about 320 ms, unless the browser asks for reduced motion, and lines wait until the cards land.
    - **The sample** opens on Roadmap.

### Q53: Teaching a first-time visitor
- Context: Requirement 10, Q7, and the backlog's theme K. First-visit help is a reference of about 30 entries that opens over the board as the sample loads. Nothing teaches once it's closed. The tester session demos first, so it can't see first-visit problems.
- Options: (a) keep the reference panel; (b) a guided start on the sample: three steps (switch perspective, drag a card, point at a card to see its links), each done by doing it, skippable; then the help becomes a cheat sheet grouped by goal; (c) (b), plus one-time hints when a feature first applies, such as "Hold Alt to add instead" on the first drag on a multi-value axis.
- Recommendation: (c), and a five-minute cold start before the demo in the next tester session, so its effect can be measured.
- Status: answered 2026-10-07: a guided start, but for someone starting from a blank plan rather than on the sample. It walks through the journey: dump ideas, start organizing them, start grouping them. The audience is a new user from a public link or word of mouth.
  - Engineering's defaults: each step finishes when it's done, not when it's read, and the tutorial can be skipped. The reference help becomes a cheat sheet grouped by goal, and stops opening by itself. One-time hints, as in (c), cover what the tutorial doesn't, such as Alt-drop. A cold start goes before the demo in the next tester session.
  - 2026-10-07: on the empty board, **Start a blank plan** becomes the primary button and starts the guided tour. The sample stays one click away.
  - Built in sprint 7, slice 6. A coach panel at the bottom right lists five steps, and each is ticked off by doing it on the board:
    1. type three ideas;
    2. make an area with "+ Add area";
    3. drag an idea into it;
    4. size a card in Sizing, then see it kept its area in Sequence;
    5. put one card inside another.
  - The last panel points to E, L and right-click, the cheat sheet, and the sample. It survives a reload while running. Loading another plan sets it aside, and once it's finished or skipped, a new blank plan doesn't offer it again.
  - Help opens only from "?", as a cheat sheet in seven groups. The hints are "Alt adds instead" while dragging, and "Press E, or click its count, to see what's inside" the first time a group is clicked.

### Q55: Structure for a blank plan
- Context: Requirements 10, 21 and 27, Q51, and the backlog's theme K. After a brain dump into a blank plan, the next step is sorting ideas into areas, but there are none. Areas are made only in the Properties panel. Typed cards also come out sorted by title, not in the order they were typed.
- Options: (a) "+ Add area" after the last row header and "+ Add quarter" after the last column, named inline, on every board; (b) only on a blank plan; (c) leave it to Properties, with a pointer in the empty message.
- Recommendation: (a). Keeping typed order needs an order within a cell, which is Q46: with its option (c), a plan-wide rank, a brain dump would fill the rank in typing order. Sequence keys can't do it, because each distinct key is its own column (Q8).
- Status: answered 2026-10-07: edit properties right from the headers, broader than (a). It's part of the blank-plan journey (Q53): organizing ideas means making the lanes to put them in.
  - Engineering's defaults: on every board, a row or column header can be renamed in place, and "+ Add" after the last header adds a value at that level. Moving and deleting values stay in the Properties panel until a session asks for more. Typed order waits for Q46.
  - Built in sprint 7, slice 2:
    - **Renaming:** double-click a lane or band header.
    - **Adding:** "+ Add area", or quarter, component, size, team, sits under each holding lane's name, "No area" and "No quarter", which stay pinned to the board's edges. It's also under each area's own "No component" lane.
    - **Naming:** the field stays open for the next name, says why a name can't be used, and unfolds the area it adds into.
    - **Typed order:** comes from Q46's MVP (slice 5).

### Q48: Dragging several cards
- Context: Requirements 2 and 3, and the backlog's theme H. With several cards selected, a drag moves only the card under the pointer today.
- Options: (a) every selected card gets the drop's values on both axes; on a multi-value axis, each card's value in the dragged copy's lane is replaced, or the value is added if the card has nothing in that lane; (b) every card keeps its offset from the dragged one, moving the same number of lanes.
- Recommendation: (a). It reads as "put these here", and it's one undo step. (b) breaks on cards with several copies, and at the edges of the board.
- Status: answered 2026-10-07: (a), as recommended. Sprint 7, with box select to pick up a run of cards.
  - Built in sprint 7, slice 5. A drag across empty space in a cell or holding lane draws a box, and ⇧ adds to the selection. Dragging any selected card moves the whole selection in one undo step; the dragged card says "+3 more", and a notice with Undo says where they went. Holding the selection over a card puts every card that can go inside it there. The move-out strip moves the selected cards that share the dragged card's group.
  - Engineering's default: E no longer selects the cards it reveals. Until now it did, so dragging one of them right after expanding, as sprint 5's own walkthrough does ("expand, then drag a child to Move out"), would have moved all its siblings too. The revealed cards are marked with their group's chip and edge instead, and the expanded group leaves the selection. Expanding a card inside, or collapsing one, now starts by selecting that card, as the sprint 5 exit criteria already do.
  - PM, 2026-10-07: keep it.

### Q57: One look for a group's cards
- Context: Requirements 12 and 13, Q16, Q33 and Q42, and the backlog's theme L. The board shows the cards inside a group in two ways:
  - **A collapsed group,** in a lane only its cards reach, is a dashed frame: the group's title and badges on top, and the cards that put it there inside (Q33).
  - **An expanded group** leaves the board, and its cards spread through the cells. Each one carries a colored chip and edge that name the group.
  - In the sample's Roadmap, expanding *Passwordless login* puts its three stories in two cells, between unrelated cards, linked only by a teal chip. Expanding *Public API v2* shows both patterns on one card: *API auth* is a frame, and it carries a pink chip.
- Options:
  - (a) **Frames for both.** A group in a cell is a frame: its header, then whichever of its cards show in that cell. Collapsed, it's a header alone where the group itself is placed (today's card), and a header with the cards that put it there everywhere else (today's faded frame). Expanded, its cards show in every cell they reach, under its header. Chips go.
  - (b) **Keep both, as one family.** The frame takes the group's color, as chips do, and nothing else changes.
  - (c) **Chips for both.** Drop frames, and mark the cards that put a collapsed group in a lane with chips. This undoes Q33: those lanes would show loose cards with no sign of the group.
- Recommendation: (a). Each group then has one look on the board, and it fixes three things:
  - A group's cards sit together in a cell, under its name, instead of being mixed in with other cards.
  - An expanded group's own values stay on the board. Today they're only in the inspector, so a ballpark quarter that disagrees with the children disappears when you look closer.
  - The header gets a ▾ that collapses the group. Today Collapse has no control on the board; you select a child and press ⇧E.
- Engineering's defaults, each reversible:
  - **Collapsed or expanded:** dashed frames are collapsed and solid ones expanded. The difference left is the group's own lanes: collapsed, they show its header alone; expanded, its cards too.
  - **Nesting:** frames nest two deep. A group expanded deeper than that joins its parent's frame, with a two-part title ("Public API v2 › API auth"), so the board's 230px columns keep room for cards. The PM chose three (below).
  - **Order in a cell:** a frame sits where its first card would sort (sequence, then rank; Q46), and its cards keep that order inside it.
  - **The cost:** a header repeats in every cell the group's cards reach, as chips do today, but a header takes a line of its own. It's one line, and the group's badges show only where the group itself is placed.
  - **Effort:** one slice. The layout already builds frames for collapsed groups (ADR 0008, amended), and expanded groups would use the same structure. ADR 0008 gets another amendment.
- Status: answered 2026-10-07: (a), frames for both, nesting three deep. A group expanded below the third level joins the third frame, with a breadcrumb title ("Public API v2 › API auth › Token rotation"). Scheduled in sprint 8, slice 1.
  - Built in sprint 8, slice 1 (ADR 0008, amended). Where the group itself is placed, its own card heads the frame, and its count reads "4 ▾" and collapses it. Elsewhere the header is its name, with a ▾. A frame sits where its first card would sort. The breadcrumb names the groups from the third level down ("EU Kafka cluster › Broker sizing"), above the deeper group's own card.

### Q58: Shared plans, and your own
- Context: Requirements 10, 28, 29 and 30, Q26 and Q51, and sprint 9's research (`docs/research/collaboration/`). Opening a plan file, importing a CSV and New blank plan each replace the board. On a shared board they'd replace it for everyone. In the merge harness, one person's offline "New blank plan" wiped the shared board for everyone (O3), and an offline "Open" left a mix of the file and the shared board (O2). Today a browser holds one board.
- Options: (a) on a shared plan, Open, Import and New each make a **new** plan, and the File menu lists your plans, shared ones and ones only on this computer; replacing the shared plan stays possible as a second, warned choice, for restoring a backup; (b) the same, with no way to replace a shared plan; (c) keep replacing, behind a confirmation.
- Recommendation: (a). It needs more than one board per browser, which is useful on its own (a scratch plan beside the real one). Mockup: artboard 8.
- Status: answered 2026-10-08: (a). On a shared plan, Open, Import and New blank plan make a new plan; replacing the shared plan stays as a second, warned choice. M2 sprint 10.
  - Built in sprint 10, slice 2, on every plan (Q66): the File menu lists your plans, and Open, Import, New blank plan and Load sample plan each make a new one (ADR 0021). The warned "replace the shared plan for everyone" comes with sharing, in sprint 11.
  - Built in sprint 11, slice 3: on a shared plan you can edit, **File › Replace this shared plan from a file…** warns that everyone with the link will see the file’s plan instead. It’s one undo step.

### Q59: Coming back after working apart
- Context: Requirements 31 and 19, and the PM's question for sprint 9: the relay is on a company network, someone drops off the VPN for a while, and both sides keep editing. Should the merge be reviewed, or prevented? Sprint 9 found:
  - every shipped tool merges automatically;
  - Ink & Switch moved away from reviewing drafts before a merge;
  - with four schema changes, our merges are predictable (`merge-scenarios.md`);
  - blocking edits while offline turns a VPN blip into lost work.
- Options: (a) offline is always allowed and merges automatically; on reconnecting, "Since you were away" marks what others changed on the board and lists your changes that didn't stick, each with "Use mine" or "Restore"; (b) a review step before your offline changes merge; (c) read-only while the relay can't be reached; (d) (a), plus an opt-in "Keep my changes as a scenario instead", once scenarios exist.
- Recommendation: (a) now and (d) later. The connection pill says plainly what offline means ("7 changes not shared yet"). Mockups: artboards 4 and 5.
- Status: answered 2026-10-08: (a). Offline is always allowed and merges automatically, and "Since you were away" shows what happened. (d), keeping offline changes as a scenario, waits for scenarios. M2: the connection pill in sprint 11, "Since you were away" in its own sprint (Q65).
  - The connection pill built in sprint 11, slice 4: Live, Reconnecting… after 3 seconds, and Offline with the number of cards not shared yet, louder after an hour or 25 cards ("Others may be changing the same cards").

### Q60: Two people reaching for one card
- Context: Requirements 2, 3 and 31. In a live session, two people can drag the same card within the same second. Today's schema leaves a single-valued property holding two values (L1 in `merge-results.md`). After the schema change, one value wins.
- Options: (a) no locks: a card being dragged shows "Ada is moving this → Q3 · Billing" to everyone, a second person's drag ghost warns them, the later drop wins, and both people are told, each with a one-click way back; (b) a soft lock: others can't pick up a card someone holds; (c) silent last-writer-wins, as Figma does.
- Recommendation: (a). Locks need a server that knows who holds what, which ours can't, and a sleeping laptop would strand them. Showing intent prevents most collisions, and the notices handle the rest. Mockup: artboard 2.
- Status: answered 2026-10-08: (a). No locks: drag intent shows on the card, the later drop wins, and both people are told, with a way back. M2 sprint 12.

### Q61: What people see of each other
- Context: Requirement 32 (presence and cursors), the M1 assumption that one person drives while others watch, and the PM's question for sprint 9. People can be in different views, so a cursor's screen position means nothing on someone else's board.
- Options:
  - **Presence:** (a) pointers, selections and drags, anchored to cards, each with a name and color, plus avatars; (b) avatars only.
  - **Quieting it:** (c) a cursor setting (Everyone, Driver only, None); (d) none.
  - **Following:** (e) "Ask everyone to follow me" takes followers to the driver's view, with "Not now" and "Stop following"; (f) no following.
  - **Names:** chosen once per browser, and asked for the first time someone shares or joins.
- Recommendation: (a), (c) and (e). The spike showed card-anchored presence works across pivots, and following a view, not just a scroll position, is what a pivoting board needs. Mockups: artboards 1 and 3.
- Status: answered 2026-10-08: (a), (c) and (f). Card-anchored pointers, selections and drags, avatars, and the cursor setting (Everyone, Driver only, None). No following. M2 sprint 12.

### Q62: Who can open a shared plan
- Context: Requirement 30, the fixed rule that the relay never reads plan content, and the out-of-scope list (no accounts or permissions). The link is the key. Sprint 9's relay accepted an update from someone holding the wrong key, because it can't tell. Write tokens fix that, and also make view-only links possible.
- Options: (a) "Can edit" and "Can view" links, and "Make new links" to revoke, which says that people with old links keep what they already saw; (b) edit links only; (c) passwords on top of links.
- Recommendation: (a). It's the only access control end-to-end encryption allows cheaply, and it needs no accounts. Mockup: artboard 7.
- Status: answered 2026-10-08: (a). "Can edit" and "Can view" links, and "Make new links" to revoke. M2 sprint 11.
  - Can edit and Can view links built in sprint 11, slice 3 (ADR 0018, amended). "Make new links" comes in sprint 12.

### Q63: History: what's kept, and for how long
- Context: Requirements 31 and 32, and the PM's priority for sprint 9: knowing who changed what. Yjs records no lasting authors, so history is our own log, kept in its own encrypted document beside the board's. Names are self-chosen and times come from each person's clock, so it's a courtesy, not an audit trail.
- Options: for what's shown, (a) an Activity feed for the plan plus a History tab in the inspector, (b) Activity only, or (c) "last changed by" only. For how long it's kept: 30 days, 90 days, or forever.
- Recommendation: (a), kept for 90 days, with deletions restorable from Activity. Forever grows without bound, at about 60 bytes per change. Mockup: artboard 6.
- Status: answered 2026-10-08: (a), kept forever, "with at least timezone normalization".
  - Engineering's reading of the time zones:
    - every entry stores an instant in UTC, never a local time;
    - each viewer sees times in their own time zone ("10:42" for Ada in Berlin is "09:42" for Bo in London);
    - anything older than a day shows its date.
  - Beyond the minimum, engineering's default: the relay stamps each update with the time it received it, which it already knows. That puts a wrongly set laptop clock right, and it reveals nothing about the plan.
  - Kept forever means the history document grows without end, at about 60 bytes per change: about 6 MB after 100,000 changes _(priors)_. It loads after the board, never before, so it can't slow opening a plan, and its snapshots keep catching up fast. ADR 0020, amended.

### Q65: M2's scope, as the research reshapes it
- Context: Requirements 30–32 and the M2 milestone. Sprint 9 found that M2 needs more than requirements 30–32 say, if collaboration is to be trusted. The candidates, all recommended:
  - **view-only links** (Q62);
  - **"Since you were away"** (Q59);
  - **history** (Q63);
  - **following** (Q61);
  - **more than one plan per browser** (Q58).

  It also found that a schema change has to come first.
- Options: (a) add these to the requirements as M2 items, with the build plan in `docs/plans/m2-plan.md`; (b) keep M2 at requirements 30–32, and leave the rest for later.
- Recommendation: (a). Without "since you were away" and history, the PM's three priorities (live collisions, who changed what, offline divergence) are answered only by "it merges". The build plan is four sprints, each ending in something usable.
- Status: answered 2026-10-08: (a), with "since you were away" and history as additional sprints. M2 is now five sprints (`docs/plans/m2-plan.md`): foundations, the relay, seeing each other, then history, then "since you were away". Following is out (Q61). The requirements gain 33–36.

### Q64: A relay for the public demo
- Context: Requirement 30, Q31, and Q52 and Q53 (optimize for strangers arriving from a public link). GitHub Pages can't run a relay. The PM left this for after the research (2026-10-08). The options are costed in `docs/research/collaboration/relay-and-sync.md`.
- Options: (a) a hosted demo relay, with quotas, expiry and a privacy note; (b) peer-to-peer over WebRTC, which has no stored snapshots, so it fails requirement 30; (c) self-host only; (d) (c), plus two tabs of one browser syncing, with no server.
- Recommendation: (d) as M2 is built, then (a) once M2 is solid, so a stranger's first share works well. (a) is cheap, but someone has to keep it running, so it's the PM's call.
- Status: answered 2026-10-08: support (e) and (f), and no WebRTC.
  - **The PM, 2026-10-08:** "Is there an option for recommending use a relay, including a self-hosting option, but falling back to WebRTC (e.g., for enterprise users whose security policy prevents use of the hosted relay, but who need to show adoption/usage/value to justify self-hosting)?"
  - **Engineering's answer: yes, it's possible, but WebRTC is weakest in exactly that case.**
    - WebRTC needs a signaling server to introduce two browsers before they can talk directly _(recalled)_. A policy that blocks our hosted relay will usually block a hosted signaling server too.
    - Corporate networks often block the UDP traffic WebRTC prefers. Getting through then takes a TURN server, which is another relay _(recalled)_.
    - WebRTC stores nothing, so it only works while people are online together. Requirement 30's asynchronous case (a PM proposes, an EM answers days later) fails.
    - Two people on the same office network can usually connect directly _(priors)_, but they still need signaling.
  - **Two fallbacks fit "prove the value before IT approves a server" better, and both reuse what M2 already builds:**
    - **(e) Host from your laptop.** The relay is one Go binary that also serves the app, so a pilot user runs it on their own machine, and colleagues on the same network open its address. It's real collaboration, live and asynchronous while the laptop is on, and it's exactly what self-hosting will be, so a successful pilot becomes the self-hosted install. The catch is that many companies' policies cover running a server on a laptop too.
    - **(f) Changes by file.** A Yjs document merges any updates, in any order, so a shared plan can travel as an encrypted "changes file" through channels the company already approves: email, a shared drive, chat. Each person opens the file, their board merges it, and they send their own changes back. It's slower, and needs no server at all. It covers the asynchronous case, which WebRTC can't.
  - **Revised recommendation:**
    - Recommend a relay: hosted, or self-hosted from the start for companies that can.
    - For pilots blocked from both, offer (e), with (f) as the no-server last resort.
    - Leave WebRTC out unless pilots show (e) and (f) aren't enough.
    - The order is unchanged: (d) during M2, then (a). (e) comes for free with the relay in sprint 11. (f) is about a slice, and fits after sprint 11.
  - Engineering's reading, as a reversible default: the PM's question framed a relay, hosted or self-hosted, as what's recommended, with fallbacks for companies that can't use one. So the order stays:
    - (d), two tabs, during M2;
    - (e), the relay from a pilot's laptop, with the relay in sprint 11;
    - (f), changes by file, in sprint 12;
    - (a), a hosted demo relay, once M2 is solid, in sprint 14.

    If the PM doesn't want to run a hosted relay at all, sprint 14's slice drops, and the public build offers (d), (e) and (f).
  - It becomes requirement 37 and an amendment to ADR 0017.

### Q66: What Open, Import and New do on a plan that isn't shared
- Context: Requirement 34 and Q58 cover shared plans: Open, Import and New blank plan make a new plan, so nobody overwrites a shared board. Sprint 10 brings several plans per browser before anything is shared, so local plans need a rule too. Today these replace the board after asking (Q26, Q51).
- Options: (a) always make a new plan, with Load sample plan opening the sample as its own plan, and Reset board becoming Delete plan, with Undo; (b) replace on local plans, as today, and make a new plan only on shared ones; (c) ask each time.
- Recommendation: (a). One rule everywhere, and nothing overwritten by accident.
- Status: answered 2026-10-08: (a). Sprint 10, slice 2. Supersedes the replacing in Q26 and Q51.
  - Built in slice 2 (ADR 0021). Each new plan is filled outside undo, so undo doesn't reach back across it; the plan you were on stays in the File menu. An untouched empty plan, one nobody has named, is replaced rather than kept. Delete plan offers Undo for 8 seconds.

### Q67: Where the plan list lives
- Context: Requirement 34. With several plans per browser, people need to see and switch between them. Optimizing for a first-time visitor from a public link (Q52, Q53) argues against an extra step on arrival.
- Options: (a) the File menu lists your plans, and the toolbar shows the current plan's name, renamed by clicking it; the app opens the plan used last; (b) a "Your plans" home screen on start; (c) both.
- Recommendation: (a). No new step for a first visit. It matches mockup artboard 8.
- Status: answered 2026-10-08: (a). Sprint 10, slice 2.
  - Built in slice 2 (ADR 0021): *Your plans* in the File menu, last opened first, with a ✓ on the open one; the toolbar shows the name, renamed by double-click, and so does the browser tab. Each plan remembers its own view, foldings and expanded groups, and the link names it (`#plan=…`).

### Q68: What Share does to the plan you're on
- Context: Requirements 30 and 34, Q58, and artboard 7. The sprint 9 mockup had Share make a shared copy and open it, leaving your own copy beside it. That assumed one board per browser; sprint 10 brought several plans (ADR 0021).
- Options: (a) the plan you're on becomes the shared plan, marked as shared in File › Your plans; (b) Share makes a shared copy and opens it, and your own plan stays beside it, unshared.
- Recommendation: (a). One plan, one name, and no copy drifting apart from the shared one. A private version is a saved file away.
- Status: answered 2026-10-08: (a). Sprint 11, slice 3.
  - Built in slice 3. File › Your plans lists the shared plan where it was; the toolbar shows its connection pill.

### Q69: How the relay reaches people
- Context: Requirements 30 and 37, and Q64 (e). GitHub Pages can't run a relay, so accepting sprint 11, and any pilot, means running one somewhere.
- Options: (a) CI builds the relay, with the app inside, for Mac, Linux and Windows as downloads, and publishes a container image on each merge to `main`; (b) a container image only; (c) build from source.
- Recommendation: (a). A pilot user downloads one file and runs it; IT runs the container.
- Status: answered 2026-10-08: (a). Sprint 11, slice 1.
  - Built in slice 1. CI builds the relay for five targets on every run; after CI passes on `main`, `release.yml` publishes the `relay-latest` downloads and `ghcr.io/zjs/planning-board`.

### Q70: Sharing from a build the relay doesn't serve
- Context: Requirement 30 and Q64. The relay serves the app, so its links point at the relay's own address. The public build on GitHub Pages, and the HTML file opened from disk, have no relay until sprint 14's hosted one.
- Options: (a) Share asks once for a relay address, such as a laptop's or a company's, and remembers it; (b) Share is offered only when the app was opened from a relay.
- Recommendation: (a). Share works from every build.
- Status: answered 2026-10-08: (a). Sprint 11, slice 3. From the public build, which is served over https, the relay must be `https` or `localhost`; the dialog says so and offers to open the app from the relay instead.
  - Built in slice 3. A relay that served the page is used without asking; anywhere else, Share asks for the address, checks the relay answers, and remembers it.

### Q71: Who the driver is
- Context: Requirement 32 and Q61: the cursor setting has a "Driver only" choice, and nothing said who the driver is.
- Options: (a) claimed by clicking "I'm driving", one at a time, a new claim taking over; (b) whoever shared the plan, always; (c) drop "Driver only", leaving Everyone and None.
- Recommendation: (a). It suits a live session, where whoever is presenting changes, and needs no server.
- Status: answered 2026-10-08: (a). Everyone sees who's driving, and with nobody driving, "Driver only" shows no pointers. Sprint 12, slice 1.

### Q72: How a changes file's key travels
- Context: Requirement 37 and Q64 (f). A changes file is encrypted with the plan's key, for companies where no relay is allowed, but someone has to get the key the first time.
- Options: (a) Share by file makes the plan's key and gives a short Can edit link, sent once by a second channel, and files carry no key; (b) the first file carries the key, so one email is enough; (c) a password the sender picks.
- Recommendation: (a). A forwarded or misfiled attachment is unreadable, and nothing new has to be remembered.
- Status: answered 2026-10-08: (a). Sprint 12, slice 4 (ADR 0022).
