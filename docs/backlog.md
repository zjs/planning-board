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

**Lands:** sprint 4 candidate.

### B. Hierarchical axes should show their parents

With components or releases as an axis, the areas or quarters above them disappear. Cards tagged with an area but no component all wait in one "No component" lane at the edge of the board, far from their area.

**Feedback** (PM testing, 2026-10-01):

- *Show the parent level beside the child level.* With component rows, put an area column to their left, each area spanning its components. Cards assigned to an area but no component should sit in a "no component" lane for that area, not at the very bottom. This supports two-stage sorting: bucket cards by area, then go area by area and bucket by component.

**Generalization:** nested axis headers, with a holding lane for each parent. A drop in an area's "no component" lane gives the card that plain area, the same rule as inside a lane zoom (Q22). This could replace, or sit beside, clicking a header to zoom (requirement 7). It's the biggest layout change since sprint 0, and it will need an ADR. → [Q34](questions.md#q34-nested-axes)

**Lands:** sprint 4 candidate.

### C. Edit a card where it is

Dragging into a cell is the core bet, and it's the fastest way to sort many cards. It's slow for one card: sizing a single new card means pivoting to Size, dragging, then pivoting back. Renaming a group is hard to find.

**Feedback** (PM testing, 2026-10-01):

- *Setting a property without pivoting.* "You can set size by pivoting and then dragging, which is great when you're sizing a batch of cards. But if you add another card later, you might want to quickly size it and keep going."
- *Renaming a group.* "How do you edit the name of a group? Double-click opens the group." Pressing Enter on a selected group renames it today, but nobody finds it. The sprint 1 plan flagged this as a known gap ("double-click does three jobs").

**Generalization:**

- **A card inspector**: select one or more cards and edit any property in a side panel. It's also a home for already-deferred items: descriptions, the Jira key, and later a card's dependencies. It complements dragging rather than replacing it. → [Q35](questions.md#q35-editing-a-card-without-pivoting)
- **Give double-click one job** across the board, and give zooming a visible control. → [Q36](questions.md#q36-double-click-does-three-jobs)

**Lands:** renaming groups shipped in sprint 3 (slice 1). The inspector is a sprint 4 candidate.

### D. Small fixes

No decision needed. Each one goes into the next sprint. Both items below shipped in sprint 3.

| Item | Source | Lands |
|---|---|---|
| Double-click a gap between sequence columns to create a card in a new column. Today it takes two steps: create the card in a column, then drag it into the gap. | PM testing, 2026-10-01 | Sprint 3, slice 1 |
| Put the Rows dropdown to the left of Columns, closer to the row headers. | PM testing, 2026-10-01 | Sprint 3, slice 1 |

## Planned next

- **Sprint 3: dependencies** ([`docs/sprint-3.md`](sprint-3.md)) shipped on 2026-10-01: drawing links, showing them the Q14 way, and order highlights (requirements 15, 16, and 18), plus the small fixes in D and group renaming (Q36). Its tester session (`docs/demos/sprint-3-session.md`) feeds sprint 4.
- **Sprint 4 candidates:** themes A, B, and C's inspector (Q32–Q35), plus component contention and the conflicts panel (requirements 17–20), which sprint 3 left out to stay focused on dependencies.

## Deferred, from earlier sprints

Already out of scope, listed here so they're in one place: scenarios (22–24); filters (9); saved views (8); re-importing or updating from Jira (Q26); hierarchical custom properties (Q25); showing card descriptions; nicer release labels than "27.3" once releases can be curated (the PM's note on Q9).

## Housekeeping

- Check the app in Firefox and Safari. It's been open since sprint 1, and it matters more now that the app is public.
- Fold in the sprint 1 and 2 session notes, and any tester reactions to the open questions, as they arrive.
