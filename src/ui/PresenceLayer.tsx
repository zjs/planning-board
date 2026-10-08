import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { Person } from '../commands/presence.ts';
import { fitOverlay, redrawOnChange } from './DependencyLines.tsx';

const SVG = 'http://www.w3.org/2000/svg';
/** A pointer's arrow, its tip at the origin. */
const ARROW = 'M0,0 L0,16 L4.5,12 L8,19 L10.5,18 L7,11 L13,11 Z';

/**
 * Other people on a shared plan, drawn on this board (ADR 0019): wherever
 * the cards they point at, select or drag are in this view, not where they
 * are on someone else's screen. A card that isn't on the board here, inside
 * a collapsed group or folded away, draws nothing.
 *
 * - **Selections:** an outline on every copy, in the person's color.
 * - **Drags:** a dashed outline on every copy, and "Ada is moving this → lane".
 * - **Pointers:** an arrow and a name, on the first copy on screen, at the
 *   same place on the card.
 */
export function PresenceLayer({
  others,
  pointers,
  board,
  scroller,
  layoutKey,
}: {
  /** Everyone else present: their selections and drags show. */
  others: readonly Person[];
  /** Whose pointers show, after the cursor setting (Q61). */
  pointers: readonly Person[];
  board: RefObject<HTMLDivElement | null>;
  scroller: RefObject<HTMLDivElement | null>;
  layoutKey: unknown;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    const boardEl = board.current;
    if (!svg || !boardEl) return;
    const draw = () => {
      const origin = fitOverlay(svg, boardEl, scroller.current);
      const view = scroller.current?.getBoundingClientRect() ?? null;
      const group = svg.querySelector('g.marks')!;
      group.replaceChildren();
      const copies = (item: string) =>
        [...boardEl.querySelectorAll<HTMLElement>(`.card[data-item="${CSS.escape(item)}"]:not(.via-children)`)].map((el) =>
          el.getBoundingClientRect(),
        );
      const box = (r: DOMRect, inset: number, person: Person, kind: string) => {
        const rect = document.createElementNS(SVG, 'rect');
        rect.setAttribute('x', String(r.left - origin.left - inset));
        rect.setAttribute('y', String(r.top - origin.top - inset));
        rect.setAttribute('width', String(r.width + 2 * inset));
        rect.setAttribute('height', String(r.height + 2 * inset));
        rect.setAttribute('rx', '8');
        rect.setAttribute('class', `presence-${kind}`);
        rect.style.stroke = person.color;
        rect.dataset.person = person.name;
        group.append(rect);
      };
      const tag = (x: number, y: number, text: string, person: Person, kind: string) => {
        const g = document.createElementNS(SVG, 'g');
        g.setAttribute('class', `presence-tag ${kind}`);
        g.setAttribute('transform', `translate(${x},${y})`);
        g.dataset.person = person.name;
        const label = document.createElementNS(SVG, 'text');
        label.textContent = text;
        label.setAttribute('x', '6');
        label.setAttribute('y', '13');
        const back = document.createElementNS(SVG, 'rect');
        back.setAttribute('rx', '4');
        back.setAttribute('height', '18');
        back.style.fill = person.color;
        g.append(back, label);
        group.append(g);
        // Fit the background to the text once it's laid out.
        back.setAttribute('width', String(label.getComputedTextLength() + 12));
      };
      for (const person of others) {
        for (const item of person.selection) for (const r of copies(item)) box(r, 3, person, 'selection');
        if (person.drag) {
          const rects = copies(person.drag.item);
          for (const r of rects) box(r, 5, person, 'drag');
          const first = rects[0];
          if (first) {
            const where = person.drag.label ? ` → ${person.drag.label}` : '';
            tag(first.left - origin.left - 5, first.top - origin.top - 24, `${person.name} is moving this${where}`, person, 'moving');
          }
        }
      }
      for (const person of pointers) {
        const p = person.pointer!;
        // The first copy on screen; a copy scrolled out of view, or under the pinned headers, doesn't count.
        const r = copies(p.item).find(
          (c) => !view || (c.right > view.left && c.left < view.right && c.bottom > view.top && c.top < view.bottom),
        );
        if (!r) continue;
        const x = r.left - origin.left + p.fx * r.width;
        const y = r.top - origin.top + p.fy * r.height;
        const arrow = document.createElementNS(SVG, 'path');
        arrow.setAttribute('d', ARROW);
        arrow.setAttribute('transform', `translate(${x},${y})`);
        arrow.setAttribute('class', 'presence-pointer');
        arrow.style.fill = person.color;
        arrow.dataset.person = person.name;
        group.append(arrow);
        tag(x + 10, y + 16, person.name, person, 'pointer');
      }
    };
    return redrawOnChange(draw, boardEl, scroller.current);
  }, [others, pointers, board, scroller, layoutKey]);

  return (
    <svg ref={svgRef} className="presence-layer" aria-hidden="true" data-testid="presence-layer">
      <defs>
        <clipPath id="presence-clip">
          <rect x="0" y="0" width="100%" height="100%" />
        </clipPath>
      </defs>
      <g className="marks" clipPath="url(#presence-clip)" />
    </svg>
  );
}
