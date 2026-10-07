# 0015: Built-in views, and pivots that move

Status: Accepted (sprint 7, slice 1).

## Context

Pivoting is the core bet. Before this decision, though, it was two dropdowns in the toolbar, and a pivot redrew the board instantly. A first-time visitor had no reason to try one. When they did, nothing showed that the cards were the same cards in new places.

The sample also opened in Sequence × System, whose columns have no labels (requirement 6), so the first board didn't read as a grid of two properties. The PM chose preset views and clearer pivots for new users who arrive from a public link (questions.md Q52, 2026-10-07). The requirements also name the risk "Pivoting erases spatial memory".

## Decision

**Presets are viewer state, not saved views.**

- `PRESETS` in `src/ui/axes.ts` lists four `ViewChoice`s:
  - **Sequence** (Sequence × System);
  - **Roadmap** (Time × System);
  - **Sizing** (Size × Level);
  - **Structure** (Level × System).
- A preset is shown only when the plan has both of its properties.
- Choosing one sets the same choice the pickers do, and it's remembered the same way.
- The matching preset is marked. A swapped pair is a different view, so no preset is marked for it.
- Requirement 8, saved views, stays deferred; nothing about a plan changes.

**A view bar sits under the toolbar.** It holds the presets, then the Rows and Columns pickers, ⇄, and Fold all / Unfold all. Moving the axis controls out of the toolbar keeps the toolbar on one row at 1280px.

**The sample opens on Roadmap.** A blank plan still opens on Sequence, where typing ideas into columns makes sense (Q51).

**Pivots animate with FLIP,** in `src/ui/motion.ts`:

- Just before a new choice renders, `capturePositions` records where each card's first copy is on screen.
- In a layout effect after the render, `playFrom` animates each card from its old rectangle to its new one: a transform from the offset to none, over 320 ms, with the Web Animations API.
- A card's other copies start from its old first copy, and a card that wasn't on the board fades in.
- Cards off screen both before and after are skipped, so the cost scales with what's visible.

**Lines wait for the cards.** Dependency lines are measured where cards end up, so the board hides them while cards move, then fades them back in.

**Reduced motion is respected.** Under `prefers-reduced-motion: reduce`, nothing animates. The e2e suite runs that way, so tests measure settled positions; `e2e/views.spec.ts` turns motion back on to check the animation itself.

This adds no runtime dependency.

## Alternatives considered

- **Animate with CSS transitions on grid position.** Cards move between DOM parents when a view changes, so CSS can't transition them; FLIP is the standard answer _(recalled)_.
- **A motion library** (Framer Motion and the like). It would cost a dependency and bundle size for one effect.
- **Animate folds and expands too.** That would be easy with the same functions, but the PM asked about pivots. Folding keeps most cards in place already.
- **Presets as saved, editable views.** That's requirement 8, still deferred. Presets can become the first saved views when it's built.

## Consequences

- The toolbar fits on one row at 1280px. The view bar adds about 40px of height.
- Tests that start from the sample and expect Sequence now choose it explicitly. The shared `openApp` helper does this.
- If a pivot happens while a previous one is still moving, the new one starts from where the cards are drawn at that moment, which looks continuous.

## Amendment (sprint 8): the area color, and holding rails

- **The colored edge stays, and the board explains it.** A card's edge is its first area's color, which is what keeps a card recognizable across pivots. Each area's band, or its lane where the axis has no bands, carries the same color. With System on neither axis, the view bar shows a key ("Edge = area"). The edge's tooltip names the area, with "and 1 more" for a card in several, since only the first colors it. There are eight colors (`--area-0` to `--area-7`), and areas after the eighth reuse them in turn. The helpers are in `src/ui/areas.ts`.
- **Holding lanes collapse to a rail.** The right lane becomes a 34px rail, and the bottom lane a strip. Each still shows its count per lane and keeps its drop targets, so a drop and the drag ghost work as before. Its cards aren't rendered, so box select skips them. It's viewer state like the Cards/Chips choice: `planning-board:holding-collapsed`, both open by default. A board with no rows or no columns has no toggle for that lane, since the lane is the board (Q51).

