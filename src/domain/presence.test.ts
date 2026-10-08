import { describe, expect, it } from 'vitest';
import {
  colorFor,
  currentDriver,
  initials,
  MAX_SELECTION,
  nextClaim,
  parsePeerState,
  people,
  PRESENCE_COLORS,
  visiblePointers,
  type PeerState,
} from './presence.ts';

const state = (id: string, patch: Partial<PeerState> = {}): PeerState => ({
  v: 1,
  id,
  name: id.toUpperCase(),
  color: '#c92a2a',
  pointer: null,
  selection: [],
  drag: null,
  drive: null,
  dropped: null,
  ...patch,
});

describe('reading presence from other browsers', () => {
  it('keeps a well-formed message', () => {
    const s = state('ada', { pointer: { item: 'a', fx: 0.25, fy: 0.5 }, selection: ['a', 'b'], drag: { item: 'a', label: 'Q3 · Billing' } });
    expect(parsePeerState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('drops anything out of shape, rather than drawing it', () => {
    expect(parsePeerState(null)).toBeNull();
    expect(parsePeerState({ ...state('ada'), v: 2 })).toBeNull();
    expect(parsePeerState({ ...state('ada'), id: 7 })).toBeNull();
    const odd = parsePeerState({ ...state('ada'), color: 'url(evil)', pointer: { item: 'a', fx: 4, fy: -1 }, selection: ['a', 3] });
    expect(odd).toMatchObject({ color: '#868e96', pointer: { fx: 1, fy: 0 }, selection: ['a'] });
    const many = parsePeerState({ ...state('ada'), selection: Array.from({ length: 500 }, (_, i) => `c${i}`) });
    expect(many?.selection).toHaveLength(MAX_SELECTION);
  });
});

describe('people, however many tabs', () => {
  it('shows a person with two tabs once, with both tabs’ selections', () => {
    const list = people([
      state('bo', { selection: ['x'] }),
      state('ada', { selection: ['a'] }),
      state('bo', { selection: ['y'], pointer: { item: 'y', fx: 0, fy: 0 } }),
    ]);
    expect(list.map((p) => p.id)).toEqual(['ada', 'bo']);
    expect(list[1]).toMatchObject({ selection: ['x', 'y'], pointer: { item: 'y' } });
  });
});

describe('the driver (Q71)', () => {
  it('is nobody until someone claims, then the latest claim', () => {
    const ada = state('ada');
    const bo = state('bo');
    expect(currentDriver([ada, bo])).toBeNull();
    ada.drive = nextClaim([ada, bo]);
    expect(currentDriver([ada, bo])).toBe('ada');
    bo.drive = nextClaim([ada, bo]);
    expect(currentDriver([ada, bo])).toBe('bo');
  });

  it('settles two claims made at once the same way everywhere', () => {
    const claims = [state('ada', { drive: 3 }), state('bo', { drive: 3 })];
    expect(currentDriver(claims)).toBe('bo');
    expect(currentDriver([...claims].reverse())).toBe('bo');
  });

  it('passes on when the driver stops or leaves', () => {
    const claims = [state('ada', { drive: 2 }), state('bo', { drive: 5 })];
    expect(currentDriver(claims.slice(0, 1))).toBe('ada');
    expect(currentDriver([claims[0]!, { ...claims[1]!, drive: null }])).toBe('ada');
  });

  it('a new claim beats every claim seen, even ones no longer present', () => {
    expect(nextClaim([state('ada', { drive: 2 })], 9)).toBe(10);
  });
});

describe('whose pointers show (Q61)', () => {
  const at = { item: 'a', fx: 0.5, fy: 0.5 };
  const present = people([state('me', { pointer: at }), state('ada', { pointer: at }), state('bo', { pointer: at }), state('cy')]);

  it('Everyone: everyone else pointing at a card', () => {
    expect(visiblePointers(present, 'everyone', null, 'me').map((p) => p.id)).toEqual(['ada', 'bo']);
  });

  it('Driver only: just the driver, and nobody when nobody drives', () => {
    expect(visiblePointers(present, 'driver', 'bo', 'me').map((p) => p.id)).toEqual(['bo']);
    expect(visiblePointers(present, 'driver', null, 'me')).toEqual([]);
    expect(visiblePointers(present, 'driver', 'me', 'me')).toEqual([]);
  });

  it('None: nobody', () => {
    expect(visiblePointers(present, 'none', 'bo', 'me')).toEqual([]);
  });
});

describe('colors and initials', () => {
  it('gives a person the same named color everywhere', () => {
    expect(colorFor('p-123')).toEqual(colorFor('p-123'));
    expect(PRESENCE_COLORS).toContainEqual(colorFor('anyone'));
  });

  it('makes initials', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('bo')).toBe('B');
    expect(initials('  ')).toBe('?');
    expect(initials('Grace Brewster Hopper')).toBe('GH');
  });
});
