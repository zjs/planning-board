# Backlog

Feedback and ideas, grouped into themes. A theme that needs a product decision links to its entry in [`questions.md`](questions.md). Once a theme is scheduled, it moves into a sprint doc (`docs/sprint-N.md`), and its entry here says so.

How things flow:

1. **Feedback** comes from user sessions, the PM's own testing, and [GitHub issues](https://github.com/zjs/planning-board/issues).
2. It's recorded **here**, under a theme.
3. If a product decision is needed, it becomes a **question**.
4. It's scheduled in a **sprint doc**.

Each feedback item says where and when it came from. Themes are generalized from the feedback rather than copied, so one theme can answer several requests.

## Themes

### A. The card hierarchy is invisible on the board

Cards can be nested to any depth (requirement 11). But on the board, a story that has no parent yet looks exactly like an initiative with no children yet, and a collapsed group hides which of its children put it in a lane. That's fine while brainstorming, but it's a gap once people start arranging the plan.

**Feedback** (PM testing, 2026-10-01):

- *Turning a card into a group, or showing its level.* "Someone thinking in stories, epics, and initiatives may want to tell apart a story that doesn't have a parent yet from an initiative that doesn't have children yet. Right now both look like individual cards. That's a feature while brainstorming, before things are sized, but it feels like a gap once you're arranging things."
- *Zooming into several groups at once.* Select several groups and zoom into all of them together, with some sign of which cards belong to which parent.
- *Faded group copies.* A faded "via children" copy of a group should show which children it stands for, without zooming in. One suggestion was a faded parent containing the real child.

**Generalization:**

- **A card's level** is something to record and show, not something inferred from whether it has children. An explicit "is a group" flag would contradict the children whenever the two disagree. Q20 already lets any card be zoomed into and given children. → [Q32](questions.md#q32-card-levels)
- **Show children in context.** Multi-group zoom and frames around faded copies are two forms of one feature: seeing a group's children on the current board, marked with their parent. → [Q33](questions.md#q33-showing-children-in-context)

**Lands:** shipped in sprint 4 (slices 2 and 4).

### B. Hierarchical axes should show their parents

With components or releases as an axis, the areas or quarters above them disappear. Cards tagged with an area but no component all wait in one "No component" lane at the edge of the board, far from their area.

**Feedback** (PM testing, 2026-10-01):

- *Show the parent level beside the child level.* With component rows, put an area column to their left, each area spanning its components. Cards assigned to an area but no component should sit in a "no component" lane for that area, not at the very bottom. This supports two-stage sorting: bucket cards by area, then go area by area and bucket by component.

