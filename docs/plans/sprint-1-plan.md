# Sprint 1 — engineering plan

Status: **approved 2026-09-26.** Scope is `docs/sprint-1.md`. This doc covers how engineering delivers that scope: order, slices, and what each depends on. The review process is unchanged from sprint 0 (`docs/plans/sprint-0-plan.md`, "Quality and review process").

## What this sprint has to prove

Two questions. Does changing the plan's shape (grouping, decomposing, regrouping) feel as direct as moving a card? And does zooming keep people oriented, or do they lose track of where they are?

## Slices

Each slice is one PR with a single-file HTML build attached, plus a demo note in the PR body (what to click, what should happen, known gaps).

| # | Slice | You can do this afterwards | Sprint 1 items covered |
|---|---|---|---|
| 1 | **Selection, create, rename, delete** | Select cards, including every copy of a multi-lane card. Double-click empty space to create a card with that cell's values. Double-click or press Enter to rename. Delete removes the selection. Everything is undoable. | Selection and cards |
| 2 | **Group and ungroup** | ⌘G groups the selection under a new named card, placed by the values its children share. With one existing group in the selection, the rest join it. ⇧⌘G ungroups. | Groups |
| 3 | **Zoom into a group** | Double-click a group to see its children, with a breadcrumb and the group's own values in the header. New cards land inside it. Drag a card onto a breadcrumb segment to move it out. | Group zoom |
| 4 | **Levels and lane zoom** | Pick Component or Release as an axis. Click a lane header to zoom one level down within it. Area-only cards wait in "No component", and a drop there refines Identity to Identity/SSO. | Axis levels, lane zoom, refine rule |
| 5 | **Roll-up and mismatch markers** | Faded "via children" copies of groups. Mismatch markers on children, and a mismatch count on collapsed groups. | Roll-up and mismatches |
| 6 | **Tester-ready** | Updated legend. Seed data with deliberate mismatches. Session script and demo note. Cross-browser check. | Tester-ready |

Selection and creation come first because everything else builds on them: grouping needs a selection, zooming into a group needs a way to add children, and sprint 2's dependency focus ("the hovered or selected card", Q14) reuses the selection.

## Engineering defaults (my call; flag anything you'd veto)

- **Selection is viewer state.** It lives in the UI, not in the Yjs document, so it's never undone, never saved, and in M2 it becomes part of presence rather than of the plan.
- **Zoom is part of the view spec (ADR 0008, slice 3).** `ViewSpec` gains an optional group root and a per-axis `within` value. `layoutView` stays a pure function of the plan and the spec, so zoom is tested like any other view. Zoom state is remembered per browser, like the chosen axes. If the zoomed group or value is deleted, the view falls back to the nearest level that still exists.
- **Commands (`src/commands/`):** `createItem`, `renameItem`, `deleteItems`, `groupItems`, `ungroup`, and `moveToParent`. Each is one Yjs transaction and one undo step. Grouping refuses a move that `wouldCreateCycle` flags (`src/domain/tree.ts`, ADR 0004).
- **New item IDs** are random and never reused (ADR 0003), so a card created in one scenario can later be matched across scenarios.
- **Roll-up in the layout (slice 5).** `CardRef` gains `via: 'self' | 'children'`. The faded copies come from the same view query, so they pivot and zoom like everything else. Mismatch markers reuse `groupConflicts` (`src/domain/conflicts.ts`) with the Q12 rules.
- **Refining replaces the ancestor (slice 4).** Adding a value drops any existing value that's its ancestor on the same property, so Identity + Identity/SSO never coexist. This is a pure rule in `planDrop`, unit-tested.
- **Keyboard shortcuts** ignore key presses while a title is being edited, so typing never triggers Delete or ⌘G by accident.

### ADR schedule

- **Slice 3:** 0008, view scope and zoom.
- **Slice 1, if needed:** amend 0007 (drag-and-drop) for click-versus-drag and double-click.

## Risks I'm tracking

- **Double-click does three jobs:** create in empty space, rename a card, zoom into a group. Testers may trip over it. The fallback is Enter-only renaming and a zoom icon on group cards; the session will tell.
- **Faded copies may clutter system views** when groups have children in many areas. If they do, the next step is collapsing them into one "+3 areas" chip per group.
- **Losing your place across zooms.** Mitigations: a breadcrumb that's always visible, the zoom chip, and restoring the scroll position on zoom-out.
- **Deleting a group deletes its contents (Q17), and undo has to restore all of it.** A quick spike confirmed that Yjs's undo manager restores a deleted group, its children's nested values, and a removed dependency exactly, that redo deletes them again, and that the restored state survives a save and reload. Slice 1 turns that into permanent tests: delete a nested group with dependencies, undo, compare the snapshot to the original, then redo, then reload. A large delete flashes a count ("Deleted 5 cards · Undo") so it isn't silent.

## What I need from you

1. ~~Answer Q17–Q19~~ Answered 2026-09-26.
2. For the session at the end of the sprint, pick one real epic you'd decompose. Recreating it by hand in the sample plan makes the "decompose an epic" task realistic.
