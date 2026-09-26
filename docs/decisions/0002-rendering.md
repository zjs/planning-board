# 0002: Rendering approach

Status: Accepted (sprint 0, slice 1)

## Context

Requirements expect a few hundred items per plan with a few dozen visible at once. The board is a grid of lanes and columns with cards stacked in cells, plus a holding area. Later: dependency lines between cards, conflict highlights, a drag preview.

## Decision

Plain **DOM with CSS grid** for the board, cells, and cards. The grid template is built from the view layout (`src/domain/view.ts`), and headers are sticky so lane names stay visible while scrolling. Dependency lines, when they arrive, go in one **SVG overlay** positioned from card DOM rectangles.

## Alternatives

- **Canvas / WebGL.** Needed for thousands of objects or free zooming; neither applies. It would cost text layout, hit testing, and accessibility we get free from the DOM.
- **All-SVG board.** Good for lines, awkward for wrapping text and scrolling panels.

## Consequences

- Text wrapping, focus, screen readers, and browser zoom work without extra code.
- Line drawing must re-measure after layout changes and scrolling; keep it in one overlay component.
- Performance ceiling is a few thousand DOM cards, well above requirements.
