# 0012: Nested axes

Status: Accepted (sprint 4, slice 3). Lane zoom superseded in sprint 5 by [0013](0013-expand-and-fold-replace-zoom.md), and collapsed bands became folded-by-default viewer state there.

## Context

Q34 and backlog theme B. With an axis at a child level, such as components as rows, the levels above it disappear. Every card tagged with an area but no component waits in one "No component" lane at the board's edge, far from its area. People sort in two stages: by area first, then area by area by component. The PM's answer to Q34 asks for parent bands with a holding lane per parent, with bands that collapse and expand, and with clicking a header still zooming (requirement 7). It's the biggest layout change since sprint 0, and the drop rules (ADR 0007) and lane zoom (ADR 0008, Q18, Q22) have to keep working.

## Decision

- **Nesting is part of the layout, not a new kind of view.** An axis at a level below the top, with no lane zoom on it, is nested. `layoutView` walks the property's value tree and returns, per axis:
  - **lanes**, in tree order: each parent's children, then a lane for the parent itself;
  - **bands**: one per parent, with the range of lanes it spans and whether it's collapsed.

  An axis at its top level, or a lane-zoomed one, lays out exactly as before.
- **A parent's own lane is keyed by the parent value.** "Identity: no component" is the lane `identity`. A card whose value is plain Identity falls into it. Dropping a card there writes `identity`, so the existing drop rule gives the card the plain parent value, which is the rule Q22 set for a zoomed lane. No new drop code is needed, and a new card made there gets plain Identity the same way.
- **One function says which lane a value is in.** `laneKeyOf(property, value, axis)` in `src/domain/view.ts` returns:
  - the value's ancestor at the axis level;
  - or the value itself, if it's coarser than that level (its parent's lane);
  - or the first collapsed ancestor, if there is one.

  Layout and drops (`src/domain/move.ts`) both use it, so they can't disagree about where a card is.
- **Collapsing.** A collapsed band is a single lane keyed by the parent, labeled with how many values it holds, and every card inside the parent is in it. Dropping a card into the lane it's already in keeps its precise value, by the same rule as dragging a release card along the quarter axis. Dropping a card in from elsewhere gives it the plain parent: you can't pick a component you can't see. Collapsed values are viewer state, kept per property and remembered per browser like the view, so they survive a pivot or a swap.
- **The holding lanes at the board's edges** hold only cards with no value at any level.
- **Zoom stays.** Clicking a band's name zooms into it (requirement 7). A lane zoom's level is now "one below the zoomed value", not "one below the axis option", so zooming from a band in a component view stays a component view, and zooming out brings the bands back.
- **Rendering.** Row bands get their own pinned column to the left of the row headers, and column bands their own pinned row above the column headers. Both use CSS grid spans. The corner and the bottom-left holding header span the extra track. Dependency lines are clipped to the scrolling area inside the pinned headers, so a line to a card scrolled under a header no longer appears to point at the header.

## Alternatives

- **Bands as a separate view mode, with a toggle.** It would be one more control, and every child-level view wants the parents shown. The flat child-level layout's one advantage, fewer lanes, is what collapsing a band gives back.
- **Per-parent lanes only when they hold cards.** The lane is also the place to drop a card to give it the plain parent, so it has to be there when it's empty too. It's styled like a holding lane, so empty ones stay quiet.
- **Keying the per-parent lane by a synthetic ID.** That would need its own drop rule. Keying it by the parent value reuses everything.

## Consequences

- A child-level view has one more lane per parent: 4 more rows for areas, and 4 more columns for quarters, in the sample plan. Collapsing a band takes its lanes back down to one.
- The axis label still reads "System (component)". The band level is implied by the bands.
- Hierarchies of any depth get a band row or column per level above the axis. Today's built-ins have two levels, and custom properties are flat (Q25), so in practice there's one.
