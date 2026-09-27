import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ItemId } from '../domain/model.ts';
import type { DropMode, DropTarget } from '../domain/move.ts';
import type { CardRef } from '../domain/view.ts';

// Pointer-event drag and drop (docs/decisions/0007-drag-and-drop.md).
// Drop targets are DOM elements carrying data-drop="cell", with data-row and
// data-column lane keys. A holding lane leaves out the axis it has no value
// on, which reads as null. The pinned edges of the board (.corner,
// .holding-head, .holding-row-header) bound the area that edge-scrolls.
// Breadcrumb segments carry data-drop="parent" data-parent=… (empty for the
// top level): dropping there moves the card out to that level.

/** A cell or holding lane, or a level of the tree to move a card to. */
export type BoardTarget = DropTarget | { parent: ItemId | null };

export const isParentTarget = (t: BoardTarget | null): t is { parent: ItemId | null } =>
  t !== null && 'parent' in t;

export interface DragState {
  card: CardRef;
  title: string;
  /** Pointer position, viewport coordinates. */
  x: number;
  y: number;
  /** Where inside the card the pointer grabbed it, so the ghost doesn't jump. */
  grabX: number;
  grabY: number;
  width: number;
  target: BoardTarget | null;
  mode: DropMode;
}

const DRAG_THRESHOLD_PX = 4;
const EDGE_PX = 56;
const MAX_SCROLL_PX_PER_FRAME = 18;
/** The pointer must rest near an edge this long before scrolling starts, so merely crossing an edge doesn't. */
const EDGE_DWELL_MS = 200;

function targetAt(x: number, y: number): BoardTarget | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
  if (!el) return null;
  if (el.dataset.drop === 'parent') return { parent: el.dataset.parent || null };
  if (el.dataset.drop !== 'cell') return null;
  return { x: el.dataset.column ?? null, y: el.dataset.row ?? null };
}

export function sameTarget(a: BoardTarget | null, b: BoardTarget | null): boolean {
  if (a === null || b === null) return a === b;
  if (isParentTarget(a) || isParentTarget(b)) return isParentTarget(a) && isParentTarget(b) && a.parent === b.parent;
  return a.x === b.x && a.y === b.y;
}

/**
 * The part of the board that scrolls under the pinned headers and holding
 * lanes. Hovering a pinned edge never scrolls, so the lane under the pointer
 * stays put while you aim for it.
 */
function scrollingArea(scroller: HTMLElement): { left: number; top: number; right: number; bottom: number } {
  const rect = scroller.getBoundingClientRect();
  const edge = (selector: string) => scroller.querySelector(selector)?.getBoundingClientRect();
  const corner = edge('.corner');
  const right = edge('.holding-head');
  const bottom = edge('.holding-row-header');
  return {
    left: corner?.right ?? rect.left,
    top: corner?.bottom ?? rect.top,
    right: Math.min(right?.left ?? rect.right, rect.right),
    bottom: Math.min(bottom?.top ?? rect.bottom, rect.bottom),
  };
}

/**
 * Scroll speed for a pointer near an inside edge of [start, end]: negative,
 * zero, or positive. Zero outside the range.
 */
export function edgeSpeed(pos: number, start: number, end: number): number {
  if (pos < start || pos > end) return 0;
  if (pos < start + EDGE_PX) return -MAX_SCROLL_PX_PER_FRAME * Math.min(1, (start + EDGE_PX - pos) / EDGE_PX);
  if (pos > end - EDGE_PX) return MAX_SCROLL_PX_PER_FRAME * Math.min(1, (pos - (end - EDGE_PX)) / EDGE_PX);
  return 0;
}

/**
 * Drag cards between cells. `scrollRef` is the board's scroll container,
 * which scrolls when the pointer nears its edges. A press that never moves
 * past the drag threshold is a click, reported to `onClick`.
 */
