import { describe, expect, it } from 'vitest';
import { GRACE_MS, LOUD_AFTER_MS, pillState, type PillInput } from './connection.ts';

const base: PillInput = {
  status: 'live',
  problem: null,
  viewOnly: false,
  unshared: 0,
  lastLive: 1_000,
  lostAt: null,
  openedAt: 0,
  browserOffline: false,
  hasLocal: true,
  now: 10_000,
};
const at = (patch: Partial<PillInput>) => pillState({ ...base, ...patch });
const dropped = { status: 'reconnecting' as const, lostAt: 10_000 };

describe('the connection pill', () => {
  it('says Live, or View only, while connected', () => {
    expect(at({}).label).toBe('Live');
    expect(at({ viewOnly: true }).label).toBe('View only');
  });

  it('gives a dropped connection a few seconds before saying so', () => {
    expect(at({ ...dropped, now: 10_000 + GRACE_MS - 1 }).label).toBe('Live');
    expect(at({ ...dropped, now: 10_000 + GRACE_MS }).label).toBe('Reconnecting…');
  });

  it('counts changes not shared yet while offline, and gets louder after an hour or with many', () => {
    expect(at({ ...dropped, unshared: 1, now: 20_000 }).label).toBe('Offline · 1 change not shared yet');
    const seven = at({ ...dropped, unshared: 7, now: 20_000 });
    expect(seven).toMatchObject({ label: 'Offline · 7 changes not shared yet', tone: 'warn' });
    expect(seven.detail).toBeUndefined();
    expect(at({ ...dropped, unshared: 7, now: 10_000 + LOUD_AFTER_MS })).toMatchObject({ tone: 'loud', detail: 'Others may be changing the same cards' });
    expect(at({ ...dropped, unshared: 30, now: 20_000 }).tone).toBe('loud');
  });

  it('says Offline at once when the browser does', () => {
    expect(at({ ...dropped, browserOffline: true }).label).toBe('Offline');
  });

  it('can’t reach the relay when nothing of the plan is here yet', () => {
    expect(at({ status: 'connecting', lastLive: null, hasLocal: false, now: 1_000 }).label).toBe('Connecting…');
    expect(at({ status: 'connecting', lastLive: null, hasLocal: false, now: 5_000 }).label).toBe('Can’t reach the relay');
    expect(at({ status: 'connecting', lastLive: null, hasLocal: true, now: 5_000 }).label).toBe('Reconnecting…');
  });

  it('names a refused write, and a plan the relay lost', () => {
    expect(at({ problem: { code: 7, message: 'This plan is full.' } })).toMatchObject({ label: 'Not saved on the relay', title: 'This plan is full.' });
    expect(at({ status: 'refused', problem: { code: 3, message: 'unknown room' } })).toMatchObject({ label: 'Not on the relay', canRecreate: true });
    expect(at({ status: 'refused', viewOnly: true, problem: { code: 3, message: 'unknown room' } }).canRecreate).toBe(false);
  });
});
