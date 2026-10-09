import { describe, expect, it } from 'vitest';
import { authors, entriesForItem, groupBursts, parseEntry, shownTime, type HistoryEntry } from './history.ts';

const minute = 60_000;
const entry = (id: string, by: string, at: number, changes: HistoryEntry['changes'] = [{ kind: 'sequence', item: 'tax', from: null, to: 'a0' }]): HistoryEntry => ({
  v: 1,
  id,
  by,
  name: by === 'a' ? 'Ada' : 'Bo',
  at,
  changes,
});
const t = (e: HistoryEntry) => e.at;

describe('history entries (ADR 0020)', () => {
  it('reads entries from other browsers, and refuses what it can’t read', () => {
    const good = entry('e1', 'a', 1000);
    expect(parseEntry(JSON.parse(JSON.stringify(good)))).toEqual(good);
    expect(parseEntry({ ...good, v: 2 })).toBeNull();
    expect(parseEntry({ ...good, at: 'yesterday' })).toBeNull();
    expect(parseEntry({ ...good, changes: [{ kind: 'exploded' }] })).toBeNull();
    expect(parseEntry({ ...good, changes: [{ kind: 'renamed', item: 4 }] })).toBeNull();
    const values = { ...good, changes: [{ kind: 'values', item: 'tax', property: 'time', from: ['q1'], to: [] }] };
    expect(parseEntry(values)).toEqual(values);
    expect(parseEntry({ ...good, changes: [{ kind: 'values', item: 'tax', property: 'time', from: 'q1', to: [] }] })).toBeNull();
    const group = { ...good, changes: [{ kind: 'group', item: 'tax', from: null, to: 'epic' }] };
    expect(parseEntry(group)).toEqual(group);
    expect(parseEntry({ ...good, name: 'x'.repeat(200) })?.name).toHaveLength(60);
  });

  it('corrects an author’s clock that’s more than a minute out from the relay’s', () => {
    const e = entry('e1', 'a', 10 * minute);
    expect(shownTime(e)).toBe(10 * minute);
    expect(shownTime(e, 30_000)).toBe(10 * minute);
    expect(shownTime(e, 60 * minute)).toBe(70 * minute);
    expect(shownTime(e, -5 * minute)).toBe(5 * minute);
  });

  it('groups one person’s changes within five minutes of each other into a burst (Q74)', () => {
    const entries = [entry('1', 'a', 0), entry('2', 'a', 4 * minute), entry('3', 'a', 8 * minute), entry('4', 'b', 9 * minute), entry('5', 'a', 20 * minute)];
    const bursts = groupBursts(entries, t);
    expect(bursts.map((b) => [b.name, b.entries.map((e) => e.id)])).toEqual([
      ['Ada', ['5']],
      ['Bo', ['4']],
      ['Ada', ['3', '2', '1']],
    ]);
    expect(bursts[2]).toMatchObject({ from: 0, to: 8 * minute });
    // Sharing always stands alone.
    const shared = { ...entry('0', 'a', -minute, []), event: 'shared' as const };
    expect(groupBursts([shared, ...entries], t).at(-1)!.entries).toEqual([shared]);
  });

  it('finds a card’s history, with only the changes about it', () => {
    const entries = [
      entry('1', 'a', 0, [
        { kind: 'sequence', item: 'tax', from: null, to: 'a0' },
        { kind: 'sequence', item: 'other', from: null, to: 'a0' },
      ]),
      entry('2', 'b', minute, [{ kind: 'linked', from: 'other', to: 'tax' }]),
      entry('3', 'b', 2 * minute, [{ kind: 'renamed', item: 'other', from: 'x', to: 'y' }]),
      entry('4', 'a', 3 * minute, [{ kind: 'deleted', item: 'group', title: 'G', with: ['tax'] }]),
    ];
    expect(entriesForItem(entries, 'tax', t).map((e) => [e.id, e.changes.length])).toEqual([
      ['4', 1],
      ['2', 1],
      ['1', 1],
    ]);
    expect(authors(entries)).toEqual([
      { by: 'a', name: 'Ada' },
      { by: 'b', name: 'Bo' },
    ]);
  });
});
