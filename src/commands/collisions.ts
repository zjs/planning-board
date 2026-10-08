// Noticing when someone else's drop collides with yours (requirement 31,
// Q60). Each drop of yours is remembered for a few seconds; a change from
// the relay that touches one of those cards is checked against what you
// wrote. Changes from another tab of yours are the same person, so they're
// never collisions.

import { cardState, classifyCollision, type CardState } from '../domain/collisions.ts';
import { SEQUENCE, type ItemId, type PropertyId } from '../domain/model.ts';
import { RELAY_ORIGIN } from '../store/relay.ts';
import { readPlan, root } from '../store/schema.ts';
import type { PlanStore } from './store.ts';

export type { CardState } from '../domain/collisions.ts';

/** How long a drop is remembered: long enough for a change in flight to arrive. */
export const COLLISION_WINDOW_MS = 10_000;

/** A drop of yours that someone else's change has since touched. */
export interface Collision {
  item: ItemId;
  /** `lost`: their value replaced yours. `both`: on a property holding several values, both landed. */
  outcome: 'lost' | 'both';
  property: PropertyId;
  /** What your drop wrote, for putting it back. */
  mine: CardState;
  withSequence: boolean;
}

interface Remembered {
  mine: CardState;
  withSequence: boolean;
  at: number;
}

export interface CollisionWatch {
  /** Remember a drop just made: the cards it moved, and the axes it wrote. */
  remember: (ids: readonly ItemId[], properties: readonly PropertyId[]) => void;
  /** When a drop of yours to this card was last made, if it still counts as recent. */
  recentDrop: (id: ItemId) => number | null;
  stop: () => void;
}

/** Watch for changes from the relay that collide with your recent drops. `onCollision` is called once per card. */
export function watchCollisions(store: PlanStore, onCollision: (c: Collision) => void, now: () => number = Date.now): CollisionWatch {
  const drops = new Map<ItemId, Remembered>();
  const prune = () => {
    for (const [id, d] of drops) if (now() - d.at > COLLISION_WINDOW_MS) drops.delete(id);
  };
  const isMulti = (p: PropertyId) => root(store.doc).properties.get(p)?.get('multi') === true;
  const check = (tr: { origin: unknown }) => {
    if (tr.origin !== RELAY_ORIGIN || drops.size === 0) return;
    prune();
    if (drops.size === 0) return;
    const plan = readPlan(store.doc);
    for (const [id, d] of [...drops]) {
      const properties = [...Object.keys(d.mine.values), ...(d.withSequence ? [SEQUENCE] : [])];
      const result = classifyCollision(d.mine, cardState(plan, id, properties), isMulti);
      if (!result) continue;
      drops.delete(id);
      onCollision({ item: id, outcome: result.outcome, property: result.property, mine: d.mine, withSequence: d.withSequence });
    }
  };
  store.doc.on('afterTransaction', check);
  return {
    remember: (ids, properties) => {
      prune();
      const plan = readPlan(store.doc);
      for (const id of ids) {
        const mine = cardState(plan, id, properties);
        if (mine) drops.set(id, { mine, withSequence: properties.includes(SEQUENCE), at: now() });
      }
    },
    recentDrop: (id) => {
      const d = drops.get(id);
      return d && now() - d.at <= COLLISION_WINDOW_MS ? d.at : null;
    },
    stop: () => store.doc.off('afterTransaction', check),
  };
}
