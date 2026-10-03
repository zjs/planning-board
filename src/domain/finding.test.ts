import { describe, expect, it } from 'vitest';
import { item, plan } from './__fixtures__/tiny-plan.ts';
import { SEQUENCE, SIZE, SYSTEM, TIME } from './model.ts';
import { findOnBoard, foldText, itemMatches, queryWords, stepMatch } from './finding.ts';
import { layoutView, type ViewSpec } from './view.ts';

const timeBySystem: ViewSpec = { x: { property: TIME, level: 0 }, y: { property: SYSTEM, level: 0 } };
const seqBySize: ViewSpec = { x: { property: SEQUENCE, level: 0 }, y: { property: SIZE, level: 0 } };

const p = plan(
  item('login', { title: 'Passwordless login', values: { [SYSTEM]: ['id/sso'], [TIME]: ['q1'] } }),
  item('sso', { title: 'SSO for payments admin', externalKey: 'PAY-12', values: { [SYSTEM]: ['id', 'pay'], [TIME]: ['q2'] } }),
  item('cv', { title: 'Résumé export', description: 'Download a CV as PDF', values: { [SYSTEM]: ['pay'] } }),
  item('epic', { title: 'EU data residency', values: { [SYSTEM]: ['id'], [TIME]: ['q1'] } }),
  item('story', { title: 'Residency for SSO tokens', parent: 'epic', values: { [SYSTEM]: ['id'], [TIME]: ['q1'] } }),
  item('task', { title: 'Rotate SSO keys', parent: 'story', values: { [SYSTEM]: ['pay'], [TIME]: ['q2'] } }),
);

describe('finding cards (Q50)', () => {
  it('folds case and accents', () => {
    expect(foldText('Résumé')).toBe('resume');
    expect(queryWords('  Résumé   EXPORT ')).toEqual(['resume', 'export']);
    expect(queryWords('   ')).toEqual([]);
    expect(queryWords('PAY-12')).toEqual(['pay', '12']);
  });

  it('every word typed must start a word in the title, the key or the description', () => {
    const words = (q: string) => queryWords(q);
    expect(itemMatches(p.items.sso!, words('sso pay'))).toBe(true);
    expect(itemMatches(p.items.sso!, words('pay-12'))).toBe(true);
    expect(itemMatches(p.items.sso!, words('sso billing'))).toBe(false);
    expect(itemMatches(p.items.cv!, words('resume pdf'))).toBe(true);
    // Words can come from different fields, and the start of a word is enough.
    expect(itemMatches(p.items.cv!, words('expo downl'))).toBe(true);
    // The middle of a word isn't: "sso" doesn't find "processor".
    expect(itemMatches(item('pp', { title: 'Second payment processor' }), words('sso'))).toBe(false);
    expect(itemMatches(p.items.login!, words('word'))).toBe(false);
    expect(itemMatches(p.items.cv!, [])).toBe(false);
  });

  it('nothing typed finds nothing', () => {
    const found = findOnBoard(p, layoutView(p, timeBySystem), []);
    expect(found.matches).toEqual([]);
    expect(found.shown.size).toBe(0);
  });

  it('a match inside a folded group is counted on the card it is folded into', () => {
    const layout = layoutView(p, timeBySystem);
    const found = findOnBoard(p, layout, queryWords('sso'));
    // The story is inside the folded epic, in the epic's own cell, so it isn't on the board. The
    // task puts the epic in a cell of its own (Payments, Q2), where it's framed, so it is.
    expect([...found.shown].sort()).toEqual(['sso', 'task']);
    expect(found.inside.get('epic')).toEqual(['story']);
    expect(found.matches.length).toBe(3);
    // In a view where the task frames nothing, both are folded into the epic.
    const folded = findOnBoard(p, layoutView(p, seqBySize), queryWords('sso'));
    expect([...folded.shown]).toEqual(['sso']);
    expect(folded.inside.get('epic')).toEqual(['story', 'task']);
  });

  it('a match framed by a faded group copy is on the board', () => {
    // The task is in Payments in Q2, a cell only it reaches: the epic shows there as a frame around it.
    const layout = layoutView(p, { ...timeBySystem, expanded: [] });
    const framed = layout.cells.flat(2).find((ref) => ref.via && ref.inner?.some((r) => r.itemId === 'task'));
    expect(framed?.itemId).toBe('epic');
    const found = findOnBoard(p, layout, queryWords('rotate'));
    expect([...found.shown]).toEqual(['task']);
    expect(found.inside.size).toBe(0);
  });

  it('expanding shows what was folded; an expanded group is not a match on the board', () => {
    const layout = layoutView(p, { ...seqBySize, expanded: ['epic'] });
    const found = findOnBoard(p, layout, queryWords('residency'));
    // The epic matches, but it's expanded: its story stands in for it.
    expect([...found.shown]).toEqual(['story']);
    expect(found.matches).toEqual(['story']);
    const deeper = findOnBoard(p, layout, queryWords('rotate'));
    expect(deeper.inside.get('story')).toEqual(['task']);
  });

  it('matches come in board order, each folded match right after its card', () => {
    const layout = layoutView(p, seqBySize);
    const found = findOnBoard(p, layout, queryWords('s'));
    const at = (id: string) => found.matches.indexOf(id);
    expect(new Set(found.matches).size).toBe(found.matches.length);
    expect(at('story')).toBe(at('epic') + 1);
    expect(at('task')).toBe(at('epic') + 2);
  });

  it('steps through matches, wrapping around', () => {
    const m = ['a', 'b', 'c'];
    expect(stepMatch(m, null, 1)).toBe('a');
    expect(stepMatch(m, null, -1)).toBe('c');
    expect(stepMatch(m, 'c', 1)).toBe('a');
    expect(stepMatch(m, 'a', -1)).toBe('c');
    expect(stepMatch(m, 'gone', 1)).toBe('a');
    expect(stepMatch([], 'a', 1)).toBe(null);
  });
});
