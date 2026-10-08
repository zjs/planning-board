import { describe, expect, it } from 'vitest';
import {
  deriveKeys,
  fromBase64Url,
  isNewerLink,
  newRoom,
  parseShareLink,
  seal,
  shareLinks,
  toBase64Url,
  unseal,
  viewKeyOf,
} from './keys.ts';

const plain = new TextEncoder().encode('Invoice redesign');

describe('keys and links (ADR 0018)', () => {
  it('derives an encryption key and a write token that differ, the same way every time', () => {
    const { secret } = newRoom();
    const a = deriveKeys(secret);
    const b = deriveKeys(secret);
    expect(a.key).toEqual(b.key);
    expect(a.token).toEqual(b.token);
    expect(a.key).not.toEqual(a.token);
    expect(a.key).toHaveLength(32);
  });

  it('seals and unseals, with a fresh nonce each time', () => {
    const { room, secret } = newRoom();
    const { key } = deriveKeys(secret);
    const one = seal(key, room, 'update', plain);
    const two = seal(key, room, 'update', plain);
    expect(one).not.toEqual(two);
    expect(new TextDecoder().decode(unseal(key, room, 'update', one))).toBe('Invoice redesign');
    expect(new TextDecoder().decode(one)).not.toContain('Invoice');
  });

  it("won't open a message from another room, of another kind, for another reach, changed, or with another key", () => {
    const { room, secret } = newRoom();
    const { key } = deriveKeys(secret);
    const sealed = seal(key, room, 'snapshot', plain, 200);
    expect(() => unseal(key, 'another_room_0123456789', 'snapshot', sealed, 200)).toThrow();
    expect(() => unseal(key, room, 'update', sealed, 200)).toThrow();
    expect(() => unseal(key, room, 'snapshot', sealed, 100)).toThrow();
    const changed = sealed.slice();
    changed[changed.length - 1]! ^= 1;
    expect(() => unseal(key, room, 'snapshot', changed, 200)).toThrow();
    expect(() => unseal(deriveKeys(newRoom().secret).key, room, 'snapshot', sealed, 200)).toThrow();
    const newer = sealed.slice();
    newer[0] = 2;
    expect(() => unseal(key, room, 'snapshot', newer, 200)).toThrow();
  });

  it('makes edit and view links, and reads them back', () => {
    const { room, secret } = newRoom();
    const s = toBase64Url(secret);
    const links = shareLinks('http://192.168.1.23:8787/', { room, secret: s, viewKey: viewKeyOf(s), relay: 'http://192.168.1.23:8787' });
    expect(links.edit).toBe(`http://192.168.1.23:8787/#v=1&room=${room}&key=${s}`);
    expect(parseShareLink(new URL(links.edit!).hash)).toEqual({ room, secret: s, viewKey: viewKeyOf(s) });
    expect(parseShareLink(new URL(links.view).hash)).toEqual({ room, viewKey: viewKeyOf(s) });
  });

  it('names the relay when the app is opened from somewhere else', () => {
    const { room, secret } = newRoom();
    const s = toBase64Url(secret);
    const links = shareLinks('https://zjs.github.io/planning-board/#plan=p1', { room, viewKey: viewKeyOf(s), relay: 'https://plans.example.com' });
    expect(links.edit).toBeNull();
    expect(links.view).toBe(`https://zjs.github.io/planning-board/#v=1&room=${room}&view=${viewKeyOf(s)}&relay=${encodeURIComponent('https://plans.example.com')}`);
    expect(parseShareLink(new URL(links.view).hash)?.relay).toBe('https://plans.example.com');
  });

  it("a view link can't be turned into an edit link", () => {
    const { secret } = newRoom();
    const { key, token } = deriveKeys(secret);
    expect(toBase64Url(key)).toBe(viewKeyOf(toBase64Url(secret)));
    expect(token).not.toEqual(deriveKeys(key).token);
  });

  it("ignores anything that isn't one of its links", () => {
    expect(parseShareLink('#plan=p1')).toBeNull();
    expect(parseShareLink('#v=1&room=short&key=abc')).toBeNull();
    expect(parseShareLink('#v=1&room=valid_room_name_1234&key=not-32-bytes')).toBeNull();
    expect(parseShareLink('#v=2&room=valid_room_name_1234&view=x')).toBeNull();
    expect(isNewerLink('#v=2&room=valid_room_name_1234&view=x')).toBe(true);
    expect(isNewerLink('#v=1&room=valid_room_name_1234')).toBe(false);
  });

  it('round-trips base64url', () => {
    const bytes = Uint8Array.from({ length: 50 }, (_, i) => (i * 37) % 256);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    expect(toBase64Url(bytes)).not.toMatch(/[+/=]/);
  });
});
