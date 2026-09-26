# Sprint 0 — engineering plan

Status: **proposed, awaiting PM approval.** Scope is `docs/sprint-0.md`. This doc covers how engineering delivers that scope: order, slices, and quality gates.

## What this milestone has to prove

One question: does dragging a card into a cell, then pivoting, feel like moving a sticky note, or like filling in a form? Every slice is ordered to get a real drag into your hands as early as possible. Everything that doesn't bear on that question is kept minimal.

## Slices

Each slice is one PR with a single-file HTML build attached, plus a demo note in the PR body (what to click, what should happen, known gaps). Slices are sized so each fits in roughly one working session.

| # | Slice | You can do this afterwards | Sprint 0 items covered |
|---|---|---|---|
| 1 | **Skeleton, pipeline, read-only pivots** | Open the HTML file, see ~150 seed cards, switch between sequence × system, time × system, size × system. See the holding area fill up for sparse axes. No dragging yet. | Repo basics, CI, build artifact, domain types, view query + tests, seed data, axis picker, sequence views unlabeled, group cards with child count |
| 2 | **Drag writes values** (the core bet) | Drag a card into any cell or into the holding area, pivot, and see it land where it should. Undo/redo with ⌘/Ctrl+Z. Reload and nothing is lost. Load sample / Reset. | Yjs doc, commands, drag, undo/redo, IndexedDB persistence, load/reset |
| 3 | **Multi-valued cards and sequence gaps** | A card touching three components shows in three lanes. Drag one copy to replace that lane only, ⌥/Alt-drop to add a lane, drop a copy on the holding area to remove that value. Drop between sequence columns to open a new one. Cards show small value badges. | Multi-valued behavior, Q8 default, Q9 default |
| 4 | **Tester-ready** | Hand the HTML file to a tester. An on-screen legend explains the gestures. It has been checked in Chrome, Firefox, and Safari. Session script and demo note are in the repo. | Demo note, remaining ADRs, stretch conflict functions if time allows |

Slice 1 comes before dragging on purpose. Seeing the seed plan pivot, and seeing how empty time × system is with half the items unscheduled, is a cheap early check that the seed data feels realistic. It's your first chance to say "that's not what a plan looks like" before any interaction is built on it.

### ADR schedule

- **Slice 1:** frontend framework + build, rendering, scenario representation, group tree representation. The last two shape the data model, so they're settled before the types are.
- **Slice 2:** CRDT library, drag-and-drop approach.
- **Slice 4:** plan file format. It isn't used until save/open exists, so it's written last.

## Engineering defaults (my call, recorded in ADRs; flag anything you'd veto)

- **Stack:** TypeScript strict, Vite, React, Vitest, Playwright, ESLint. React because it's the most familiar stack for future open-source contributors, and 150 cards is nowhere near its performance limits.
- **Single-file build:** Vite with an inline-everything plugin, so `dist/index.html` has no external requests and works opened from disk. The same file is what a tester gets.
- **Drag:** custom pointer-event handling, not the browser's HTML5 drag API. The drag feel is the thing being tested, so I want full control over the drag preview, the drop-target highlight, and modifier keys at drop time.
- **Add-value modifier:** ⌥ Option / Alt, which matches "copy" in OS file managers _(recalled)_. The legend in slice 4 shows it. Q1 decides whether it's discoverable.
- **Visible items:** only top-level items are placed on the board. A group renders as one card with a child count, and its children stay hidden until zoom exists (deferred).
- **Card order within a cell:** a stable order (sequence, then title), so cards don't jump around when unrelated cards move.
- **One drag = one undo step**, including multi-lane edits. Reset is undoable too.

## Quality and review process

- **CI on every push:** typecheck, lint, unit tests, a Playwright end-to-end test run against the built single file opened from disk, then upload the HTML as a workflow artifact.
- **Tests:** unit tests for everything in `src/domain/` and `src/commands/`, as `CLAUDE.md` requires. From slice 2, one end-to-end test covers the exit criterion itself: drag, pivot, check position, reload, check again. If that test is green, the demo works.
- **Self-review before merge:** a structured code review pass on the diff, and fixes for every real finding. Then a pass driving the build in a browser and taking screenshots, to catch problems the tests can't see (overlap, jank, drop highlights).
- **Merge:** I merge when CI is green and review is clean. Your acceptance happens on the build. A rejection becomes a new slice or a `questions.md` entry, never a silent fix.

## Risks I'm tracking

- **IndexedDB when the file is opened from disk** (`file://`). Chrome supports it _(recalled)_. Firefox and Safari are less certain _(priors)_. Slice 1 includes a spike to confirm. The fallback is to store the Yjs state in `localStorage`, which is plenty for a few hundred items.
- **Workflow artifacts are zipped and need a GitHub login** _(recalled)_. That's fine for you, but awkward for testers, so for sessions you'll send them the unzipped HTML file directly. Artifacts also expire (90 days by default, _recalled_), which is fine at this stage.
- **Cross-browser testing:** only Chromium is automated here. Firefox and Safari are checked by hand in slice 4. If testers bring Safari, that check matters.
- **Holding-area overload:** with sizes and quarters on only half the items, time × system puts about 75 cards in the holding area. That's deliberate (requirement 21), but it may swamp the view. I'll make the holding area scroll and collapse, and we'll watch it in the session.

## What I need from you

1. Approve or amend this plan. Slice 1 starts on approval.
2. Answer Q8 (sequence columns) and Q9 (value badges) in `docs/questions.md` before slice 3. Both have defaults I'll build if you don't get to them.
3. Recommended: add a branch protection rule on `main` requiring the CI check, once the first CI run exists. I can't set it from here.
