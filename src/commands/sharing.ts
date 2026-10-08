// Sharing a plan through a relay (requirements 30 and 33, ADR 0018), as the
// board sees it: who you are, which relay, making links, and opening one.

import { newRoom, parseShareLink, shareLinks, toBase64Url, viewKeyOf, type ShareLink } from '../store/keys.ts';
import { addSharedPlan, findShared, setShared, unmarkDeleted, type PlanEntry, type PlanId, type SharedPlan } from './plans.ts';

export { isNewerLink, parseShareLink, type ShareLink } from '../store/keys.ts';

const NAME_KEY = 'planning-board:me';
const RELAY_KEY = 'planning-board:relay';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A convenience: without storage, it's asked again next time.
  }
}

/** Your name on shared plans, chosen once per browser (Q61), or null before you've given one. */
export function myName(): string | null {
  const name = read(NAME_KEY)?.trim();
  return name ? name : null;
}

export function setMyName(name: string): void {
  write(NAME_KEY, name.trim());
}

/** The relay last used to share from this browser, to offer next time. */
export function rememberedRelay(): string | null {
  return read(RELAY_KEY);
}

export function rememberRelay(relay: string): void {
  write(RELAY_KEY, relay);
}

/** What a relay says about itself at /config. */
export interface RelayInfo {
  protocol: number;
  /** The address to put in share links. */
  publicUrl: string;
}

async function fetchConfig(url: string): Promise<RelayInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return null;
    const info = (await response.json()) as Partial<RelayInfo>;
    return typeof info.protocol === 'number' && typeof info.publicUrl === 'string' ? { protocol: info.protocol, publicUrl: info.publicUrl } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The relay this page was opened from, if it was: then Share needs no address. */
export function relayHere(): Promise<RelayInfo | null> {
  if (!location.protocol.startsWith('http')) return Promise.resolve(null);
  return fetchConfig(new URL('config', location.href).toString());
}

/**
 * An address someone typed, as a relay's base URL, or why it can't be used.
 * From a page served over https, browsers only let it reach `https` relays
 * and this computer (`localhost`).
 */
export function relayAddress(typed: string): { relay: string } | { problem: string } {
  const text = typed.trim();
  if (text === '') return { problem: 'Type the address your relay printed when it started, such as http://192.168.1.23:8787.' };
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `http://${text}`);
  } catch {
    return { problem: 'That doesn’t look like an address.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { problem: 'A relay address starts with http:// or https://.' };
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (typeof location !== 'undefined' && location.protocol === 'https:' && url.protocol === 'http:' && !local) {
    return {
      problem:
        'This page is served over https, so the browser won’t let it reach a relay over plain http. Open the app from the relay’s own address instead, or use an https relay.',
    };
  }
  return { relay: `${url.origin}${url.pathname.replace(/\/$/, '')}` };
}

/** Ask a relay whether it's there and speaks our protocol. */
export function checkRelay(relay: string): Promise<RelayInfo | null> {
  return fetchConfig(`${relay}/config`);
}

/** Whether a relay address points at this computer only, so colleagues can't open links to it. */
export function isLocalOnly(relay: string): boolean {
  try {
    const host = new URL(relay).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Start sharing a plan: a new room and secret, kept as pending until the
 * relay confirms the room, so a crash part-way through retries rather than
 * leaving a room nobody can reach. The caller reopens the plan, which
 * connects and uploads it.
 */
export function startSharing(id: PlanId, relay: string): SharedPlan {
  const { room, secret } = newRoom();
  const s = toBase64Url(secret);
  const shared: SharedPlan = { relay, room, secret: s, viewKey: viewKeyOf(s), pending: true };
  setShared(id, shared);
  return shared;
}

/** The relay confirmed the room. */
export function sharingConfirmed(id: PlanId, shared: SharedPlan): void {
  const { pending: _, ...confirmed } = shared;
  setShared(id, confirmed);
}

/**
 * Where share links send people to open the app. A relay serves the app
 * itself, so its own address works for anyone who can reach it, over plain
 * http on a network too. Only when this page and the relay are both https
 * do links keep this page, so people open the same build you're using.
 */
export function appForLinks(publicRelay: string): string {
  return location.protocol === 'https:' && publicRelay.startsWith('https:') ? location.href : `${publicRelay.replace(/\/$/, '')}/`;
}

/**
 * A shared plan's links. `app` is where people open the app; `publicRelay`
 * is the relay's address as others reach it, which can differ from the one
 * this browser uses (`localhost`).
 */
export function linksFor(shared: SharedPlan, app: string, publicRelay = shared.relay): { edit: string | null; view: string } {
  const link: ShareLink = { room: shared.room, viewKey: shared.viewKey, relay: publicRelay };
  if (shared.secret) link.secret = shared.secret;
  return shareLinks(app, link);
}

/** What opening a share link did. */
export type JoinResult =
  | { kind: 'new'; entry: PlanEntry }
  | { kind: 'existing'; entry: PlanEntry }
  | { kind: 'upgraded'; entry: PlanEntry }
  | { kind: 'already-editing'; entry: PlanEntry }
  | { kind: 'mismatch'; entry: PlanEntry };

/**
 * Open a share link (`#v=1&room=…`) in this browser. `here` is the relay
 * when the link doesn't name one: this page's own address, which served it.
 *
 * - A plan this browser doesn't have is added, named once its first sync
 *   brings the plan's own name.
 * - A plan it has opens; a deleted one comes back.
 * - An edit link upgrades a plan held only for viewing.
 * - Keys that don't match the plan held are refused, never overwritten.
 */
export function joinFromLink(link: ShareLink, here: string): JoinResult {
  const relay = link.relay ?? here;
  const held = findShared(relay, link.room);
  if (!held?.shared) {
    const shared: SharedPlan = { relay, room: link.room, viewKey: link.viewKey, ...(link.secret ? { secret: link.secret } : {}) };
    return { kind: 'new', entry: addSharedPlan(shared, 'Shared plan') };
  }
  if (held.deletedAt !== undefined) unmarkDeleted(held.id);
  if (held.shared.viewKey !== link.viewKey) return { kind: 'mismatch', entry: held };
  if (link.secret && !held.shared.secret) {
    setShared(held.id, { ...held.shared, secret: link.secret });
    return { kind: 'upgraded', entry: { ...held, shared: { ...held.shared, secret: link.secret } } };
  }
  if (!link.secret && held.shared.secret) return { kind: 'already-editing', entry: held };
  return { kind: 'existing', entry: held };
}

/** Read a share link from a page's address, if it holds one. */
export function linkInHash(hash: string): ShareLink | null {
  return parseShareLink(hash);
}
