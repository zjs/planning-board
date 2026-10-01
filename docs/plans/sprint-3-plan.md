# Sprint 3 — engineering plan

Status: **complete 2026-10-01.** All four slices merged (#24–#27). The PM validates the build and runs the tester session (`docs/demos/sprint-3-session.md`). Scope is `docs/sprint-3.md`. This doc covers how engineering delivers that scope: order, slices, and what each depends on. The review process is unchanged from sprint 0 (`docs/plans/sprint-0-plan.md`, "Quality and review process").

## What this sprint has to prove

One question: when the board shows a plan's dependencies, do the highlights point at problems people want to talk about, and does the board stay readable? If links are noisy or the highlights are wrong as often as right, contention (sprint 4) would inherit the same problem.

## Slices

Each slice is one PR with a single-file HTML build attached, plus a demo note in the PR body (what to click, what should happen, known gaps).

| # | Slice | You can do this afterwards | Sprint 3 items covered |
|---|---|---|---|
| 1 | **Backlog fixes** | Double-click renames groups, and a zoom button opens them (Q36). Double-click a sequence gap to add a card in a new column. Rows is left of Columns. | Backlog fixes |
| 2 | **Drawing links and focus lines** | Press L with two cards selected, or the Link button, or use a pending link across zoom levels. See a hovered card's direct links and a selected card's chain. Press L again to remove a link. Links to hidden cards are drawn to their group. | Drawing links, showing links, hidden ends |
| 3 | **Order highlights and loops** | Out-of-order links are always drawn in red, judged at the level the view shows. Loops are flagged. Groups count the problems inside them. Hover a line for its name; click it and press Delete to remove it. | Order highlights; line selection |
| 4 | **Tester-ready** | Legend, demo note, session script, and an end-to-end test of the exit criteria. | Tester-ready |

The fixes come first because they're small, and Q36 changes how group zoom works, which every later test relies on.

## Engineering defaults (my call; flag anything you'd veto)

- **Domain (`src/domain/dependencies.ts`, pure and unit-tested).**
  - `linkProblem` refuses only a self-link, a duplicate, or a missing card. Loops are allowed (Q37).
  - `dependencyLoops` finds every link on a cycle, as strongly connected components.
  - `outOfOrder(plan, view)` checks only the axes the view orders by. A sequence axis compares order keys. A time axis reuses `timeSpans` from `src/domain/conflicts.ts` at the level shown, and flags only orders that are certain (Q12). It judges each linked card's own values, even when the line is drawn to its group.
  - `visibleEnds` resolves each linked card to its nearest ancestor with a solid copy on screen, using `ancestry` from `src/domain/tree.ts` (Q38).
  - `chain` returns everything upstream and downstream of a card.
- **Commands.** `addDependency` and `removeDependency` in `src/commands/store.ts`, each one undo step, using the existing `dependencyKey` layout in Yjs.
- **Group counts.** The ⚠ marker's list (`src/domain/mismatches.ts`) also takes in dependency problems, so a group's count covers everything inside it (requirement 18).
- **Drawing (ADR 0011).** One SVG overlay inside the board, positioned from the cards' on-screen rectangles, as ADR 0002 planned. It re-measures once per frame while scrolling, and on resize and layout changes. Lines that aren't selected ignore the pointer; each line has a wide invisible hit path for hover and click. A card with several copies uses the closest pair.
- **Selection order decides direction.** The selection keeps the order cards were clicked in, so "first selected" is the prerequisite. With three or more selected, L does nothing and says why (Q39).
- **Pending link.** It's viewer state, like the selection, and it's never saved. Zooming keeps it, so cards at different levels can be linked.

### ADR schedule

- **Slice 2:** 0011, dependency display.
- **Slice 1:** amend 0007 (drag and drop) for double-click's single job.

## Risks I'm tracking

- **Line clutter.** The sample plan has 36 links, and the sample export has 12. Ungrouping re-points a group's links at each child (Q21), so one link can become many. Mitigation: only focus lines plus problems are drawn; watch the session.
- **Measuring cards from the page.** Positions can lag behind scrolling or the sticky holding lanes. If re-measuring once per frame isn't smooth, only lines touching the visible area will be drawn.
- **Firefox and Safari.** Still unchecked, and an SVG overlay is one more thing to check there.

## What I need from you

1. For the session: a plan with real dependencies. Your own Jira import is ideal, because its Blocks links come along.
2. The Firefox and Safari check, still open from sprint 1.
