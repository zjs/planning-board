# Sprint 5: engineering plan

Status: **approved 2026-10-02.** **Complete 2026-10-02.** All five slices merged (#35–#39). The PM validates the build and runs the combined sprint 3–5 tester session (`docs/demos/sprint-5-session.md`). Scope is in `docs/sprint-5.md`. This doc covers how engineering delivers it: the slices, their order, and the defaults engineering chose. The review process is unchanged from sprint 0 (`docs/plans/sprint-0-plan.md`, "Quality and review process").

## What this sprint has to prove

Can people see deeper into a plan, and restructure it, with a small set of gestures: expand and fold, drag into a group, and drag out? And can every saved plan still be opened? If the set stays this small, the conflicts panel in sprint 6 can build on it rather than on zoom.

## Slices

Each slice is one PR. Every PR gets a single-file HTML build attached and a demo note in its description.

| # | Slice | You can do this afterwards | Sprint 5 items covered |
|---|---|---|---|
| 1 | **Compatibility gate** | Trust that every older plan file and browser board opens; CI blocks if one doesn't. | Compatibility gate |
| 2 | **Expand, fold, nest, select** | Expand nested groups with E, and fold them with ⇧E. Drag a card into a group by holding it over the group, or out of one with the strip. Use the inspector's Group field and "Add a card inside". ⇧-click a badge or header to select every match, and ⌘A to select everything. | Expand, fold, nest, and select |
| 3 | **Zoom goes** | Pick one axis choice per property, folded by default, with Fold all, Unfold all and click-to-unfold. There's no zoom anywhere. | Zoom goes |
| 4 | **A card's copies** | Hover or select a card to see dashed lines joining its copies, with every copy outlined. | A card's copies |
| 5 | **Tester-ready** | Use the legend, demo note, session script, and an end-to-end test of the exit criteria. | Tester-ready |

**Order.** Slice 2 adds the new ways to add cards to groups, move them, and see inside groups while zoom still exists. Slice 3 then removes zoom. That way `main` never loses a capability between slices.

## Engineering defaults (my call; flag anything you'd veto)

**Slice 1**
- A one-off script makes the fixtures. It checks out each earlier version and saves its sample plan through that version's own writer: a plan file from each writer since sprint 2, and a board as each build stored it in the browser (an encoded Yjs update). The sample files from sprints 0 and 1 go in as they were.
- The tests check that each fixture opens, keeps its cards, values, groups and links, and saves and reopens unchanged.

**Slice 2**
- E expands and ⇧E folds; there's no longer a single toggle (the cause of the nested-expand bug).
- The hold-to-nest delay is about half a second. Nesting reuses `moveToParent`, which already refuses loops.
- The move-out strip reuses the parent drop target the breadcrumb has today.
- "Add a card inside" gives the new child its parent's values on the two axes shown, so it appears where the parent was.

**Slice 3 (ADR 0013)**
- ADR 0013, "Expand and fold replace zoom", supersedes the zoom parts of ADR 0008 and the lane zoom in ADR 0012.
- Viewer state flips from "collapsed bands" to "unfolded bands", per property, so folded is the default.
- Views saved as `system:1` or `time:1` open with every band unfolded.
- Older end-to-end specs that zoom switch to expand, nest and fold. Their coverage moves to the new gestures, and no test is dropped.

**Slice 4**
- Copy connectors are drawn in the same overlay and measuring pass as dependency lines, joining each copy to its nearest neighbor.

## Risks I'm tracking

- **Removing zoom touches a lot:** the App's zoom state, the zoom bar, two ADRs, and about 13 end-to-end specs. Giving it its own slice, after the replacements exist, keeps each step shippable.
- **Accidental nesting.** A hold delay, a highlight, a notice with Undo, and values that never change on a nest limit the damage. The session will show whether half a second feels right.
- **Off-screen targets.** Hold-to-nest only reaches cards you can see. The Group field covers the rest.
- **The folded default** must look like today's area view. An end-to-end test checks the lanes against the old layout.

## What I need from you

1. A plan with real structure and dependencies for the combined sprint 3–5 session. Your own Jira import is ideal.
2. The Firefox and Safari check, still open from sprint 1.
