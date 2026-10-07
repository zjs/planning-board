# Sprint 7: engineering plan

Status: **approved 2026-10-07.** **Complete 2026-10-07.** Slices 1–6 were PRs #45–#50, and slice 7 follows. Scope is in `docs/sprint-7.md`. This doc covers how engineering delivers it. The review process is unchanged from sprint 0 (`docs/plans/sprint-0-plan.md`, "Quality and review process").

## What this sprint has to prove

- A stranger can open the link and get five ideas onto a blank board. They can sort the ideas into areas they made, see the same cards in another view, and put a few inside another, all without reading help.
- Someone with a rough sequence can bucket it into quarters in a few drags.

## Slices

| # | Slice | You can do this afterwards |
|---|---|---|
| 1 | **Views and visible pivots** | Click a view such as Roadmap above the board, and watch the cards glide to their new places. The sample opens on Roadmap. |
| 2 | **Edit values from the headers** | Double-click a header to rename it. Click "+ Add area" (or quarter, component, team) to add one. On a blank plan, the first area is one click away. |
| 3 | **Drags that say what they do; Expand and Collapse** | See "→ Q2 2027 · Billing" on a dragged card. Collapse replaces Fold for groups. |
| 4 | **Card menu** | Right-click a card, or click its "⋯", to see every action with its key. |
| 5 | **From a sequence to a timeline** | Typed ideas keep their order. Box-select a run of cards and drag them all into Q1, in one undo step. |
| 6 | **Guided start** | Start a blank plan and be walked through dumping, organizing, viewing and grouping. Help becomes a cheat sheet. |
| 7 | **Tester-ready, and the release pass** | Run a cold-start session from the script. The exit-criteria e2e passes. |

## How each slice is built

1. **Views.**
   - Presets are a list of `ViewChoice`s in `src/ui/axes.ts`. They're viewer state, not saved views, so requirement 8 stays deferred.
   - A view bar between the toolbar and the board holds the presets and the axis pickers.
   - Pivots animate with FLIP: measure the cards, render, measure again, then animate the transform with the Web Animations API. A card's new copies start from its old first copy, and new cards fade in. Reduced motion skips it.
   - ADR 0015.
2. **Headers.**
   - Double-click renames, with `renameValue`. "+ Add <level>" uses `addValue`, after the last header of an axis and at the end of each unfolded band.
   - The Properties panel keeps move and delete.
3. **Ghost and wording.**
   - The ghost names the target lanes, from the layout's lane labels.
   - ⇧E is labelled Collapse in the toolbar, notices, help and README. ADR 0013 gets an amendment note.
4. **Card menu.** It's built on `Menu.tsx`'s pattern, and its actions call the existing handlers in `App.tsx`. The toolbar keeps its buttons.
5. **Sequence to timeline.**
   - **Order:** items get an optional `rank`, a fractional key set after every other card when a card is made, and in row order on import. Cells sort by sequence, then rank, then title. It's stored in Yjs and in the plan file as an optional field, and the file version stays 1 (ADR 0005, amended).
   - **Box select:** a drag that starts on empty space draws a box. A drag only counts after the pointer moves a few pixels, so click-to-clear and double-click-to-create are unchanged.
   - **Drag several:** dragging a selected card moves the whole selection through a new `dropCards` command, in one transaction.
6. **Guide.**
   - A pure step detector, `(plan, view) → step`, is unit-tested.
   - A coach panel docks at the bottom left. Progress and dismissal are per browser.
   - The legend no longer opens by itself, and it's regrouped by goal.
7. **Release.**
   - Cold start in the session script.
   - The demo note, exit-criteria e2e, README, backlog and questions.

## Engineering defaults (my call; flag anything you'd veto)

- **Presets:** Sequence, Roadmap, Sizing, Structure. The sample opens on Roadmap, and a blank plan on Sequence.
- **The view bar is a second row,** about 36px tall. It's what stops the toolbar wrapping, so the toolbar keeps Group, Ungroup, Expand, Collapse and Link.
- **The guide runs on a blank plan only.** Sample visitors get the cheat sheet under ?, and two one-time hints.
- **The card menu is in, and the command palette (Q54 b) waits.** The menu teaches keys on the card in hand, which matters more to newcomers.
- **Header edits are rename and add only.**
- **Box select is a drag on empty space,** the whiteboard convention _(recalled: Miro, FigJam, Figma)_. ⇧-click keeps toggling one card.
- **Ties in a cell go by the order cards were made,** through `rank`. That's the first step toward Q46 (c), a plan-wide rank, not a separate mechanism.
- **Several cards held over a card** all go inside it, skipping any that can't. Dropped on the move-out strip, each moves up from its own group.

## Risks I'm tracking

- **Animation cost with about 190 cards.** Transform-only animation should be cheap _(priors)_. I'll measure it on the sample, and limit it to on-screen cards if needed.
- **Guide steps that need a precise drag.** Each step names its keyboard or inspector fallback.
- **Click and double-click on headers.** A click folds a band, and a double-click renames it. If testers misfire, a pencil on hover is the fallback.
- **Box select vs. scrolling.** Trackpads scroll with two fingers, so a one-finger drag on empty space is free. A mouse user scrolls with the wheel.

## What I need from you

1. The cold-start session, with someone who hasn't seen the board, before you show them anything.
2. After it, a call on Q56: is bucketing with box select and drag enough, or do people want a Timeline view with sequence under time?
