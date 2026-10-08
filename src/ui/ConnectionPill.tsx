import { useEffect, useState } from 'react';
import { unsharedChanges, type Connection, type PlanStore } from '../commands/store.ts';
import { pillState } from './connection.ts';
import { useConnection } from './ShareDialog.tsx';

/**
 * A shared plan's connection, beside its name (requirement 35, Q59): Live,
 * Reconnecting…, Offline with what isn't shared yet, View only, or what the
 * relay refused. Clicking it opens the plan's links.
 */
export function ConnectionPill({
  store,
  connection,
  viewOnly,
  hasLocal,
  onOpen,
}: {
  store: PlanStore;
  connection: Connection;
  viewOnly: boolean;
  hasLocal: boolean;
  onOpen: () => void;
}) {
  const { status, problem } = useConnection(connection);
  // Time moves on while disconnected: "Reconnecting…" after a few seconds, louder after an hour.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status === 'live') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status]);
  if (status === null) return null;
  const pill = pillState({
    status,
    problem,
    viewOnly,
    // Counted only while it can be more than a moment's worth: while live, changes go as they're made.
    unshared: status === 'live' || viewOnly ? 0 : unsharedChanges(store, connection),
    lastLive: connection.lastLive,
    lostAt: connection.lostAt,
    openedAt: connection.openedAt,
    browserOffline: typeof navigator !== 'undefined' && !navigator.onLine,
    hasLocal,
    now,
  });
  return (
    <span className="pill-group">
      <button type="button" className={`pill pill-${pill.tone}`} data-testid="connection-pill" title={pill.title} onClick={onOpen}>
        <span className="pill-dot" aria-hidden="true" />
        <span className="pill-text">
          <span data-testid="connection-state">{pill.label}</span>
          {pill.detail && <span className="pill-detail">{pill.detail}</span>}
        </span>
      </button>
      {pill.canRecreate && (
        <button type="button" className="pill-action" onClick={() => connection.recreate()} title="Make the plan again on the relay, from your copy">
          Put it back
        </button>
      )}
    </span>
  );
}
