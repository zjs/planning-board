# Sprint 4: engineering plan

Status: **approved 2026-10-01.** Slice 1 in review. Scope is in `docs/sprint-4.md`. This doc covers how engineering delivers that scope: the order of the slices, what each one includes, and what each depends on. The review process is unchanged from sprint 0 (`docs/plans/sprint-0-plan.md`, "Quality and review process").

## What this sprint has to prove

Can the board show a plan's structure, not just its items? That means levels people can read at a glance, two-stage sorting by area and then component, and a group's children visible in context. If it can't, the board stays a pile of cards once a plan grows past brainstorming, and scenarios (which compare structure) would inherit the problem.

## Slices

Each slice is one PR with a single-file HTML build attached, plus a demo note in the PR body: what to click, what should happen, and known gaps.

| # | Slice | You can do this afterwards | Sprint 4 items covered |
|---|---|---|---|
| 1 | **Card inspector** | Edit any property, the description, or a card's links in a side panel, for one card or many. | Card inspector |
| 2 | **Card levels** | Give cards levels, see the badges and heavier borders, see a story containing an epic flagged, and import Issue Type as Level. | Card levels |
| 3 | **Nested axes** | See area bands beside components and quarter bands over releases, use per-parent "no component" lanes, collapse and expand bands, and still zoom. | Nested axes |
| 4 | **Children in context** | Expand groups in place, zoom into several groups at once, and drag the real children inside a faded group's frame. | Children in context |
| 5 | **Tester-ready** | Legend, demo note, session script, and an end-to-end test of the exit criteria. | Tester-ready |

- **The inspector comes first.** It's independent of the layout work, and it's the easiest way to set levels in slice 2.
- **Nested axes come before children in context,** so expanded children land in the new layout instead of being built twice.

## Engineering defaults (my call; flag anything you'd veto)

### Commands (`src/commands/store.ts`)

Each is one undo step, with unit tests:

- `setValues(store, ids, property, values)`: sets one property on every selected card.
- `setDescription`.
- `ensureBuiltIns`: a migration that adds Level to boards saved before this sprint. It runs when the board is opened, outside the undo history, like loading from storage.

### Slice 1: inspector

- **Layout.** `src/ui/Inspector.tsx`, in the side-panel slot that Properties uses. One panel is open at a time.
- **Shared values.** A pure `sharedValues(plan, ids, property)` in `src/domain/` gives each property's value across the selection, or "mixed".
- **Reused pieces.**
  - Value pickers reuse `pathTo` and `valuesAtLevel` from `src/domain/hierarchy.ts`.
  - The title editor reuses `InlineEdit` from `PropertiesPanel.tsx`.
  - The dependency lists use `directLinks` from `src/domain/dependencies.ts`, filtered to the card itself.
  - Mismatch reasons come from `describeMismatch`.
- **The I key** toggles the panel, like L toggles a link; it does nothing while typing.

### Slice 2: levels

- **A built-in property.** A `LEVEL` constant in `src/domain/model.ts`:
  - added to `BUILT_IN` and the property order in `src/domain/properties.ts`;
  - added to the badge order in `src/domain/attributes.ts`.

  Its values are an ordered flat list, like Size.
- **Mismatches.** A `group-level` kind in `groupConflicts` (`src/domain/conflicts.ts`) flags a child whose level ranks at or above its group's. `src/domain/mismatches.ts` describes it.
- **Import.**
  - An `issueType` field in `src/domain/csvImport.ts`, detected from "Issue Type".
  - A Level column in the value table, with the default mapping from `docs/sprint-4.md`.
- **Plan files.** `src/domain/planJson.ts` fills Level in when it's missing. The file format stays at version 1, since the field is additive (ADR 0005).
- **Samples.** Regenerate the sample plan (`npm run seed`) and the sample export (`npm run sample:jira`) with levels.

### Slice 3: nested axes (ADR 0012 first)

- **Bands in the layout.** `layoutView` (`src/domain/view.ts`) returns `bands` per axis: each parent with the range of child lanes it spans.
- **A parent's holding lane is a lane keyed by the parent value itself.** A card with just "Identity" falls into the lane keyed `identity`. The existing drop rule, which writes the lane's key, then gives a dropped card the plain parent value with no new drop code. It's the same rule as inside a lane zoom (Q22).
- **A collapsed band** is one lane keyed by the parent, with every descendant in it. A drop in the lane a card already sits in must keep its precise value. It's tested like dragging within a quarter today.
- **Rendering.** `Board.tsx` gets an extra header column for row bands and an extra header row for column bands, using CSS grid spans.
- **Collapsed bands** are viewer state, kept and remembered with the view choice in `src/ui/axes.ts`.

### Slice 4: children in context (ADR 0008 amended)

- **Multi-zoom.** `ViewSpec.root` becomes `roots: ItemId[]`. A saved single root is read as a list of one.
- **Expand in place.**
  - `expanded: ItemId[]` lists groups expanded in place. `layoutView` replaces each expanded group at the current level with its children.
  - `CardRef` gains `parent`, for the chip and the colored edge.
- **Frames.** `rolledUpCells` returns the children responsible for each faded copy, and the copy renders as a frame around them. The frame holds the shallowest descendant that has its own value in that cell.
- **Lines.** `visibleLinks` already resolves each end to whatever is on screen, so dependency lines work unchanged.
- **E** toggles expansion for the selected groups. ⌘← was the first idea, but it's Back in some Mac browsers.

### ADR schedule

- **Slice 3:** 0012, nested axes.
- **Slice 4:** amend 0008 (view scope and zoom) for several roots and expansion.
- **Slice 2:** amend 0005 (plan file format) to note that Level is filled in when missing.

## Risks I'm tracking

- **Sprint size.** Five slices, two of them large layout changes, all at equal priority: the longest sprint yet. Each slice ships on its own, so a partial sprint is still usable.
- **Nested axes and children in context interact.** Expanded children land in band lanes and frames. Building bands first, with an ADR, keeps one layout model.
- **Noise.** The level marker adds to ⚠ counts before per-type hiding exists (Q23). Watch for it in the session.
- **Board width.** Bands add a header column, and frames make cells taller. I'll check at 1440×900 and 1280×800.
- **Firefox and Safari** are still unchecked.

## What I need from you

1. For the session: a plan with real structure, such as initiatives, epics and stories across several areas. Your own Jira import is ideal, since Issue Type comes along.
2. The Firefox and Safari check, still open from sprint 1.
