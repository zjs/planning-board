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

### Q1: Is a modifier-key drop discoverable enough for adding a value?
- Context: Requirement 3. Dropping with a modifier adds a value to a multi-valued property instead of replacing one.
- Options: modifier key only; a visible "add to lane" control on hover; both.
- Recommendation: build the modifier drop in sprint 0 and watch whether testers find it in the user session.
- Status: open. Built in slice 2: ⌥ Option / Alt, with a "+ add" badge on the drag ghost and a line in the on-screen help. One known snag: some Linux window managers take Alt-drag for themselves (ADR 0007), which is another argument for a visible control. The session script has a task for this.

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

### Q8: How does the sequence axis get new columns?
- Context: Requirements 2 and 6, sprint 0 walking skeleton. Sequence is an unlabeled layout position, so there's no fixed list of columns to drop into. This sits at the center of the "drag writes values" bet.
- Options: (a) columns are the distinct sequence values in use, plus a thin drop gutter between columns and at each end, and dropping in a gutter creates a new column; (b) a fixed grid of N columns with empty ones allowed; (c) free horizontal placement with no columns.
- Recommendation: (a). Values are fractional ordering keys, so inserting never renumbers other items, and empty columns disappear on their own. (b) keeps showing empty slots that read as "planned gaps". (c) turns cells into pixel positions, which the requirements rule out ("remembering card positions within a cell").
- Status: open. Built (a) in slice 3: while you drag, a dashed guide shows each gap, and the gap under the pointer turns into a solid bar. Works when sequence is on the rows too.

### Q9: Should cards show their non-axis values in sprint 0?
- Context: Requirement 4 isn't in the sprint 0 deliverables. But the exit criterion is "drag cards and watch values change". Right after a drag in sequence × system, the card doesn't show which quarter it's in, so the only way to check is to pivot.
- Options: no attributes until sprint 1; a minimal badge row (size, quarter, system count); a click-to-inspect panel.
- Recommendation: the minimal badge row. It's small, it's read-only, and testers need it to trust what the drag did.
- Status: open. Built in slice 3. Badges show size, then time, then system. A property on an axis is skipped unless the card's value is more precise than the axis shows (a release in a quarter view, a component in an area view), so a drag can't quietly lose precision. Several values show as "first +N", and the tooltip lists them all. A release shows as its own label ("27.4"), and the tooltip gives the full path ("Q2 2027 › 27.4").

### Q10: Dropping a card from the holding area when it already has a value on one axis
- Context: Requirements 2, 3, and 5. A card sits in the holding area if it's missing a value on either axis, but it may still have values on the other one. In time × system, a card tagged Identity with no quarter sits in holding. If it's dropped in the Billing row, Q2 column, should it lose Identity? Slice 2 needs an answer.
- Options: (a) replace: the card ends up in exactly the cell where it was dropped; (b) on a multi-valued axis, add the dropped lane to the existing values and keep the old ones, while single-valued axes are replaced; (c) only fill the missing axis and ignore the other.
- Recommendation: (b). Nothing is lost silently, and for single-valued axes it's the same as (a). The catch is that after the drop the card also shows in its old lane, which may surprise people. The user session will tell.
- Status: open. Built (b) in slice 2.

### Q11: What does dropping a card on the holding area remove?
- Context: Requirement 3 says "dragging a copy to the holding area removes only that value", but a card in a cell has a value on *both* axes. In time × system, dropping a card on the holding area could mean "we don't know when" (clear the quarter) or "not this component" (clear the lane).
- Options: (a) always clear the multi-valued axis; (b) clear both axes; (c) when a drag starts, the holding area shows two drop zones, one per axis, such as "Clear sequence position" and "Remove Billing".
- Recommendation: (c). It's explicit, and it covers both intents. The cost is a slightly busier holding area during a drag.
- Status: open. Built (c) in slice 2.

## Answered

### Q5: Where do builds go so the PM can click through them?
- Context: The repo is private with no Pages site. The sprint doc asked for a static URL on every merge.
- Options: public repo + GitHub Pages; private + paid Pages; Cloudflare/Netlify previews; local only.
- Recommendation: public + Pages.
- Status: answered 2026-09-26: keep the repo private for now and move to public + Pages later. The PM will sort out private hosting. Until then, CI builds one self-contained HTML file for every PR and `main` push and attaches it as a workflow artifact.

### Q6: Who merges to `main`?
- Status: answered 2026-09-26: engineering merges once CI is green and self-review is done. The PM accepts on the build.

### Q7: In user sessions, who drives?
- Status: answered 2026-09-26: both. The PM demos first, then hands over to testers. The build needs an on-screen legend for gestures, and it has to work in testers' own browsers (the single HTML file can be sent to them directly).
