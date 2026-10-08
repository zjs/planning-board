// Candidate fixes, tried on bare Yjs documents before any change to the
// app's schema: how would the problem scenarios merge with a different
// encoding? Writes docs/research/collaboration/merge-encodings.md.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import * as Y from 'yjs';

const OUT = fileURLToPath(new URL('../../docs/research/collaboration/merge-encodings.md', import.meta.url));
const TRACKED = { source: 'local' };

interface Person {
  doc: Y.Doc;
  undo: Y.UndoManager;
  card: () => Y.Map<unknown>;
}

/** Two people sharing one card, `x`, built by `init`. Alice has the lower client ID. */
function two(init: (card: Y.Map<unknown>) => void): [Person, Person] {
  const seed = new Y.Doc();
  seed.clientID = 100;
  const card = new Y.Map<unknown>();
  seed.getMap('items').set('x', card);
  init(card);
  const start = Y.encodeStateAsUpdate(seed);
  const person = (id: number): Person => {
    const doc = new Y.Doc();
    doc.clientID = id;
    Y.applyUpdate(doc, start);
    const items = doc.getMap<Y.Map<unknown>>('items');
    return { doc, undo: new Y.UndoManager(items, { trackedOrigins: new Set([TRACKED]), captureTimeout: 0 }), card: () => items.get('x')! };
  };
  return [person(1), person(2)];
}

function sync(a: Person, b: Person): void {
  const ab = Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc));
  const ba = Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc));
  Y.applyUpdate(b.doc, ab);
  Y.applyUpdate(a.doc, ba);
}

const act = (p: Person, f: (card: Y.Map<unknown>) => void) => p.doc.transact(() => f(p.card()), TRACKED);
const flat = (card: Y.Map<unknown>, property: string) =>
  [...card.keys()].filter((k) => k.startsWith(`${property}:`)).map((k) => k.slice(property.length + 1)).sort();

interface Finding {
  id: string;
  fixes: string;
  encoding: string;
  result: string;
}

