import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import {
  claimToDrive,
  currentDriver,
  cursorSetting,
  IDLE,
  myPresenceId,
  people,
  setCursorSetting,
  sharePresence,
  visiblePointers,
  type Activity,
  type CursorSetting,
  type Person,
} from '../commands/presence.ts';
import type { Presence } from '../commands/store.ts';

const NONE: never[] = [];

/** The board's view of presence (ADR 0019): everyone else, the driver, and what this tab shares. */
export interface PresenceView {
  /** Everyone else present, one per person. */
  others: Person[];
  /** Whose pointers to draw, after the cursor setting. */
  pointers: Person[];
  /** Who's driving, by presence ID, or null (Q71). */
  driver: string | null;
  me: string;
  driving: boolean;
  toggleDriving: () => void;
  setting: CursorSetting;
  setSetting: (setting: CursorSetting) => void;
  /** Share part of what this tab is doing: a drag, a drop. */
  share: (patch: Partial<Activity>) => void;
  /** Share again, after a change of name. */
  refresh: () => void;
  /** Someone else dragging this card right now (Q60). */
  movingNow: (item: string) => Person | null;
  /** Someone else whose drop of this card arrived here in the last few seconds (Q60). */
  droppedRecently: (item: string, withinMs?: number) => Person | null;
}

/**
 * Presence for one open plan: follows everyone else, and shares this tab's
 * pointer and selection. The pointer is tracked on the board itself, as the
 * card under it and where on that card, so it means the same in any view.
 */
export function usePresence(
  presence: Presence | null,
  selected: ReadonlySet<string>,
  scroller: RefObject<HTMLDivElement | null>,
): PresenceView | null {
  const states = useSyncExternalStore(
    useCallback((listener: () => void) => presence?.subscribe(listener) ?? (() => undefined), [presence]),
    () => presence?.states() ?? NONE,
  );
  // What this tab shares lives in a ref: a pointer moving shouldn't render the board.
  const activity = useRef<Activity>(IDLE);
  const share = useCallback(
    (patch: Partial<Activity>) => {
      activity.current = { ...activity.current, ...patch };
      if (presence) sharePresence(presence, activity.current);
    },
    [presence],
  );
  const refresh = useCallback(() => share({}), [share]);
  // Say who's here as soon as the plan opens, before touching anything.
  useEffect(() => {
    if (presence) sharePresence(presence, activity.current);
  }, [presence]);

  useEffect(() => share({ selection: [...selected] }), [selected, share]);

  // Listened for on the whole page, since a plan opened from a link has no board until its first sync.
  useEffect(() => {
    if (!presence) return;
    const move = (e: PointerEvent) => {
      const onBoard = e.target instanceof Element && scroller.current?.contains(e.target);
      const card = onBoard ? (e.target).closest<HTMLElement>('.card[data-item]:not(.via-children)') : null;
      if (!card) {
        if (activity.current.pointer) share({ pointer: null });
        return;
      }
      const r = card.getBoundingClientRect();
      share({
        pointer: {
          item: card.dataset.item!,
          fx: r.width > 0 ? (e.clientX - r.left) / r.width : 0.5,
          fy: r.height > 0 ? (e.clientY - r.top) / r.height : 0.5,
        },
      });
    };
    const leave = () => share({ pointer: null });
    document.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      document.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, [presence, scroller, share]);

  // When each person's latest drop arrived here, by this computer's clock: theirs may be set differently.
  const drops = useRef(new Map<string, { item: string; at: number; seen: number }>());
  useEffect(() => {
    for (const p of people(states)) {
      if (!p.dropped) continue;
      const known = drops.current.get(p.id);
      if (!known || known.at !== p.dropped.at) drops.current.set(p.id, { item: p.dropped.item, at: p.dropped.at, seen: Date.now() });
    }
  }, [states]);

  const [drive, setDrive] = useState<number | null>(null);
  const [setting, setSettingState] = useState(cursorSetting);
  const me = useMemo(() => myPresenceId(), []);
  // A claim someone else has since overtaken is given up (Q71): when they stop, nobody drives, rather than the
  // lead quietly coming back to whoever had it before.
  if (drive !== null && currentDriver([...states, { id: me, drive }]) !== me) setDrive(null);
  useEffect(() => share({ drive }), [drive, share]);

  return useMemo(() => {
    if (!presence) return null;
    const everyone = people(states);
    const driver = currentDriver([...states, { id: me, drive }]);
    const others = everyone.filter((p) => p.id !== me);
    return {
      others,
      pointers: visiblePointers(others, setting, driver, me),
      driver,
      me,
      driving: driver === me,
      toggleDriving: () => {
        setDrive(driver === me ? null : claimToDrive(presence));
      },
      setting,
      setSetting: (next: CursorSetting) => {
        setCursorSetting(next);
        setSettingState(next);
      },
      share,
      refresh,
      movingNow: (item: string) => others.find((p) => p.drag?.item === item) ?? null,
      droppedRecently: (item: string, withinMs = 10_000) =>
        others.find((p) => {
          const d = drops.current.get(p.id);
          return d?.item === item && Date.now() - d.seen <= withinMs;
        }) ?? null,
    };
  }, [presence, states, me, drive, setting, share, refresh]);
}
