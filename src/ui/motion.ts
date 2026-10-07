// Pivots that move (Q52, ADR 0015). Cards glide from where they were to where
// the new view puts them, so it's visible that these are the same cards. FLIP:
// measure before the change, render, measure after, then animate the
// difference away. Viewer-side only: nothing here touches the plan.

const DURATION_MS = 320;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/** Where each card was: its first copy on screen, keyed by item. */
export type Positions = ReadonlyMap<string, DOMRect>;

const cardsIn = (root: HTMLElement) => root.querySelectorAll<HTMLElement>('.card[data-item]');

export function capturePositions(root: HTMLElement): Positions {
  const out = new Map<string, DOMRect>();
  for (const el of cardsIn(root)) {
    const id = el.dataset.item!;
    if (!out.has(id)) out.set(id, el.getBoundingClientRect());
  }
  return out;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animate every card from its old place to its new one. A card's extra
 * copies start from its old first copy; a card that wasn't on the board
 * fades in. Cards off screen both before and after are left alone, so a big
 * board costs no more than what's visible. Returns how long it runs, in ms,
 * or 0 if nothing moves.
 */
export function playFrom(root: HTMLElement, before: Positions): number {
  if (prefersReducedMotion()) return 0;
  const view = root.getBoundingClientRect();
  const visible = (r: DOMRect) => r.bottom > view.top && r.top < view.bottom && r.right > view.left && r.left < view.right;
  let moved = 0;
  for (const el of cardsIn(root)) {
    if (typeof el.animate !== 'function') return 0;
    const now = el.getBoundingClientRect();
    const was = before.get(el.dataset.item!);
    if (!was) {
      if (!visible(now)) continue;
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION_MS, easing: EASING });
      moved++;
      continue;
    }
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    if ((dx === 0 && dy === 0) || !(visible(now) || visible(was))) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
      duration: DURATION_MS,
      easing: EASING,
    });
    moved++;
  }
  return moved > 0 ? DURATION_MS : 0;
}
