import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { DropMode, DropTarget } from '../domain/move.ts';
import type { CardRef } from '../domain/view.ts';

// Pointer-event drag and drop (docs/decisions/0007-drag-and-drop.md).
// Drop targets are DOM elements carrying data-drop:
//   data-drop="cell" data-row=… data-column=…   a board cell
//   data-drop="clear-x" | "clear-y"             holding-area "remove value" zones

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
  target: DropTarget | null;
  mode: DropMode;
}

const DRAG_THRESHOLD_PX = 4;
const EDGE_PX = 56;
const MAX_SCROLL_PX_PER_FRAME = 18;
/** The pointer must rest near an edge this long before scrolling starts, so merely crossing an edge doesn't. */
const EDGE_DWELL_MS = 200;

function targetAt(x: number, y: number): DropTarget | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
  if (!el) return null;
  const kind = el.dataset.drop;
  if (kind === 'cell' && el.dataset.row !== undefined && el.dataset.column !== undefined) {
    return { kind: 'cell', x: el.dataset.column, y: el.dataset.row };
  }
  if (kind === 'clear-x') return { kind: 'clear', axis: 'x' };
  if (kind === 'clear-y') return { kind: 'clear', axis: 'y' };
  return null;
}

/**
 * Scroll speed for a pointer near an inside edge of [start, end]: negative,
 * zero, or positive. Zero outside the range, so hovering the holding area
 * next to the board doesn't scroll it.
 */
export function edgeSpeed(pos: number, start: number, end: number): number {
  if (pos < start || pos > end) return 0;
  if (pos < start + EDGE_PX) return -MAX_SCROLL_PX_PER_FRAME * Math.min(1, (start + EDGE_PX - pos) / EDGE_PX);
  if (pos > end - EDGE_PX) return MAX_SCROLL_PX_PER_FRAME * Math.min(1, (pos - (end - EDGE_PX)) / EDGE_PX);
  return 0;
}

/**
 * Drag cards between cells. `scrollRef` is the board's scroll container,
 * which scrolls when the pointer nears its edges.
 */
export function useCardDrag(
  onDrop: (card: CardRef, target: DropTarget, mode: DropMode) => void,
  scrollRef: React.RefObject<HTMLElement | null>,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pending = useRef<{ card: CardRef; title: string; startX: number; startY: number; rect: DOMRect } | null>(null);
  const frame = useRef<number | null>(null);
  const edgeSince = useRef<number | null>(null);
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

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
      const rect = scroller.getBoundingClientRect();
      const inside =
        current.x >= rect.left && current.x <= rect.right && current.y >= rect.top && current.y <= rect.bottom;
      const dx = inside ? edgeSpeed(current.x, rect.left, rect.right) : 0;
      const dy = inside ? edgeSpeed(current.y, rect.top, rect.bottom) : 0;
      if (dx === 0 && dy === 0) {
        edgeSince.current = null;
        return;
      }
      edgeSince.current ??= performance.now();
      if (performance.now() - edgeSince.current < EDGE_DWELL_MS) {
        frame.current = requestAnimationFrame(autoScroll);
        return;
      }
      scroller.scrollBy(dx, dy);
      update({ ...current, target: targetAt(current.x, current.y) });
      frame.current = requestAnimationFrame(autoScroll);
    };

    const move = (e: PointerEvent) => {
      const start = pending.current;
      const current = dragRef.current;
      if (!current && start) {
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
      update({
        ...base,
        x: e.clientX,
        y: e.clientY,
        target: targetAt(e.clientX, e.clientY),
        mode: e.altKey ? 'add' : 'replace',
      });
      if (frame.current === null) frame.current = requestAnimationFrame(autoScroll);
    };
    const up = (e: PointerEvent) => {
      const current = dragRef.current;
      stop();
      if (current?.target) onDropRef.current(current.card, current.target, e.altKey ? 'add' : 'replace');
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
      else if (e.key === 'Alt' && dragRef.current) {
        // Stops Windows browsers from opening the menu bar when Alt is released mid-drag.
        e.preventDefault();
        update({ ...dragRef.current, mode: e.type === 'keydown' ? 'add' : 'replace' });
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

  const startDrag = useCallback((e: ReactPointerEvent<HTMLElement>, card: CardRef, title: string) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection while dragging
    pending.current = {
      card,
      title,
      startX: e.clientX,
      startY: e.clientY,
      rect: e.currentTarget.getBoundingClientRect(),
    };
  }, []);

  return { drag, startDrag };
}
