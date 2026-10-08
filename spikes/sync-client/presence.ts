// Presence, connection state, history and "since you were away", drawn over
// the real board as plain DOM, so the app's own code stays untouched.
//
// Presence is anchored to cards, not to screen positions. Two people can be
// in different pivots, so "x = 640, y = 210" means nothing on someone
// else's board, but "pointing at the lower left of *Invoice redesign*"
// means something wherever that card is.

import type * as Y from 'yjs';
import type { Plan } from '../../src/domain/model.ts';
import { readPlan } from '../../src/store/schema.ts';
import { overridden, planDiff } from './diff.ts';
import { historyOf, recordHistory, type HistoryEntry } from './history.ts';
import type { EncryptedProvider, PeerState } from './provider.ts';

interface Presence extends PeerState {
  /** The card under the pointer, and where on it, as fractions of its width and height. */
  pointer: { item: string; fx: number; fy: number } | null;
  selection: string[];
  /** The card being dragged, and the name of the cell or lane under it ("Q3 2027, Billing"). */
  dragging: { item: string; over: string | null } | null;
}

const NAMES = ['Ada', 'Bo', 'Cyd', 'Dee', 'Eli', 'Fen', 'Gus', 'Hal'];
const COLORS = ['#d9480f', '#2b8a3e', '#1971c2', '#9c36b5', '#e67700', '#0c8599', '#c2255c', '#5f3dc4'];

function whoAmI(): { name: string; color: string } {
  const saved = localStorage.getItem('spike:me');
  if (saved) return JSON.parse(saved) as { name: string; color: string };
  const i = Math.floor(Math.random() * NAMES.length);
  const me = { name: NAMES[i]!, color: COLORS[i]! };
  localStorage.setItem('spike:me', JSON.stringify(me));
  return me;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const md = (s: string) => escape(s).replace(/\*([^*]+)\*/g, '<b>$1</b>');

const copiesOf = (item: string) =>
  [...document.querySelectorAll<HTMLElement>(`.card[data-item="${CSS.escape(item)}"]:not(.via-children)`)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  });

const STYLE = `
.spike-panel { position: fixed; left: 12px; bottom: 12px; z-index: 1000; width: 260px; font: 12px/1.4 system-ui, sans-serif;
  background: #fffbe6; border: 1px solid #c9b458; border-radius: 8px; padding: 8px 10px; box-shadow: 0 2px 8px #0002; color: #222; }
.spike-panel h4 { margin: 0 0 4px; font-size: 12px; }
.spike-panel .row { display: flex; gap: 6px; align-items: center; margin: 4px 0; flex-wrap: wrap; }
.spike-panel button { font: inherit; padding: 2px 6px; }
.spike-panel input { font: inherit; width: 80px; }
.spike-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.spike-person { display: inline-flex; align-items: center; gap: 3px; padding: 0 4px; border-radius: 8px; color: #fff; }
.spike-history { max-height: 160px; overflow: auto; margin: 4px 0 0; padding-left: 14px; }
.spike-away { position: fixed; right: 16px; bottom: 16px; z-index: 1000; width: 340px; font: 13px/1.4 system-ui, sans-serif; background: #fff;
  border: 1px solid #888; border-radius: 8px; padding: 10px 12px; box-shadow: 0 4px 16px #0003; color: #222; }
.spike-away h4 { margin: 0 0 6px; }
.spike-away ul { margin: 4px 0 8px; padding-left: 18px; max-height: 220px; overflow: auto; }
.spike-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 999; }
.spike-overlay .box { position: fixed; border: 2px solid; border-radius: 6px; }
.spike-overlay .box.moving { border-style: dashed; background: #ffffff55; }
.spike-overlay .tag { position: fixed; color: #fff; font: 11px system-ui, sans-serif; padding: 0 4px; border-radius: 4px; white-space: nowrap; }
.spike-overlay svg { position: fixed; width: 14px; height: 18px; }
`;

