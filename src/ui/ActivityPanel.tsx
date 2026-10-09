import { useMemo, useState } from 'react';
import type { HistoryEntry } from '../commands/history.ts';
import { describeChange, titlesFrom } from '../domain/describe.ts';
import { changedItems, type Change } from '../domain/diff.ts';
import { authors, groupBursts, shownTime, type Burst } from '../domain/history.ts';
import type { ItemId, Plan } from '../domain/model.ts';
import { colorFor } from '../domain/presence.ts';
import { useNow } from './useNow.ts';
import { dayHeading, dayKey, formatWhen, timeOfDay } from '../domain/time.ts';

interface Props {
  plan: Plan;
  entries: readonly HistoryEntry[];
  /** This plan's history from before it was shared, on the computer it was drafted on (Q73). */
  earlier: readonly HistoryEntry[];
  /** How far the relay's clock is ahead of each person's, where it's off (ADR 0020). */
  clocks: ReadonlyMap<string, number>;
  /** This person's id, so their entries say "You". */
  me: string;
  canEdit: boolean;
  onClose: () => void;
  onReveal: (id: ItemId) => void;
  /** Bring back a deleted card and everything deleted with it. */
  onRestore: (change: Extract<Change, { kind: 'deleted' }>) => void;
}

/**
 * Activity (requirement 36, artboard 6): who changed what on this plan, and
 * when, in your time zone. Days newest first; one person's changes close
 * together are one row that opens (Q74). A deletion can be restored.
 */
export function ActivityPanel({ plan, entries, earlier, clocks, me, canEdit, onClose, onReveal, onRestore }: Props) {
  const [person, setPerson] = useState('');
  const now = useNow();
  const time = (e: HistoryEntry) => shownTime(e, clocks.get(e.by));
  const titles = useMemo(() => titlesFrom([...earlier, ...entries].flatMap((e) => e.changes)), [entries, earlier]);
  const people = useMemo(() => authors([...entries, ...earlier]), [entries, earlier]);
  const shown = (list: readonly HistoryEntry[]) => (person === '' ? list : list.filter((e) => e.by === person));
  const name = (by: string, chosen: string) => (by === me ? 'You' : chosen);
  const say = (change: Change) => describeChange(change, plan, (id) => titles.get(id));

  const line = (entry: HistoryEntry, change: Change, key: number) => {
    const target = changedItems(change).find((id) => plan.items[id]);
    const restorable = change.kind === 'deleted' && !plan.items[change.item];
    return (
      <li key={key} className="activity-change">
        {target ? (
          <button type="button" className="link" onClick={() => onReveal(target)} title="Show it on the board">
            {say(change)}
          </button>
        ) : (
          <span>{say(change)}</span>
        )}
        {entry.via && <span className="activity-via"> ({entry.via})</span>}
        {restorable && canEdit && (
          <button type="button" className="activity-restore" onClick={() => onRestore(change)} data-testid="activity-restore">
            Restore
          </button>
        )}
      </li>
    );
  };

  const summary = (burst: Burst) => {
    const who = name(burst.by, burst.name);
    const [first] = burst.entries;
    if (first?.event === 'shared') return `${who} shared the plan`;
    const changes = burst.entries.flatMap((e) => e.changes);
    if (changes.length === 1 && first) return `${who} ${say(changes[0]!)}${first.via ? ` (${first.via})` : ''}`;
    return `${who} made ${changes.length} changes`;
  };

  const bursts = (list: readonly HistoryEntry[], label?: string) => {
    const days = new Map<string, Burst[]>();
    for (const burst of groupBursts(shown(list), time)) {
      const key = dayKey(burst.to);
      days.set(key, [...(days.get(key) ?? []), burst]);
    }
    return (
      <>
        {label && days.size > 0 && <h3 className="activity-section">{label}</h3>}
        {[...days.values()].map((day) => (
          <section key={dayKey(day[0]!.to)} className="activity-day">
            <h4>{dayHeading(day[0]!.to, now)}</h4>
            <ul>
              {day.map((burst) => {
                const changes = burst.entries.flatMap((e) => e.changes.map((c) => [e, c] as const));
                const when = timeOfDay(burst.from) === timeOfDay(burst.to) ? formatWhen(burst.to, now) : `${timeOfDay(burst.from)}–${timeOfDay(burst.to)}`;
                const dot = <span className="activity-dot" style={{ background: colorFor(burst.by).hex }} aria-hidden="true" />;
                const head = (
                  <>
                    {dot}
                    <span className="activity-text">{summary(burst)}</span>
                    <time dateTime={new Date(burst.to).toISOString()}>{when}</time>
                  </>
                );
                return (
                  <li key={burst.entries[0]!.id} className="activity-row" data-testid="activity-row" data-person={burst.name}>
                    {changes.length <= 1 ? (
                      <div className="activity-head">
                        {head}
                        {changes[0] && changes[0][1].kind === 'deleted' && !plan.items[changes[0][1].item] && canEdit && (
                          <button type="button" className="activity-restore" onClick={() => onRestore(changes[0]![1] as Extract<Change, { kind: 'deleted' }>)} data-testid="activity-restore">
                            Restore
                          </button>
                        )}
                        {changes[0] && changedItems(changes[0][1]).some((id) => plan.items[id]) && (
                          <button type="button" className="link activity-show" onClick={() => onReveal(changedItems(changes[0]![1]).find((id) => plan.items[id])!)}>
                            Show
                          </button>
                        )}
                      </div>
                    ) : (
                      <details>
                        <summary className="activity-head">{head}</summary>
                        <ul>{changes.map(([entry, change], i) => line(entry, change, i))}</ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </>
    );
  };

  const empty = shown(entries).length === 0 && shown(earlier).length === 0;
  return (
    <aside className="side-panel activity" aria-label="Activity" data-testid="activity">
      <header>
        <h2>Activity</h2>
        <button type="button" onClick={onClose} aria-label="Close activity">
          ✕
        </button>
      </header>
      {people.length > 1 && (
        <label className="activity-filter">
          Show
          <select value={person} onChange={(e) => setPerson(e.target.value)} data-testid="activity-person">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.by} value={p.by}>
                {name(p.by, p.name)}
              </option>
            ))}
          </select>
        </label>
      )}
      {empty && <p className="panel-hint">Changes to this plan show here: who made them, and when.</p>}
      {bursts(entries)}
      {bursts(earlier, 'Before sharing · only on this computer')}
      <p className="activity-note">Names are the ones people chose. History is kept forever, and times are shown in your time zone.</p>
    </aside>
  );
}
