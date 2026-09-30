# Sprint 2 — engineering plan

Status: **approved 2026-09-30.** Slice 1 in review. Scope is `docs/sprint-2.md`. This doc covers how engineering delivers that scope: order, slices, and what each depends on. The review process is unchanged from sprint 0 (`docs/plans/sprint-0-plan.md`, "Quality and review process").

## What this sprint has to prove

One question: does the board look like the PM's own plan once their Jira data is on it? If the import is slow, lossy, or needs a lot of hand repair, sprint 3's dependency and contention work would be tested on data nobody trusts.

## Slices

Each slice is one PR with a single-file HTML build attached, plus a demo note in the PR body (what to click, what should happen, known gaps).

| # | Slice | You can do this afterwards | Sprint 2 items covered |
|---|---|---|---|
| 1 | **Save and open plan files** | **Save plan** downloads a `.json` file. **Open plan** replaces the board with a file's plan, undoably, and lists a bad file's problems in plain words. Cards can carry an optional Jira key. A save followed by an open gives back the same plan. | Plan files |
| 2 | **Custom properties and dynamic axes** | A **Properties** panel lists the plan's properties. Add a single- or multi-select property, rename it, or delete it. The axis picker is built from the plan's properties at every level, so a new property is immediately an axis. | Custom properties |
| 3 | **Editing values** | In the Properties panel, add, rename, reorder, and delete values, and move a value to another parent (a component to another area, a release to another quarter). Rename levels. Deleting a value that cards use moves them to its parent (Q4), with a notice and Undo. | Editing values |
| 4 | **CSV import: parse and map columns** | **Import CSV** opens a dialog: pick a file, see its columns, and map each to a field. Jira's usual headers are recognized automatically: Summary, Issue key, Description, Component/s (repeated columns), Fix Version/s, Story Points, Parent / Epic Link, Labels, Team, and issue links. A preview shows the first rows. | CSV import, first half |
| 5 | **CSV import: values and structure** | A value table in the same dialog gives each component an area, each version a quarter, and story points size buckets (Q27, Q28). Chosen columns become custom properties. Parents become groups, and "Blocks" links become dependencies. Import replaces the board, undoably, and keeps Jira keys. | CSV import, second half |
| 6 | **Tester-ready** | A synthetic Jira export in `docs/samples/`. Updated legend and help. A demo note, and a session script built around importing your own export. | Tester-ready |

Save and open come first: they're small, useful straight away (you can move a plan between browsers, or send one to a tester), and the importer reuses the same path from a parsed plan to the board. Properties and value editing come before the importer, because an import creates properties and values that people will want to fix immediately.

## Engineering defaults (my call; flag anything you'd veto)

- **Plan files (ADR 0005 amendment, slice 1).** Items gain an optional `externalKey` (the Jira key). The format stays at version 1, because readers already ignore unknown fields. A new `planToJson` writer is the exact inverse of `parsePlanJson` (`src/domain/planJson.ts`), with a round-trip test on the sample plan. Opening a file reuses `loadPlan`, so it's one undo step.
- **Editing properties (ADR 0009, slices 2–3).** Value IDs are stable and never reused, so renaming changes only the label. Moving a value changes its parent and keeps its ID. Deleting a value moves its cards to the parent value in the same transaction (Q4). Custom property IDs are random, like item IDs.
- **Axis options become data (slice 2).** `src/ui/axes.ts` builds the axis options from the plan's properties and levels, replacing today's fixed list. A remembered view choice that points at a missing property falls back to the default view.
- **CSV import (ADR 0010, slices 4–5).** A small CSV parser that handles quoted fields, embedded newlines, and repeated headers. It's pure and tested, with no new dependency. Mapping is two pure steps, each unit-tested against fixtures of real Jira quirks: rows plus a column mapping give a draft plan, then the draft plus the value table give a `Plan`. The import goes through `loadPlan`, so it's one undo step.
- **Commands (`src/commands/`):** `createProperty`, `renameProperty`, `deleteProperty`, `addValue`, `renameValue`, `moveValue`, `deleteValue`, `renameLevel`, and `importPlan`. Each is one Yjs transaction and one undo step.

### ADR schedule

- **Slice 1:** amend 0005 (plan file format) for `externalKey` and the writer.
- **Slice 2:** 0009, editing properties.
- **Slice 4:** 0010, CSV import.

## Open questions, each built with a reversible default

- **Q27:** components default to a new area named after their Jira project; versions default to "not imported".
- **Q28:** story points 1 → XS, 2–3 → S, 5 → M, 8 → L, 13 and up → XL, editable in the value table.
- **Q29:** Status, Priority, Sprint, and Assignee are off by default; each can be turned on as a custom property.

## Risks I'm tracking

- **Jira CSV quirks.** Repeated columns, custom-field names, locale-specific dates, and exports from company-managed versus team-managed projects all differ _(recalled)_. The synthetic sample may miss some of these. Your own export is the real test (exit criterion 7), and the mapping step lets you correct anything the auto-detection gets wrong.
- **Property editor scope creep.** Hierarchical custom properties, and moving values by dragging them in the panel, are left out. Moving a value uses a "Move to…" menu.
- **Big imports.** A few hundred items is the target scale. If an export has thousands of rows, the preview says so, and you can still choose to import it.

## What I need from you

1. Notes from the sprint 1 session, folded into `docs/questions.md` before slice 1 starts.
2. Before slice 6: a real Jira CSV export you're allowed to use locally. It never needs to be in the repo; only you open it, in your own browser.
3. The Firefox and Safari check from sprint 1, if it hasn't been done yet.
