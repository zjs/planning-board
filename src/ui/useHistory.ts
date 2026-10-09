import { useMemo, useSyncExternalStore } from 'react';
import { historyOf, type History } from '../commands/history.ts';

const NONE = { entries: [], earlier: [], clocks: new Map<string, number>() };

/** A plan's history, read again whenever an entry or a clock arrives (ADR 0020). */
export function useHistory(history: History | null): ReturnType<typeof historyOf> {
  const version = useSyncExternalStore(
    (listener) => {
      if (!history) return () => undefined;
      return history.subscribe(() => {
        versions.set(history, (versions.get(history) ?? 0) + 1);
        listener();
      });
    },
    () => (history ? (versions.get(history) ?? 0) : -1),
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- read again on each new version
  return useMemo(() => (history ? historyOf(history) : NONE), [history, version]);
}

const versions = new WeakMap<History, number>();
