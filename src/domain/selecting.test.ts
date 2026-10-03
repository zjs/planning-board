import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { SEQUENCE, SIZE, SYSTEM, TIME } from './model.ts';
import { cardsOnBoard, laneCards, matchingCards } from './selecting.ts';
import { layoutView, type ViewSpec } from './view.ts';

const timeBySystem: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };
const seqBySize: ViewSpec = { x: { property: SEQUENCE, level: 0 }, y: { property: SIZE, level: 0 } };

const p = plan(
  item('login', { values: { [SYSTEM]: ['id/sso'], [TIME]: ['q1'], [SIZE]: ['l'] } }),
  item('mfa', { values: { [SYSTEM]: ['id/mfa', 'pay'], [TIME]: ['q2'], [SIZE]: ['s'] } }),
  item('ledger', { values: { [SYSTEM]: ['pay/ledger'], [SIZE]: ['l'] } }),
  item('loose', {}),
  item('epic', { values: { [SYSTEM]: ['id'], [TIME]: ['q1'] } }),
  item('story', { parent: 'epic', values: { [SYSTEM]: ['pay'], [TIME]: ['q1'], [SIZE]: ['l'] } }),
);

describe('selecting matches (Q47)', () => {
  it('⌘A: every card on the board once, never the faded copy of a group, but the cards it frames', () => {
    const layout = layoutView(p, timeBySystem);
    expect(cardsOnBoard(layout).sort()).toEqual(['epic', 'ledger', 'login', 'loose', 'mfa', 'story']);
  });

  it('a badge selects every card holding that value, whatever the axes', () => {
    const layout = layoutView(p, seqBySize);
    // The story is inside the folded epic, which has no size: it isn't on this board.
    expect(matchingCards(p, layout, TIME, 'q1').sort()).toEqual(['epic', 'login']);
    // A parent value matches everything below it.
    expect(matchingCards(p, layout, SYSTEM, 'id').sort()).toEqual(['epic', 'login', 'mfa']);
    expect(matchingCards(p, layout, SYSTEM, 'id/sso')).toEqual(['login']);
    expect(matchingCards(p, layout, 'nope', 'x')).toEqual([]);
  });

  it('only cards on the board match: a collapsed group hides its children', () => {
    const layout = layoutView(p, seqBySize);
    expect(matchingCards(p, layout, SIZE, 'l').sort()).toEqual(['ledger', 'login']);
    const expanded = layoutView(p, { ...seqBySize, expanded: ['epic'] });
    expect(matchingCards(p, expanded, SIZE, 'l').sort()).toEqual(['ledger', 'login', 'story']);
  });

  it('a lane header selects the cards in that lane, holding cells included', () => {
    const layout = layoutView(p, timeBySystem);
    const row = (key: string) => layout.rows.findIndex((l) => l.key === key);
    const column = (key: string) => layout.columns.findIndex((l) => l.key === key);
    expect(laneCards(layout, 'y', row('id'), row('id') + 1).sort()).toEqual(['epic', 'login', 'mfa']);
    // Ledger has no quarter: it's in Payments' holding cell.
    expect(laneCards(layout, 'y', row('pay'), row('pay') + 1).sort()).toEqual(['ledger', 'mfa', 'story']);
    expect(laneCards(layout, 'x', column('q1'), column('q1') + 1).sort()).toEqual(['epic', 'login', 'story']);
    expect(laneCards(layout, 'y', 0, layout.rows.length).sort()).toEqual(['epic', 'ledger', 'login', 'mfa', 'story']);
  });
});
