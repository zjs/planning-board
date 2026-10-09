import { useEffect, useState } from 'react';

/** The time, moving on once a minute: for "Today" and "10:42" that stay right while a panel is open. */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
