import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { VisibleLink } from '../domain/dependencies.ts';

/** One line, as drawn. `tone` picks its color and arrowhead. */
export interface DrawnLine extends VisibleLink {
  tone: 'focus' | 'problem';
  /** Hover text: "A → B" or what's wrong, one line per link it stands for. */
  label: string;
  /** Clicked, ready for Delete. */
  selected?: boolean;
  /** Between two cards that don't match what's being found (Q50). */
  dimmed?: boolean;
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Dependency lines (requirement 15, ADR 0011), and the dashed lines that
 * join a card's copies (Q45): one SVG overlay over the board, positioned
 * from the cards' rectangles on screen. It re-measures
 * when the lines or the layout change, on resize, and once per frame
 * while the board scrolls (the holding lanes are pinned, so their cards
 * move relative to the board). Drawn imperatively: positions come from the
 * page, not from React state.
 */
export function DependencyLines({
  lines,
  copies,
  board,
  scroller,
  layoutKey,
  onLineClick,
}: {
  lines: readonly DrawnLine[];
  /** Cards whose copies are joined, each copy to its nearest neighbor (Q45). */
  copies: readonly string[];
  /** A click on a line: select it, so Delete can remove it. */
  onLineClick: (line: DrawnLine) => void;
  board: RefObject<HTMLDivElement | null>;
  scroller: RefObject<HTMLDivElement | null>;
  /** Changes whenever cards may have moved. */
  layoutKey: unknown;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  // The latest handler, read at click time, so a new handler doesn't force a redraw.
  const clickRef = useRef(onLineClick);
  useEffect(() => {
    clickRef.current = onLineClick;
  }, [onLineClick]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const boardEl = board.current;
    if (!svg || !boardEl) return;
    const draw = () => {
      const origin = boardEl.getBoundingClientRect();
      // Measure the board without the overlay: its own size counts in the board's scroll size, so a
      // board that got narrower (after a pivot) would otherwise keep the old width and a blank strip.
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.setAttribute('width', String(boardEl.scrollWidth));
      svg.setAttribute('height', String(boardEl.scrollHeight));
      // Clip to the area under the pinned headers, so a line to a card scrolled beneath them doesn't
      // seem to point at a header. Lines still reach the pinned holding lanes on the right and bottom.
      const corner = boardEl.querySelector('.corner')?.getBoundingClientRect();
      const view = scroller.current?.getBoundingClientRect();
      const clip = svg.querySelector('clipPath rect')!;
      if (corner && view) {
        clip.setAttribute('x', String(corner.right - origin.left));
        clip.setAttribute('y', String(corner.bottom - origin.top));
        clip.setAttribute('width', String(Math.max(0, view.right - corner.right)));
        clip.setAttribute('height', String(Math.max(0, view.bottom - corner.bottom)));
      }
      const group = svg.querySelector('g.lines')!;
      group.replaceChildren();
      const local = (r: DOMRect): Box => ({
        left: r.left - origin.left,
        right: r.right - origin.left,
        top: r.top - origin.top,
        bottom: r.bottom - origin.top,
      });
      // A card's copies, under its dependency lines: dashed, with no arrow, and never in the pointer's way.
      for (const id of copies) {
        const rects = [...boardEl.querySelectorAll<HTMLElement>(`.card[data-item="${CSS.escape(id)}"]:not(.via-children)`)].map(
          (el) => local(el.getBoundingClientRect()),
        );
        for (const [a, b] of nearestNeighbors(rects)) {
          const path = document.createElementNS(SVG, 'path');
          path.setAttribute('d', curve(a, b));
          path.setAttribute('class', 'copy-line');
          path.dataset.item = id;
          group.append(path);
        }
      }
      for (const line of lines) {
        const ends = closestCopies(boardEl, line.from, line.to);
        if (!ends) continue;
        const [a, b] = ends.map(local) as [Box, Box];
        const d = curve(a, b);
        const path = document.createElementNS(SVG, 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', `dep-line ${line.tone}${line.selected ? ' selected' : ''}${line.dimmed ? ' dimmed' : ''}`);
        path.setAttribute('marker-end', `url(#dep-arrow-${line.tone})`);
        path.dataset.from = line.from;
        path.dataset.to = line.to;
        // A wide, invisible twin takes the pointer: easier to hover and click than a 2px line.
        const hit = document.createElementNS(SVG, 'path');
        hit.setAttribute('d', d);
        hit.setAttribute('class', 'dep-hit');
        hit.dataset.from = line.from;
        hit.dataset.to = line.to;
        const title = document.createElementNS(SVG, 'title');
        title.textContent = line.label;
        hit.append(title);
        hit.addEventListener('pointerdown', (e) => e.stopPropagation());
        hit.addEventListener('click', (e) => {
          e.stopPropagation();
          clickRef.current(line);
        });
        group.append(path, hit);
      }
    };
    draw();
    let frame = 0;
    const soon = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          draw();
        });
      }
    };
    const scrollEl = scroller.current;
    scrollEl?.addEventListener('scroll', soon, { passive: true });
    window.addEventListener('resize', soon);
    const resize = new ResizeObserver(soon);
    resize.observe(boardEl);
    return () => {
      cancelAnimationFrame(frame);
      scrollEl?.removeEventListener('scroll', soon);
      window.removeEventListener('resize', soon);
      resize.disconnect();
    };
  }, [lines, copies, board, scroller, layoutKey]);

  return (
    <svg ref={svgRef} className="dep-lines" aria-hidden="true" data-testid="dependency-lines">
      <defs>
        {(['focus', 'problem'] as const).map((tone) => (
          <marker
            key={tone}
            id={`dep-arrow-${tone}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" className={`dep-arrow ${tone}`} />
          </marker>
        ))}
        <clipPath id="dep-clip">
          <rect x="0" y="0" width="100%" height="100%" />
        </clipPath>
      </defs>
      <g className="lines" clipPath="url(#dep-clip)" />
    </svg>
  );
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const centerDistance = (a: Box, b: Box) =>
  Math.hypot((a.left + a.right) / 2 - (b.left + b.right) / 2, (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);

/**
 * Pairs that join every copy with the least total length: each copy is
 * joined to the nearest one already joined (a minimum spanning tree), so
 * copies in neighboring lanes are joined to each other rather than all to
 * one far-off copy.
 */
export function nearestNeighbors(boxes: readonly Box[]): [Box, Box][] {
  if (boxes.length < 2) return [];
  const joined = [boxes[0]!];
  const rest = boxes.slice(1);
  const pairs: [Box, Box][] = [];
  while (rest.length > 0) {
    let best: [number, Box, number] = [Infinity, joined[0]!, 0];
    for (const [i, box] of rest.entries()) {
      for (const from of joined) {
        const d = centerDistance(from, box);
        if (d < best[0]) best = [d, from, i];
      }
    }
    const [next] = rest.splice(best[2], 1);
    pairs.push([best[1], next!]);
    joined.push(next!);
  }
  return pairs;
}

/** A card with several copies (one per lane) is linked from the pair of copies closest together. */
function closestCopies(board: HTMLElement, from: string, to: string): [DOMRect, DOMRect] | null {
  const copies = (id: string) =>
    [...board.querySelectorAll<HTMLElement>(`.card[data-item="${CSS.escape(id)}"]`)].map((el) => el.getBoundingClientRect());
  const a = copies(from);
  const b = copies(to);
  let best: [DOMRect, DOMRect] | null = null;
  let bestDistance = Infinity;
  for (const ra of a) {
    for (const rb of b) {
      const d = Math.hypot(ra.x + ra.width / 2 - (rb.x + rb.width / 2), ra.y + ra.height / 2 - (rb.y + rb.height / 2));
      if (d < bestDistance) {
        bestDistance = d;
        best = [ra, rb];
      }
    }
  }
  return best;
}

/**
 * A curve from the prerequisite to the dependent, leaving and arriving on
 * the sides that face each other: left and right when they're side by
 * side, top and bottom when one is above the other.
 */
export function curve(a: Box, b: Box): string {
  const ax = (a.left + a.right) / 2;
  const ay = (a.top + a.bottom) / 2;
  const bx = (b.left + b.right) / 2;
  const by = (b.top + b.bottom) / 2;
  const horizontal = b.left >= a.right || a.left >= b.right;
  if (horizontal) {
    const forward = bx >= ax;
    const x1 = forward ? a.right : a.left;
    const x2 = forward ? b.left : b.right;
    const pull = Math.max(30, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1);
    return `M${x1},${ay} C${x1 + pull},${ay} ${x2 - pull},${by} ${x2},${by}`;
  }
  const down = by >= ay;
  const y1 = down ? a.bottom : a.top;
  const y2 = down ? b.top : b.bottom;
  const pull = Math.max(24, Math.abs(y2 - y1) / 2) * (down ? 1 : -1);
  // Stacked in one column: bow out to the right so the line clears the cards between.
  const bow = Math.abs(bx - ax) < 8 ? Math.min(60, Math.abs(y2 - y1) / 3 + 20) : 0;
  return `M${ax + bow / 4},${y1} C${ax + bow},${y1 + pull} ${bx + bow},${y2 - pull} ${bx + bow / 4},${y2}`;
}