export function mountCollaboration(doc: Y.Doc, provider: EncryptedProvider): void {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);
  let me = whoAmI();
  recordHistory(doc, () => me);

  // ---- What I'm doing, shared with everyone else.
  const local: Presence = { ...me, pointer: null, selection: [], dragging: null };
  const publish = () => provider.setPresence({ ...local, ...me });
  // Say who I am straight away, before I touch anything, so others see me arrive.
  publish();
  let down: { item: string; x: number; y: number } | null = null;
  const dropName = (x: number, y: number) =>
    document
      .elementsFromPoint(x, y)
      .find((el) => el instanceof HTMLElement && el.dataset.drop !== undefined)
      ?.getAttribute('aria-label') ?? null;
  document.addEventListener(
    'pointerdown',
    (e) => {
      const card = (e.target as Element).closest<HTMLElement>('.card[data-item]');
      down = card ? { item: card.dataset.item!, x: e.clientX, y: e.clientY } : null;
    },
    true,
  );
  document.addEventListener(
    'pointermove',
    (e) => {
      const card = (e.target as Element).closest<HTMLElement>('.card[data-item]:not(.via-children)');
      if (card) {
        const r = card.getBoundingClientRect();
        local.pointer = { item: card.dataset.item!, fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
      } else if (!local.dragging) {
        local.pointer = null;
      }
      if (down && e.buttons === 1 && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) {
        local.dragging = { item: down.item, over: dropName(e.clientX, e.clientY) };
      }
      publish();
    },
    true,
  );
  document.addEventListener(
    'pointerup',
    () => {
      down = null;
      if (local.dragging) {
        local.dragging = null;
        publish();
      }
    },
    true,
  );
  const readSelection = () => {
    const ids = [...new Set([...document.querySelectorAll<HTMLElement>('.card.selected[data-item]')].map((el) => el.dataset.item!))];
    if (ids.join() !== local.selection.join()) {
      local.selection = ids;
      publish();
    }
  };
  new MutationObserver(readSelection).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });

  // ---- Everyone else, drawn over the board.
  const overlay = document.createElement('div');
  overlay.className = 'spike-overlay';
  overlay.dataset.testid = 'spike-overlay';
  document.body.append(overlay);
  setInterval(() => {
    let html = '';
    for (const { state } of provider.peers.values()) {
      const p = state as Presence;
      const tag = (x: number, y: number, text: string) =>
        `<div class="tag" data-peer="${escape(p.name)}" style="left:${x}px;top:${y}px;background:${p.color}">${md(text)}</div>`;
      for (const item of p.selection ?? []) {
        copiesOf(item).forEach((el, i) => {
          const r = el.getBoundingClientRect();
          html += `<div class="box" data-selected-by="${escape(p.name)}" data-item="${escape(item)}" style="left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width}px;height:${r.height}px;border-color:${p.color}"></div>`;
          if (i === 0) html += tag(r.right - 40, r.top - 16, p.name);
        });
      }
      if (p.dragging) {
        const first = copiesOf(p.dragging.item)[0];
        if (first) {
          const r = first.getBoundingClientRect();
          html += `<div class="box moving" style="left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width}px;height:${r.height}px;border-color:${p.color}"></div>`;
          html += tag(r.left, r.bottom + 2, `${p.name} is moving this${p.dragging.over ? ` → ${p.dragging.over}` : ''}`);
        }
      }
      if (p.pointer) {
        const first = copiesOf(p.pointer.item)[0];
        if (first) {
          const r = first.getBoundingClientRect();
          const x = r.left + p.pointer.fx * r.width;
          const y = r.top + p.pointer.fy * r.height;
          html += `<svg data-cursor="${escape(p.name)}" style="left:${x}px;top:${y}px" viewBox="0 0 14 18"><path d="M0 0 L0 16 L4 12 L7 18 L9 17 L6 11 L12 11 Z" fill="${p.color}" stroke="#fff"/></svg>`;
          html += tag(x + 12, y + 14, p.name);
        }
      }
    }
    if (overlay.innerHTML !== html) overlay.innerHTML = html;
  }, 100);

  // ---- The panel: connection, people, history.
  const panel = document.createElement('div');
  panel.className = 'spike-panel';
  panel.dataset.testid = 'spike-panel';
  document.body.append(panel);
  let showHistory = false;
  const STATUS: Record<string, [string, string]> = {
    connecting: ['#e67700', 'Connecting…'],
    live: ['#2b8a3e', 'Live'],
    reconnecting: ['#e67700', 'Reconnecting… your changes are kept here'],
    offline: ['#868e96', 'Offline: your changes are kept here'],
  };
  const render = () => {
    const [color, text] = STATUS[provider.status]!;
    const waiting = provider.status === 'live' ? '' : provider.waiting > 0 ? ' (not shared yet)' : '';
    const people = [...provider.peers.values()]
      .map(({ state }) => `<span class="spike-person" style="background:${state.color}">${escape(state.name)}</span>`)
      .join(' ');
    const history = historyOf(doc)
      .toArray()
      .slice(-15)
      .reverse()
      .map((h) => `<li><b style="color:${h.color}">${escape(h.who)}</b> ${h.via ? `(${h.via}) ` : ''}${md(h.changes.join('; '))} <span style="color:#888">${new Date(h.at).toLocaleTimeString()}</span></li>`)
      .join('');
    const html = `
      <h4>Shared plan <span style="font-weight:normal;color:#888">(spike)</span></h4>
      <div class="row" data-testid="spike-status" data-status="${provider.status}"><span class="spike-dot" style="background:${color}"></span>${text}${waiting}</div>
      <div class="row">You: <input data-testid="spike-name" value="${escape(me.name)}"> <span class="spike-dot" style="background:${me.color}"></span></div>
      <div class="row" data-testid="spike-people">${people || '<span style="color:#888">Nobody else here</span>'}</div>
      <div class="row">
        <button data-action="offline" data-testid="spike-offline">${provider.status === 'offline' ? 'Go online' : 'Go offline'}</button>
        <button data-action="copy" data-testid="spike-copy">Copy link</button>
        <button data-action="history" data-testid="spike-history-toggle">${showHistory ? 'Hide' : 'History'}</button>
      </div>
      ${showHistory ? `<ul class="spike-history" data-testid="spike-history">${history || '<li>Nothing yet</li>'}</ul>` : ''}`;
    // Only when something changed, so a click never lands on a button that's being replaced.
    if (html !== lastHtml) {
      panel.innerHTML = html;
      lastHtml = html;
    }
  };
  let lastHtml = '';
  panel.addEventListener('click', (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'offline') provider.status === 'offline' ? provider.goOnline() : provider.goOffline();
    if (action === 'copy') void navigator.clipboard.writeText(location.href);
    if (action === 'history') {
      showHistory = !showHistory;
      render();
    }
  });
  panel.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.dataset.testid !== 'spike-name') return;
    me = { ...me, name: input.value.trim() || me.name };
    localStorage.setItem('spike:me', JSON.stringify(me));
    publish();
    render();
  });
  // Don't redraw under someone typing their name.
  const rerender = () => {
    if ((document.activeElement as HTMLElement | null)?.dataset.testid === 'spike-name') return;
    render();
  };
  provider.subscribe(rerender);
  historyOf(doc).observe(rerender);
  render();

  // ---- Since you were away.
  let base: Plan = readPlan(doc);
  let was = provider.status;
  provider.subscribe(() => {
    if (was === 'live' && provider.status !== 'live') base = readPlan(doc);
    was = provider.status;
  });
  provider.onReconnect = (awaySince) => {
    const mine = planDiff(base, readPlan(doc));
    const from = base;
    void provider.whenLive().then(() => {
      // Give the board a moment to take in the last updates.
      setTimeout(() => {
        const merged = readPlan(doc);
        const others: HistoryEntry[] = historyOf(doc)
          .toArray()
          .filter((h) => h.at >= awaySince && h.who !== me.name);
        const lost = overridden(mine, merged, from);
        base = merged;
        if (others.length > 0 || lost.length > 0) showAway(others, lost.map((l) => `${l.change.text}, but ${l.now}`), awaySince);
      }, 300);
    });
  };
}

function showAway(others: HistoryEntry[], lost: string[], since: number) {
  document.querySelector('.spike-away')?.remove();
  const box = document.createElement('div');
  box.className = 'spike-away';
  box.dataset.testid = 'spike-away';
  const minutes = Math.max(1, Math.round((Date.now() - since) / 60000));
  box.innerHTML = `
    <h4>Since you were away (${minutes} min)</h4>
    ${others.length > 0 ? `<div>Others changed:</div><ul data-testid="spike-away-others">${others
      .flatMap((h) => h.changes.map((c) => `<li><b style="color:${h.color}">${escape(h.who)}</b> ${md(c)}</li>`))
      .join('')}</ul>` : ''}
    ${lost.length > 0 ? `<div>Your changes that didn't stick:</div><ul data-testid="spike-away-lost">${lost.map((l) => `<li>You ${md(l)}</li>`).join('')}</ul>` : ''}
    <button>Dismiss</button>`;
  box.querySelector('button')!.onclick = () => box.remove();
  document.body.append(box);
}
