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

### Q4: What happens to cards placed in a view when an axis value is deleted?
- Context: Requirement 27 lets users edit property values, such as removing a release.
- Options: the cards lose that value and move to the holding area; deletion is blocked while cards use the value; the cards move to the parent value in the hierarchy.
- Recommendation: move to the parent value when there is one, otherwise to the holding area. It keeps information and never blocks the user.
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

### Q20: How does a plain card become a group, so an epic can be decomposed?
- Context: Requirements 11 and 12, the "Group" definition ("decomposing an item means turning it into a group"), and Q15. As built in slice 2, ⌘G adds cards to a card only if it's already a group. With a plain epic plus some stories selected, ⌘G makes a *new* group containing all of them, including the epic, which is the wrong shape for decomposing.
- Options: (a) in slice 3, let any card be zoomed into, not just groups, and treat a card with no children as an empty group you can add child cards to (once it has one child, ⌘G can move more cards into it); (b) a second shortcut, such as ⌥⌘G, that puts the selection inside the card you clicked last; (c) a "Move into…" command that picks the target from a list.
- Recommendation: (a). Decomposing usually means writing new child cards, which (a) covers directly, and it adds no new gesture. The cost is that moving existing cards into a plain card takes two steps: create one child first, then ⌘G.
- Status: open. Slice 3 builds (a) unless you say otherwise.

### Q21: What happens to a group's dependencies when it's ungrouped?
- Context: Requirements 11 and 15. Ungrouping removes the group card, but other cards may depend on it, or it on them. Dependencies aren't visible until sprint 2, but ungrouping already has to do something with them.
- Options: (a) re-point each link at every child ("X before the epic" becomes "X before each of its parts"); (b) drop the links; (c) keep them on a hidden, deleted group.
- Recommendation: (a). It keeps every ordering constraint the plan had, and it's what decomposing an epic means (the "Group" definition in `requirements.md`). The catch is that one link can become many; the dependency UI will show whether that's noisy.
- Status: open. Built (a) in slice 2; one undo restores the original links.

## Answered

### Q1: Is a modifier-key drop discoverable enough for adding a value?
- Context: Requirement 3. Dropping with a modifier adds a value to a multi-valued property instead of replacing one.
- Options: modifier key only; a visible "add to lane" control on hover; both.
- Recommendation: build the modifier drop in sprint 0 and watch whether testers find it in the user session.
- Status: answered. Sufficiently discoverable, especially with the help menu that opens automatically and can be re-opened as needed.


### Q5: Where do builds go so the PM can click through them?
- Context: The repo is private with no Pages site. The sprint doc asked for a static URL on every merge.
- Options: public repo + GitHub Pages; private + paid Pages; Cloudflare/Netlify previews; local only.
- Recommendation: public + Pages.
- Status: answered 2026-09-26: keep the repo private for now and move to public + Pages later. The PM will sort out private hosting. Until then, CI builds one self-contained HTML file for every PR and `main` push and attaches it as a workflow artifact.

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