test('candidate encodings', () => {
  const findings: Finding[] = [];

  // E1. A single-valued property as one key holding one value (a register), instead of a set.
  {
    const [alice, bob] = two((card) => card.set('time', 'q1'));
    act(alice, (c) => c.set('time', 'q2'));
    act(bob, (c) => c.set('time', 'q3'));
    sync(alice, bob);
    const value = alice.card().get('time');
    expect(bob.card().get('time')).toBe(value);
    findings.push({
      id: 'E1',
      fixes: 'L1, O1',
      encoding: 'Time stored as one value, `time: "q2"`, rather than a set of values',
      result: `Concurrent drops to Q2 and Q3 leave exactly one value, ${String(value)}: the person with the higher client ID wins. There's never a second value hiding in the document.`,
    });
  }

  // E2. Undo with a register, after someone else has moved the card on.
  {
    const [alice, bob] = two((card) => card.set('time', 'q1'));
    act(alice, (c) => c.set('time', 'q2'));
    sync(alice, bob);
    act(bob, (c) => c.set('time', 'q3'));
    sync(alice, bob);
    alice.undo.undo();
    sync(alice, bob);
    findings.push({
      id: 'E2',
      fixes: 'U2',
      encoding: 'The same register, with Alice undoing after Bob moved the card again',
      result: `After Alice's undo the card is in ${String(alice.card().get('time'))}. ${alice.card().get('time') === 'q3' ? "Yjs's undo leaves a value someone else has overwritten alone, so Alice's ⌘Z does nothing visible here." : "Alice's undo overrode Bob's later move."}`,
    });
  }

  // E3. Multi-valued properties as flat keys on the card ("system:billing"), instead of a nested set per property.
  {
    const [alice, bob] = two(() => {});
    act(alice, (c) => c.set('system:billing', true));
    act(bob, (c) => c.set('system:identity', true));
    sync(alice, bob);
    const areas = flat(alice.card(), 'system');
    expect(flat(bob.card(), 'system')).toEqual(areas);
    findings.push({
      id: 'E3',
      fixes: 'L18',
      encoding: 'Areas as flat keys on the card, `"system:billing": true`, with no nested set to create',
      result: `Two people giving an untagged card its first area leave it in ${areas.join(' and ')}, the same as when it already had one (L2). The first value is no longer special.`,
    });
  }

  // E4. Deleting a card by marking it, instead of removing it from the map.
  {
    const [alice, bob] = two((card) => card.set('title', 'Account recovery'));
    act(alice, (c) => c.set('deleted', true));
    act(bob, (c) => c.set('title', 'Account recovery by email'));
    sync(alice, bob);
    const deleted = alice.card().get('deleted') === true;
    alice.undo.undo();
    sync(alice, bob);
    expect(bob.card().get('deleted')).not.toBe(true);
    findings.push({
      id: 'E4',
      fixes: 'L11, O4',
      encoding: 'A deleted card keeps its entry, marked `deleted: true` (a tombstone)',
      result: `The card is ${deleted ? 'deleted' : 'not deleted'} for both people, and Bob's concurrent rename is kept inside it. When Alice undoes, it comes back for both of them as "${String(bob.card().get('title'))}". Removing the entry, as today, throws the rename away.`,
    });
  }

  // E5. The same with a group: a card added inside a group someone deleted.
  {
    const seed = new Y.Doc();
    seed.clientID = 100;
    const items = seed.getMap<Y.Map<unknown>>('items');
    const group = new Y.Map<unknown>();
    items.set('g', group);
    group.set('title', 'Passwordless login');
    const start = Y.encodeStateAsUpdate(seed);
    const make = (id: number) => {
      const doc = new Y.Doc();
      doc.clientID = id;
      Y.applyUpdate(doc, start);
      return doc;
    };
    const a = make(1);
    const b = make(2);
    a.getMap<Y.Map<unknown>>('items').get('g')!.set('deleted', true);
    const child = new Y.Map<unknown>();
    b.getMap<Y.Map<unknown>>('items').set('c', child);
    child.set('title', 'WebAuthn fallback');
    child.set('parent', 'g');
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
    const all = a.getMap<Y.Map<unknown>>('items');
    // The reading rule: a card is shown only if it and every group above it are not deleted.
    const shown = (id: string): boolean => {
      const card = all.get(id);
      if (!card || card.get('deleted') === true) return false;
      const parent = card.get('parent') as string | undefined;
      return parent === undefined || shown(parent);
    };
    findings.push({
      id: 'E5',
      fixes: 'L9, O4',
      encoding: 'Tombstones, read with one rule: a card shows only if neither it nor any group above it is deleted',
      result: `"WebAuthn fallback", added inside the group while it was being deleted, is ${shown('c') ? 'shown, loose' : 'hidden with its group'}. Restoring the group brings it back inside, instead of leaving it loose on the board with no sign of where it came from.`,
    });
  }

  // E6. A value's name and position as separate keys, instead of one object.
  {
    const [alice, bob] = two((card) => {
      card.set('label', 'Platform');
      card.set('order', 'a2');
    });
    act(alice, (c) => c.set('label', 'Platform services'));
    act(bob, (c) => c.set('order', 'a0V'));
    sync(alice, bob);
    findings.push({
      id: 'E6',
      fixes: 'L16',
      encoding: "A value's label, parent and order as separate keys in its own map",
      result: `A rename and a reorder made at once both stick: the area is "${String(alice.card().get('label'))}" at order ${String(alice.card().get('order'))}.`,
    });
  }

  const lines = [
    '# Merge scenarios: candidate encodings',
    '',
    "_Generated by `spikes/merge-scenarios/encodings.test.ts`. Don't edit by hand. The reading is in [`merge-scenarios.md`](merge-scenarios.md)._",
    '',
    "Each experiment takes a problem from [`merge-results.md`](merge-results.md) and tries a different way of laying out the document, on bare Yjs, before anything in the app's schema changes. Alice has the lower client ID throughout.",
    '',
    '| # | Fixes | Encoding | Result |',
    '|---|---|---|---|',
    ...findings.map((f) => `| ${f.id} | ${f.fixes} | ${f.encoding} | ${f.result} |`),
    '',
  ];
  writeFileSync(OUT, lines.join('\n'));
});