**Generalization:** nested axis headers, with a holding lane for each parent. A drop in an area's "no component" lane gives the card that plain area, the same rule as inside a lane zoom (Q22). This could replace, or sit beside, clicking a header to zoom (requirement 7). It's the biggest layout change since sprint 0, and it will need an ADR. → [Q34](questions.md#q34-nested-axes)

**Lands:** shipped in sprint 4 (slice 3).

### C. Edit a card where it is

Dragging into a cell is the core bet, and it's the fastest way to sort many cards. It's slow for one card: sizing a single new card means pivoting to Size, dragging, then pivoting back. Renaming a group is hard to find.

**Feedback** (PM testing, 2026-10-01):

- *Setting a property without pivoting.* "You can set size by pivoting and then dragging, which is great when you're sizing a batch of cards. But if you add another card later, you might want to quickly size it and keep going."
- *Renaming a group.* "How do you edit the name of a group? Double-click opens the group." Pressing Enter on a selected group renames it today, but nobody finds it. The sprint 1 plan flagged this as a known gap ("double-click does three jobs").

**Generalization:**

- **A card inspector**: select one or more cards and edit any property in a side panel. It's also a home for already-deferred items: descriptions, the Jira key, and later a card's dependencies. It complements dragging rather than replacing it. → [Q35](questions.md#q35-editing-a-card-without-pivoting)
- **Give double-click one job** across the board, and give zooming a visible control. → [Q36](questions.md#q36-double-click-does-three-jobs)

**Lands:** renaming groups shipped in sprint 3 (slice 1). The inspector shipped in sprint 4, slice 1.

### E. A card's copies are hard to follow

A card in several lanes has a copy in each (requirement 3). On a board the size of the sample plan, the other copies are often off screen. Selecting a card highlights every copy, but you can't see the ones that aren't in view. Dependency lines go from whichever copy is closest, so a card's links can leave from different copies.

**Feedback** (PM testing of sprints 3 and 4, 2026-10-02):

- *Lost duplicates.* After adding Billing to *Least-privilege default role* from the inspector, the new copy was easy to lose. "Now that we have dependencies show on hover, perhaps we should consider having something happen when hovering over a card that has duplicates. Should they be connected by dotted or dashed lines, perhaps without arrows?"
- *Links split across copies.* *Seat sync from directory* has its incoming links on one copy and its outgoing links on its Billing copy. That can carry nuance ("the Billing work comes before the pen-test remediation"), but "when hovering on one card, the links to its duplicates should probably be shown as well."

**Generalization:** a card is one thing however many copies it has. Hovering any copy shows every copy, joined by a dashed line without arrows, along with the links from all of them. → [Q45](questions.md#q45-showing-a-cards-copies)

**Lands:** sprint 5 ([`docs/sprint-5.md`](sprint-5.md), slice 4).

### F. Links other than "comes before"

Dependencies have one type: A comes before B (requirement 15). Plans also have looser relationships that people want to see without implying any order.

**Feedback** (PM testing, 2026-10-02):

- *"Related to" links.* "We may need other types of links, including 'related to' rather than just 'comes before' and 'comes after'. Perhaps these could also be shown as dotted or dashed lines without arrows", styled differently from the lines joining a card's copies.

**Generalization:** a second kind of link that's undirected and never judged for order. It's not one of the typed dependencies that are out of scope (finish-to-start and the like), because it carries no ordering at all. → [Q44](questions.md#q44-related-to-links)

**Lands:** sprint 6 candidate. It was agreed for the next sprint, then moved when sprint 5 became a cleanup sprint (PM, 2026-10-02).

### G. One way to look deeper: expand and fold, not zoom

Sprint 4 added three ways to see more detail: zooming into a group or a lane, expanding groups in place, and folding bands. Testing suggests that expanding and folding cover what zooming did, keep the surrounding context and links in view, and are easier to discover than zooming out with Esc.

**Feedback** (PM testing, 2026-10-02):

- *Two pivot choices per property feel redundant.* "With the row-/column-span hierarchy in 'System (component)' or 'Time (release)', it doesn't seem necessary to include both hierarchy levels in the pivot selection process. However, it'd be helpful to have some way to fold/unfold all rows or columns."
- *Small fold targets.* "The click target for folding/unfolding is small. If a row is folded, maybe clicking on 'N components' should unfold?"
- *Lane zoom.* "Maybe it's no longer necessary to be able to zoom into a parent property (like component or release); unfolding seems very similar, and more powerful. Zooming reduces clutter, but essentially hides information including links. Plus, it seems easier to discover unfolding than the esc-to-zoom-out."
- *Group zoom (Q36).* "Do we need to be able to zoom into a group at all, or could we replace this with a more complete set of functionality around 'expand'? It seems like this might not only address the double-click gesture in particular, but simplify the set of operations for users to understand."
- *Bulk expand.* "Now that we have levels, it might be interesting to have some sort of bulk version. E.g., expand all initiatives so that we're looking at the epic-level view." Possibly by selecting every card that matches an attribute, then **Expand**.
- *Expanding inside an expansion folds instead (bug).* Expanding an initiative and then pressing E on one of its epics folds the initiative back, because E on an expanded child means "fold its group". "Perhaps expand/contract need to be separate operations?"

**Generalization:**

- **Expand and fold replace zoom** for groups and for lanes. The two things only zooming does today, adding the first card inside a group and moving a card out of one, need homes of their own (theme H). → [Q42](questions.md#q42-replace-zooming-with-expand-and-fold)
- **One axis choice per property.** Folding sets the depth, with Fold all and Unfold all controls, and a click on a folded lane unfolds it. → [Q43](questions.md#q43-one-axis-choice-per-property)
- **Expand and fold are separate actions**, so an expanded group's children can be expanded in turn. This fixes the bug. → [Q42](questions.md#q42-replace-zooming-with-expand-and-fold)
- **Select every card that matches**, so a bulk expand is: select every initiative, then Expand. → [Q47](questions.md#q47-selecting-every-card-that-matches)

**Lands:** sprint 5 (slices 2 and 3), including the bug and selecting every match (Q47).

### H. Arranging and moving cards

Dragging writes values (the core bet), but some arranging is still awkward: the order of cards within a cell, moving several cards at once, and moving cards between groups.

**Feedback** (PM testing, 2026-10-02):

- *Order within a cell.* "When sequence isn't an active dimension, could it be used to sort cards within a cell, and to allow them to be re-arranged within a cell? (Instead of sorting alphabetically?)"
- *Dragging a selection.* "It'd be useful to be able to multi-select and then drag-and-drop."
- *Moving between groups.* "The inspect panel simplifies a variety of editing operations, but moving items out of a group or between two groups is still a little cumbersome."

**Generalization:**

- **A card's place within a cell** is an order the plan keeps, one for the whole plan rather than one per view, which stays out of scope. The catch is that sequence is already a layout: its keys define the sequence view's columns. → [Q46](questions.md#q46-order-within-a-cell)
- **Dragging a selection** moves every selected card, with the same drop rules as one card. → [Q48](questions.md#q48-dragging-several-cards)
- **Moving a card into a group is a drag:** hold it over the group to put it inside, or drop it on a "Move out" strip. A Group field in the inspector is the fallback for targets that aren't on screen. → [Q42](questions.md#q42-replace-zooming-with-expand-and-fold)

**Lands:** moving between groups in sprint 5 (slice 2). Order within a cell (Q46) and dragging several cards (Q48) are sprint 6 candidates.

### D. Small fixes

No decision needed. Each one goes into the next sprint. The first two shipped in sprint 3.

| Item | Source | Lands |
|---|---|---|
| Double-click a gap between sequence columns to create a card in a new column. Today it takes two steps: create the card in a column, then drag it into the gap. | PM testing, 2026-10-01 | Sprint 3, slice 1 |
| Put the Rows dropdown to the left of Columns, closer to the row headers. | PM testing, 2026-10-01 | Sprint 3, slice 1 |
| Dependency lines are drawn over the pinned row and column headers when a card is scrolled under them, so a line seems to point at a header. They should be clipped to the scrolling area. | Engineering, 2026-10-01 | Shipped in sprint 4, slice 3 |
| Expanding an epic inside an expanded initiative folds the initiative instead (theme G). | PM testing, 2026-10-02 | Sprint 5, slice 2 |

## Planned next

- **Sprint 3: dependencies** ([`docs/sprint-3.md`](sprint-3.md)) shipped on 2026-10-01: drawing links, showing them the Q14 way, and order highlights (requirements 15, 16, and 18), plus the small fixes in D and group renaming (Q36).
- **Sprint 4: hierarchy and editing** ([`docs/sprint-4.md`](sprint-4.md)) shipped on 2026-10-01: themes A, B, and C's inspector (Q32–Q35).
- **Sprint 5: shore up what we have** ([`docs/sprint-5.md`](sprint-5.md)) shipped on 2026-10-02: the compatibility gate; expand and fold replace zoom (Q42, Q43); nesting by drag; selecting every match (Q47); and a card's copies (Q45). One tester session covers sprints 3–5 (`docs/demos/sprint-5-session.md`), and feeds sprint 6.
- **Sprint 6 candidates:**
  - "related to" links (theme F, Q44);
  - order within a cell (Q46), and dragging several cards (Q48);
  - component contention and the conflicts panel (requirements 17–20), with the panel following the view (Q40) and reviewed conflicts coming back on any relevant change (Q41).

## Deferred, from earlier sprints

Already out of scope, listed here so they're in one place: scenarios (22–24); filters (9); saved views (8); re-importing or updating from Jira (Q26); hierarchical custom properties (Q25); nicer release labels than "27.3" once releases can be curated (the PM's note on Q9).

## Housekeeping

- **Plan file compatibility, as a CI gate.** Shipped in sprint 5, slice 1. "Do we have tests to ensure that data exported from a previous version can be safely imported into a new version? If not, now that the tool is public, we should add that and treat backwards compatibility breakage from any previous version as CI-blocking." (PM, 2026-10-02.) Plan files and browser boards from every released build, sprints 0 to 4, are fixtures that `npm run check` opens, so a break fails CI. Each release adds its own (ADR 0005).
- Check the app in Firefox and Safari. It's been open since sprint 1, and it matters more now that the app is public.
- Fold in the sprint 1 and 2 session notes, and any tester reactions to the open questions, as they arrive.