export function useCardDrag(
  onDrop: (card: CardRef, target: BoardTarget, mode: DropMode) => void,
  scrollRef: React.RefObject<HTMLElement | null>,
  onClick: (card: CardRef, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void = () => undefined,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pending = useRef<{
    card: CardRef;
    title: string;
    startX: number;
    startY: number;
    rect: DOMRect;
    /** False for a press that can only be a click, such as on a faded copy. */
    draggable: boolean;
  } | null>(null);
  const frame = useRef<number | null>(null);
  const edgeSince = useRef<number | null>(null);
  /** Set by an Alt-drop, so the Alt release that follows it is swallowed too. */
  const swallowAltUp = useRef(false);
  const onDropRef = useRef(onDrop);
  const onClickRef = useRef(onClick);
  useEffect(() => {
    onDropRef.current = onDrop;
    onClickRef.current = onClick;
  }, [onDrop, onClick]);

  const update = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const stop = useCallback(() => {
    pending.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    edgeSince.current = null;
    document.body.classList.remove('dragging');
    update(null);
  }, [update]);

  useEffect(() => {
    // Keep scrolling while the pointer rests near an edge, re-checking the target underneath.
    const autoScroll = () => {
      frame.current = null;
      const current = dragRef.current;
      const scroller = scrollRef.current;
      if (!current || !scroller) return;
      const area = scrollingArea(scroller);
      const inside =
        current.x >= area.left && current.x <= area.right && current.y >= area.top && current.y <= area.bottom;
      const dx = inside ? edgeSpeed(current.x, area.left, area.right) : 0;
      const dy = inside ? edgeSpeed(current.y, area.top, area.bottom) : 0;
      if (dx === 0 && dy === 0) {
        edgeSince.current = null;
        return;
      }
      edgeSince.current ??= performance.now();
      if (performance.now() - edgeSince.current < EDGE_DWELL_MS) {
        frame.current = requestAnimationFrame(autoScroll);
        return;
      }
      const { scrollLeft, scrollTop } = scroller;
      scroller.scrollBy(dx, dy);
      // At the scroll limit nothing moved; don't re-render 60 times a second for nothing.
      if (scroller.scrollLeft !== scrollLeft || scroller.scrollTop !== scrollTop) {
        const target = targetAt(current.x, current.y);
        if (!sameTarget(target, current.target)) update({ ...current, target });
      }
      frame.current = requestAnimationFrame(autoScroll);
    };

    const move = (e: PointerEvent) => {
      const start = pending.current;
      const current = dragRef.current;
      // Released outside the window, where we never saw the pointerup: cancel rather than stay stuck.
      if ((start || current) && e.buttons === 0) {
        stop();
        return;
      }
      if (!current && start) {
        if (!start.draggable) return;
        if (Math.hypot(e.clientX - start.startX, e.clientY - start.startY) < DRAG_THRESHOLD_PX) return;
        document.body.classList.add('dragging');
      } else if (!current) {
        return;
      }
      const base = current ?? {
        card: start!.card,
        title: start!.title,
        grabX: start!.startX - start!.rect.left,
        grabY: start!.startY - start!.rect.top,
        width: start!.rect.width,
      };
      const target = targetAt(e.clientX, e.clientY);
      update({
        ...base,
        x: e.clientX,
        y: e.clientY,
        // Keep the same object while over the same target, so the board (memoized) doesn't re-render.
        target: current && sameTarget(target, current.target) ? current.target : target,
        mode: e.altKey ? 'add' : 'replace',
      });
      if (frame.current === null) frame.current = requestAnimationFrame(autoScroll);
    };
    const up = (e: PointerEvent) => {
      const current = dragRef.current;
      const pressed = pending.current;
      stop();
      if (!current && pressed) {
        onClickRef.current(pressed.card, e);
        return;
      }
      if (current && e.altKey) swallowAltUp.current = true;
      if (current?.target) onDropRef.current(current.card, current.target, e.altKey ? 'add' : 'replace');
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stop();
        return;
      }
      if (e.key !== 'Alt') {
        swallowAltUp.current = false;
        return;
      }
      // Windows browsers open the menu bar when Alt is released. Swallow that
      // release during a drag, and right after an Alt-drop (you let go of
      // the mouse before the key).
      if (dragRef.current) {
        e.preventDefault();
        update({ ...dragRef.current, mode: e.type === 'keydown' ? 'add' : 'replace' });
      } else if (e.type === 'keyup' && swallowAltUp.current) {
        e.preventDefault();
        swallowAltUp.current = false;
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
    };
  }, [scrollRef, stop, update]);

  const startDrag = useCallback((e: ReactPointerEvent<HTMLElement>, card: CardRef, title: string, draggable = true) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection while dragging
    // Keep receiving pointer events even if the pointer leaves the window.
    e.currentTarget.setPointerCapture(e.pointerId);
    pending.current = {
      card,
      title,
      startX: e.clientX,
      startY: e.clientY,
      rect: e.currentTarget.getBoundingClientRect(),
      draggable,
    };
  }, []);

  return { drag, startDrag };
}
