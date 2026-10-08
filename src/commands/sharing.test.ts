import { describe, expect, it } from 'vitest';
import { newRoom, toBase64Url, viewKeyOf } from '../store/keys.ts';
import { addPlan, findPlan, findShared, markDeleted } from './plans.ts';
import { joinFromLink, linksFor, parseShareLink, relayAddress, sharingConfirmed, startSharing } from './sharing.ts';

// The plan list falls back to memory here, as it does in a browser that won't give localStorage.
const relay = 'http://192.168.1.23:8787';

function aLink(edit = true) {
  const { room, secret } = newRoom();
  const s = toBase64Url(secret);
  return { room, viewKey: viewKeyOf(s), ...(edit ? { secret: s } : {}) };
}

describe('sharing a plan', () => {
  it('shares the plan you are on, pending until the relay confirms the room (Q68)', () => {
    const entry = addPlan('Billing revamp');
    const shared = startSharing(entry.id, relay);
    expect(findPlan(entry.id)?.shared).toEqual({ ...shared, pending: true });
    expect(shared.viewKey).toBe(viewKeyOf(shared.secret!));
    sharingConfirmed(entry.id, shared);
    expect(findPlan(entry.id)?.shared?.pending).toBeUndefined();
    expect(findShared(relay, shared.room)?.id).toBe(entry.id);
  });

  it('makes links that open the same plan, naming the relay as others reach it', () => {
    const entry = addPlan('Q3 roadmap');
    const shared = startSharing(entry.id, 'http://localhost:8787');
    const links = linksFor(shared, `${relay}/`, relay);
    expect(links.edit).not.toContain('localhost');
    expect(parseShareLink(new URL(links.edit!).hash)).toMatchObject({ room: shared.room, secret: shared.secret });
    expect(parseShareLink(new URL(links.view).hash)).toEqual({ room: shared.room, viewKey: shared.viewKey });
  });
});

describe('opening a share link', () => {
  it('adds a plan this browser has never seen, and opens it again after', () => {
    const link = aLink();
    const first = joinFromLink(link, relay);
    expect(first.kind).toBe('new');
    expect(first.entry.shared).toEqual({ relay, room: link.room, viewKey: link.viewKey, secret: link.secret });
    expect(joinFromLink(link, relay)).toMatchObject({ kind: 'existing', entry: { id: first.entry.id } });
  });

  it('tells plans on two relays apart, even with one room name', () => {
    const link = aLink();
    const a = joinFromLink(link, relay).entry.id;
    const b = joinFromLink(link, 'http://10.0.0.5:8787').entry.id;
    expect(a).not.toBe(b);
  });

  it('upgrades a plan held for viewing when its edit link arrives, and keeps editing over a view link', () => {
    const link = aLink();
    const viewing = joinFromLink({ room: link.room, viewKey: link.viewKey }, relay);
    expect(viewing.entry.shared?.secret).toBeUndefined();
    const upgraded = joinFromLink(link, relay);
    expect(upgraded.kind).toBe('upgraded');
    expect(findPlan(viewing.entry.id)?.shared?.secret).toBe(link.secret);
    expect(joinFromLink({ room: link.room, viewKey: link.viewKey }, relay).kind).toBe('already-editing');
    expect(findPlan(viewing.entry.id)?.shared?.secret).toBe(link.secret);
  });

  it('refuses keys that don’t match the plan held, and never overwrites them', () => {
    const link = aLink();
    const held = joinFromLink(link, relay).entry;
    const other = aLink();
    expect(joinFromLink({ ...other, room: link.room }, relay).kind).toBe('mismatch');
    expect(findPlan(held.id)?.shared?.viewKey).toBe(link.viewKey);
  });

  it('brings back a deleted shared plan', () => {
    const link = aLink(false);
    const held = joinFromLink(link, relay).entry;
    markDeleted(held.id);
    expect(findPlan(held.id)).toBeNull();
    expect(joinFromLink(link, relay).kind).toBe('existing');
    expect(findPlan(held.id)).not.toBeNull();
  });
});

describe('a relay address', () => {
  it('accepts an address as the relay printed it, with or without http://', () => {
    expect(relayAddress('http://192.168.1.23:8787/')).toEqual({ relay: 'http://192.168.1.23:8787' });
    expect(relayAddress('192.168.1.23:8787')).toEqual({ relay: 'http://192.168.1.23:8787' });
    expect(relayAddress('https://plans.example.com/relay/')).toEqual({ relay: 'https://plans.example.com/relay' });
  });

  it('says why an address won’t do', () => {
    expect(relayAddress('')).toHaveProperty('problem');
    expect(relayAddress('ftp://example.com')).toHaveProperty('problem');
  });
});
