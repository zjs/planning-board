import { describe, expect, it } from 'vitest';
import { Frame, FrameReader, FrameWriter, HelloFlag } from '../store/frames.ts';
import { newRoom, toBase64Url, viewKeyOf } from '../store/keys.ts';
import type { RelaySocket } from '../store/relay.ts';
import { addPlan, findPlan, findShared, markDeleted } from './plans.ts';
import { joinFromLink, linksFor, parseShareLink, relayAddress, renewLinks, retireReplaced, sharingConfirmed, startSharing } from './sharing.ts';

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

/** A relay that retires whatever room it's asked to, or is unreachable for the rooms in `down`. */
function retiringRelay(down = new Set<string>()) {
  const retired: string[] = [];
  const open = (url: string): RelaySocket => {
    const room = url.split('/rooms/')[1]!;
    const socket: RelaySocket = {
      onopen: null,
      onmessage: null,
      onclose: null,
      close: () => undefined,
      send: (frame) => {
        const r = new FrameReader(frame);
        r.uint();
        r.bytes();
        r.uint();
        if (r.uint() & HelloFlag.Retire) retired.push(room);
        queueMicrotask(() => socket.onmessage?.(new FrameWriter(Frame.Synced).uint(0).uint(0).bytes(new Uint8Array(16)).uint(1).uint(1).uint(1).done()));
      },
    };
    queueMicrotask(() => (down.has(room) ? socket.onclose?.() : socket.onopen?.()));
    return socket;
  };
  return { open, retired };
}

describe('making new links (Q62)', () => {
  it('moves the plan to a new room, and retires the old one once it can', async () => {
    const entry = addPlan('Billing revamp');
    const first = startSharing(entry.id, relay);
    sharingConfirmed(entry.id, first);
    const renewed = renewLinks(entry.id)!;
    expect(renewed.room).not.toBe(first.room);
    expect(renewed.secret).not.toBe(first.secret);
    expect(findPlan(entry.id)?.shared).toMatchObject({ relay, pending: true, replaces: [{ room: first.room, secret: first.secret }] });
    // Nothing is retired before the new room is confirmed.
    const { open, retired } = retiringRelay();
    expect(await retireReplaced(entry.id, open)).toBe('retired');
    expect(retired).toEqual([]);
    sharingConfirmed(entry.id, findPlan(entry.id)!.shared!);
    expect(await retireReplaced(entry.id, open)).toBe('retired');
    expect(retired).toEqual([first.room, `${first.room}_h`]);
    expect(findPlan(entry.id)?.shared?.replaces).toBeUndefined();
    expect(findPlan(entry.id)?.shared?.room).toBe(renewed.room);
  });

  it('keeps an old room it couldn’t reach, to try again, and a view link can’t make new links', async () => {
    const entry = addPlan('Q3 roadmap');
    const first = startSharing(entry.id, relay);
    sharingConfirmed(entry.id, first);
    renewLinks(entry.id);
    sharingConfirmed(entry.id, findPlan(entry.id)!.shared!);
    const second = findPlan(entry.id)!.shared!;
    // Made new links again before the first old room was retired: both are kept.
    renewLinks(entry.id);
    sharingConfirmed(entry.id, findPlan(entry.id)!.shared!);
    expect(findPlan(entry.id)?.shared?.replaces?.map((r) => r.room)).toEqual([first.room, second.room]);
    const { open, retired } = retiringRelay(new Set([first.room]));
    expect(await retireReplaced(entry.id, open)).toBe('failed');
    expect(retired).toEqual(expect.arrayContaining([second.room, `${second.room}_h`]));
    expect(retired).not.toContain(first.room);
    expect(findPlan(entry.id)?.shared?.replaces?.map((r) => r.room)).toEqual([first.room]);

    const viewer = joinFromLink(aLink(false), relay);
    expect(renewLinks(viewer.entry.id)).toBeNull();
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
