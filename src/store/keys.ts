// Keys and links for shared plans (ADR 0018). The link is the key: everything
// after the `#`, which browsers never send to a server.
//
// - A 32-byte secret S, made when a plan is shared, is the edit link's key.
// - From S, HKDF-SHA256 derives the encryption key K and the relay's write
//   token T. A view link carries K but not S, so it can read and can't write:
//   nothing derives T from K.
// - Every message is sealed with XChaCha20-Poly1305 and a fresh random
//   192-bit nonce, safe for the life of a room. The room, the kind of
//   message and, for snapshots, how far it reaches, are bound in as
//   additional data, so the relay can't pass one off as another.
//
// Pure JavaScript (@noble), not WebCrypto: a relay run from a laptop is
// opened over plain http on the local network, where browsers don't offer
// WebCrypto. `crypto.getRandomValues` works everywhere.

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

/** The format of links and sealed messages. A change bumps it, and older builds refuse what they can't read. */
export const KEY_VERSION = 1;

/** What a sealed message is: one change, the whole plan, or presence (sprint 12). */
export type SealedKind = 'update' | 'snapshot' | 'presence';

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

const encoder = new TextEncoder();

/** A new shared plan's room ID, 22 characters, and secret. */
export function newRoom(): { room: string; secret: Uint8Array } {
  return { room: toBase64Url(randomBytes(16)), secret: randomBytes(32) };
}

/** The encryption key and write token a secret yields. */
export function deriveKeys(secret: Uint8Array): { key: Uint8Array; token: Uint8Array } {
  const salt = encoder.encode('planning-board');
  return {
    key: hkdf(sha256, secret, salt, encoder.encode(`planning-board ${KEY_VERSION} enc`), 32),
    token: hkdf(sha256, secret, salt, encoder.encode(`planning-board ${KEY_VERSION} write`), 32),
  };
}

function additionalData(room: string, kind: SealedKind, upto?: number): Uint8Array {
  return encoder.encode(`planning-board|${KEY_VERSION}|${room}|${kind}|${upto ?? ''}`);
}

/** Seal a message: a version byte, the nonce, then the ciphertext with its tag. */
export function seal(key: Uint8Array, room: string, kind: SealedKind, plain: Uint8Array, upto?: number): Uint8Array {
  const nonce = randomBytes(24);
  const sealed = xchacha20poly1305(key, nonce, additionalData(room, kind, upto)).encrypt(plain);
  const out = new Uint8Array(1 + nonce.length + sealed.length);
  out[0] = KEY_VERSION;
  out.set(nonce, 1);
  out.set(sealed, 1 + nonce.length);
  return out;
}

/** Open a sealed message. Throws if it's from another version, another room or kind, or was changed. */
export function unseal(key: Uint8Array, room: string, kind: SealedKind, sealed: Uint8Array, upto?: number): Uint8Array {
  if (sealed.length < 1 + 24 + 16 || sealed[0] !== KEY_VERSION) throw new Error('unreadable message');
  const nonce = sealed.subarray(1, 25);
  return xchacha20poly1305(key, nonce, additionalData(room, kind, upto)).decrypt(sealed.subarray(25));
}

/** What a share link carries. Keys are base64url text, as in the link. */
export interface ShareLink {
  room: string;
  /** The edit link's secret; absent for a view link. */
  secret?: string;
  /** The encryption key, which a view link carries directly. */
  viewKey: string;
  /** The relay's address, when it isn't where the app was opened from. */
  relay?: string;
}

/** The encryption key, as text, that a secret gives: what the view link carries. */
export function viewKeyOf(secret: string): string {
  return toBase64Url(deriveKeys(fromBase64Url(secret)).key);
}

/**
 * Read a share link's fragment: `#v=1&room=…&key=…` for editing, or
 * `&view=…` for viewing, with `&relay=…` when the relay is elsewhere.
 * Null for anything else, including a link from a newer version.
 */
export function parseShareLink(hash: string): ShareLink | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const room = params.get('room');
  if (params.get('v') !== String(KEY_VERSION) || !room || !/^[A-Za-z0-9_-]{16,64}$/.test(room)) return null;
  const relay = params.get('relay') ?? undefined;
  try {
    const secret = params.get('key');
    if (secret) {
      if (fromBase64Url(secret).length !== 32) return null;
      return { room, secret, viewKey: viewKeyOf(secret), ...(relay ? { relay } : {}) };
    }
    const view = params.get('view');
    if (view && fromBase64Url(view).length === 32) return { room, viewKey: view, ...(relay ? { relay } : {}) };
  } catch {
    // Not base64: not a link of ours.
  }
  return null;
}

/** Whether a version of the link format newer than this build's is in the fragment, to say why it won't open. */
export function isNewerLink(hash: string): boolean {
  const v = Number(new URLSearchParams(hash.replace(/^#/, '')).get('v'));
  return Number.isInteger(v) && v > KEY_VERSION;
}

/**
 * A plan's share links. `app` is the page to open; when the relay serves
 * the app, they're the same and the link doesn't name the relay.
 */
export function shareLinks(app: string, link: ShareLink): { edit: string | null; view: string } {
  const base = app.replace(/[#?].*$/, '').replace(/\/?$/, '/');
  const relay = link.relay && sameOrigin(link.relay, base) ? '' : link.relay ? `&relay=${encodeURIComponent(link.relay)}` : '';
  const head = `${base}#v=${KEY_VERSION}&room=${link.room}`;
  return {
    edit: link.secret ? `${head}&key=${link.secret}${relay}` : null,
    view: `${head}&view=${link.viewKey}${relay}`,
  };
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}
