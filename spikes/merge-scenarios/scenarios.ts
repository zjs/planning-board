// Two-person scenarios. Each one starts both people on the same board
// (harness.basePlan), has them edit, syncs, and says what the board shows.
// The verdict is engineering's reading of whether someone would be surprised.

import {
  addDependency,
  addValue,
  createChild,
  createItem,
  deleteItems,
  deleteValue,
  dropCard,
  editCardValues,
  groupItems,
  loadPlan,
  moveToParent,
  renameItem,
  renameValue,
  reorderValue,
  undo,
  ungroupItems,
} from '../../src/commands/store.ts';
import { blankPlan } from '../../src/domain/builtins.ts';
import { dependencyLoops } from '../../src/domain/dependencies.ts';
import { SIZE, SYSTEM, TIME } from '../../src/domain/model.ts';
import { layoutView } from '../../src/domain/view.ts';
import {
  basePlan,
  groupOf,
  label,
  plan,
  roadmap,
  sequence,
  storedValues,
  sync,
  titleOf,
  titles,
  valuesOf,
  whereInRoadmap,
  type Pair,
} from './harness.ts';

/**
 * - `as expected`: what both people would expect.
 * - `coin toss`: one person's edit wins, decided by Yjs client IDs (random per session), and nobody is told.
 * - `surprising`: the board shows something neither person did.
 * - `work lost`: someone's edits disappear, and nothing says so.
 * - `bad state`: the document holds something invalid, which readers have to work around.
 */
export type Verdict = 'as expected' | 'coin toss' | 'surprising' | 'work lost' | 'bad state';

export interface Scenario {
  id: string;
  title: string;
  /** Live: both edit within the same second or so. Offline: one of them works disconnected, then reconnects. */
  setting: 'live' | 'offline';
  alice: string;
  bob: string;
  /** What a person would probably expect. */
  expected: string;
  /** Runs the edits, including the sync, and returns what the board shows afterwards. */
  run: (pair: Pair) => { result: string; verdict: Verdict };
}

const list = (xs: readonly string[]) => (xs.length === 0 ? 'nothing' : xs.join(', '));

export const scenarios: Scenario[] = [
  // ---- Live: the same card, the same seconds -------------------------------------------------
  {
    id: 'L1',
    title: 'Both drag one card to different quarters',
    setting: 'live',
    alice: 'Drags *Invoice redesign* from Q1 to Q2.',
    bob: 'Drags *Invoice redesign* from Q1 to Q3.',
    expected: 'One of them wins, probably the later drop, and the card is in one quarter.',
    run(pair) {
      const card = { itemId: 'invoices', x: 'q1', y: 'billing' };
      dropCard(pair.alice, roadmap, card, { x: 'q2', y: 'billing' });
      dropCard(pair.bob, roadmap, card, { x: 'q3', y: 'billing' });
      sync(pair);
      const stored = storedValues(pair.alice, 'invoices', TIME);
      const shown = valuesOf(plan(pair.alice), 'invoices', TIME);
      return {
        result: `The board shows ${list(shown)}, but the document keeps ${list(stored)} until the card is next moved. The value shown is the one with the lowest ID, not the later drop.`,
        verdict: stored.length > 1 ? 'bad state' : 'coin toss',
      };
    },
  },
  {
    id: 'L2',
    title: 'Both drag one card to different areas',
    setting: 'live',
    alice: 'Drags *Invoice redesign* from Billing to Identity.',
    bob: 'Drags *Invoice redesign* from Billing to Platform.',
    expected: 'The card ends up in one of the two areas.',
    run(pair) {
      const card = { itemId: 'invoices', x: 'q1', y: 'billing' };
      dropCard(pair.alice, roadmap, card, { x: 'q1', y: 'identity' });
      dropCard(pair.bob, roadmap, card, { x: 'q1', y: 'platform' });
      sync(pair);
      const areas = valuesOf(plan(pair.alice), 'invoices', SYSTEM);
      return {
        result: `The card is in ${list(areas)}: both moves landed, because System holds several values. Nobody put it in two areas.`,
        verdict: areas.length > 1 ? 'surprising' : 'coin toss',
      };
    },
  },
  {
    id: 'L3',
    title: 'Both drag one card to different sequence columns',
    setting: 'live',
    alice: 'In Sequence, drags *Audit log export* to the first column.',
    bob: 'In Sequence, drags *Audit log export* to the second column.',
    expected: 'One of them wins.',
    run(pair) {
      const card = { itemId: 'audit', x: 'a2', y: 'platform' };
      dropCard(pair.alice, sequence, card, { x: 'a0', y: 'platform' });
      dropCard(pair.bob, sequence, card, { x: 'a1', y: 'platform' });
      sync(pair);
      const key = plan(pair.alice).items['audit']!.sequence;
      return {
        result: `The card is in the ${key === 'a0' ? 'first' : key === 'a1' ? 'second' : 'third'} column. Sequence is one value, so one drop wins outright.`,
        verdict: 'coin toss',
      };
    },
  },
  {
    id: 'L4',
    title: 'Two people change different things on one card',
    setting: 'live',
    alice: 'Drags *Rate limits* from Q3 to Q2.',
    bob: 'Sizes *Rate limits* L in the inspector.',
    expected: 'Both changes stick.',
    run(pair) {
      dropCard(pair.alice, roadmap, { itemId: 'rates', x: 'q3', y: 'platform' }, { x: 'q2', y: 'platform' });
      editCardValues(pair.bob, ['rates'], SIZE, { kind: 'set', values: ['l'] });
      sync(pair);
      const p = plan(pair.alice);
      const ok = valuesOf(p, 'rates', TIME)[0] === 'Q2' && valuesOf(p, 'rates', SIZE)[0] === 'L';
      return {
        result: `The card is in ${list(valuesOf(p, 'rates', TIME))}, sized ${list(valuesOf(p, 'rates', SIZE))}.`,
        verdict: ok ? 'as expected' : 'work lost',
      };
    },
  },
  {
    id: 'L5',
    title: 'Both rename one card',
    setting: 'live',
    alice: 'Renames *Audit log export* to "Audit log export (CSV)".',
    bob: 'Renames *Audit log export* to "Audit trail export".',
    expected: 'One title wins, whole.',
    run(pair) {
      renameItem(pair.alice, 'audit', 'Audit log export (CSV)');
      renameItem(pair.bob, 'audit', 'Audit trail export');
      sync(pair);
      return { result: `The title is "${titleOf(plan(pair.alice), 'audit')}".`, verdict: 'coin toss' };
    },
  },
  {
    id: 'L6',
    title: 'One renames a card while the other deletes it',
    setting: 'live',
    alice: 'Renames *Rate limits* to "API rate limits".',
    bob: 'Deletes *Rate limits*.',
    expected: 'The card is gone; Alice sees it disappear.',
    run(pair) {
      renameItem(pair.alice, 'rates', 'API rate limits');
      deleteItems(pair.bob, ['rates']);
      sync(pair);
      const gone = !plan(pair.alice).items['rates'];
      return {
        result: gone ? 'The card is gone, and so is the rename.' : 'The card survived the delete.',
        verdict: gone ? 'as expected' : 'surprising',
      };
    },
  },
  {
    id: 'L7',
    title: 'Both put one card into different groups',
    setting: 'live',
    alice: 'Puts *Audit log export* inside *Passwordless login*.',
    bob: 'Puts *Audit log export* inside *Invoice redesign*.',
    expected: 'It ends up in one of them.',
    run(pair) {
      moveToParent(pair.alice, ['audit'], 'login');
      moveToParent(pair.bob, ['audit'], 'invoices');
      sync(pair);
      return { result: `It's inside ${groupOf(plan(pair.alice), 'audit')}.`, verdict: 'coin toss' };
    },
  },
  {
    id: 'L8',
    title: 'Each puts a card inside the other\'s',
    setting: 'live',
    alice: 'Puts *Tax engine migration* inside *Invoice redesign*.',
    bob: 'Puts *Invoice redesign* inside *Tax engine migration*.',
    expected: 'One nest wins; a card can\'t be inside itself (requirement 14).',
    run(pair) {
      moveToParent(pair.alice, ['tax'], 'invoices');
      moveToParent(pair.bob, ['invoices'], 'tax');
      sync(pair);
      const p = plan(pair.alice);
      return {
        result: `*Tax engine migration* shows at ${groupOf(p, 'tax')}, and *Invoice redesign* at ${groupOf(p, 'invoices')}. The document holds a loop of parents, which the board shows as two loose cards. Neither nest survived, and nothing says why.`,
        verdict: 'bad state',
      };
    },
  },
  {
    id: 'L9',
    title: 'One deletes a group while the other adds a card inside it',
    setting: 'live',
    alice: 'Deletes *Passwordless login*, with its three stories.',
    bob: 'Adds "WebAuthn fallback" inside *Passwordless login*.',
    expected: 'Either the new card goes with the group, or the delete is held back.',
    run(pair) {
      deleteItems(pair.alice, ['login']);
      const id = createChild(pair.bob, roadmap, 'login', 'WebAuthn fallback')!;
      sync(pair);
      const p = plan(pair.alice);
      return {
        result: `The group and its three stories are gone. "WebAuthn fallback" survives, at ${groupOf(p, id)}, with no sign of where it came from.`,
        verdict: 'surprising',
      };
    },
  },
  {
    id: 'L10',
    title: 'One deletes a group while the other moves a card into it',
    setting: 'live',
    alice: 'Deletes *Passwordless login*.',
    bob: 'Puts *Audit log export* inside *Passwordless login*.',
    expected: 'The moved card survives somewhere.',
    run(pair) {
      deleteItems(pair.alice, ['login']);
      moveToParent(pair.bob, ['audit'], 'login');
      sync(pair);
      const p = plan(pair.alice);
      return {
        result: `*Audit log export* shows at ${groupOf(p, 'audit')}: it wasn't deleted, because Alice's delete didn't know it was inside. Its parent field still names the deleted group.`,
        verdict: 'as expected',
      };
    },
  },
  {
    id: 'L11',
    title: 'One deletes a group while the other edits a card inside it',
    setting: 'live',
    alice: 'Deletes *Passwordless login*.',
    bob: 'Renames *Account recovery* and drags it to Q2.',
    expected: 'The card goes with its group; Bob sees it disappear.',
    run(pair) {
      deleteItems(pair.alice, ['login']);
      renameItem(pair.bob, 'recovery', 'Account recovery by email');
      dropCard(pair.bob, roadmap, { itemId: 'recovery', x: 'q3', y: 'identity' }, { x: 'q2', y: 'identity' });
      sync(pair);
      const gone = !plan(pair.alice).items['recovery'];
      return {
        result: gone ? 'The card is gone, with Bob\'s rename and move.' : 'The card survived.',
        verdict: gone ? 'as expected' : 'surprising',
      };
    },
  },
  {
    id: 'L12',
    title: 'One links to a card the other deletes, then the delete is undone',
    setting: 'live',
    alice: 'Links *Rate limits* before *Audit log export*.',
    bob: 'Deletes *Audit log export*, then undoes the delete.',
    expected: 'The link goes with the card, and comes back if the card does.',
    run(pair) {
      addDependency(pair.alice, 'rates', 'audit');
      deleteItems(pair.bob, ['audit']);
      sync(pair);
      const during = plan(pair.alice).dependencies.some((d) => d.from === 'rates' && d.to === 'audit');
      undo(pair.bob);
      sync(pair);
      const after = plan(pair.alice).dependencies.some((d) => d.from === 'rates' && d.to === 'audit');
      return {
        result: `While the card is deleted, the link is ${during ? 'still shown' : 'hidden'}. After Bob's undo, the card is back and the link is ${after ? 'back too' : 'gone'}.`,
        verdict: !during && after ? 'as expected' : 'surprising',
      };
    },
  },
  {
    id: 'L13',
    title: 'Both start a new sequence column in the same gap',
    setting: 'live',
    alice: 'In Sequence, double-clicks the gap after the last column in Platform, and types "Usage dashboard".',
    bob: 'Does the same in the same gap, and types "Quota alerts".',
    expected: 'Two new cards, in one new column or two.',
    run(pair) {
      const gaps = layoutView(plan(pair.alice), sequence).gaps.x!;
      const gap = gaps[gaps.length - 1]!;
      const a = createItem(pair.alice, sequence, { x: gap, y: 'platform' }, 'Usage dashboard')!;
      const b = createItem(pair.bob, sequence, { x: gap, y: 'platform' }, 'Quota alerts')!;
      sync(pair);
      const p = plan(pair.alice);
      const same = p.items[a]!.sequence === p.items[b]!.sequence;
      return {
        result: same ? 'Both cards are in one new column, since both people computed the same key for the gap.' : 'Each card started its own column.',
        verdict: 'as expected',
      };
    },
  },
  {
    id: 'L14',
    title: 'One deletes a quarter while the other drags a card into it',
    setting: 'live',
    alice: 'Deletes Q3 in Properties. Its cards lose their quarter (Q4).',
    bob: 'Drags *Invoice redesign* into Q3.',
    expected: 'Q3 is gone, and every card that was in it, Bob\'s too, is undated.',
    run(pair) {
      deleteValue(pair.alice, TIME, 'q3');
      dropCard(pair.bob, roadmap, { itemId: 'invoices', x: 'q1', y: 'billing' }, { x: 'q3', y: 'billing' });
      sync(pair);
      const p = plan(pair.alice);
      return {
        result: `*Invoice redesign* holds a quarter that no longer exists (${list(valuesOf(p, 'invoices', TIME))}), so Roadmap shows it in ${list(whereInRoadmap(p, 'invoices'))}. The other Q3 cards are undated, as Alice expected. If Alice undoes, Q3 comes back with Bob's card in it.`,
        verdict: 'bad state',
      };
    },
  },
  {
    id: 'L15',
    title: 'Both add an area with the same name',
    setting: 'live',
    alice: 'Adds an area "Data" from "+ Add area".',
    bob: 'Adds an area "Data" from "+ Add area".',
    expected: 'One area called Data.',
    run(pair) {
      addValue(pair.alice, SYSTEM, 'Data');
      addValue(pair.bob, SYSTEM, 'Data');
      sync(pair);
      const p = plan(pair.alice);
      const system = p.properties[SYSTEM]!;
      const count = system.kind === 'select' ? Object.values(system.values).filter((v) => v.label === 'Data').length : 0;
      return {
        result: `There are ${count} areas called Data. Each has a random ID, so they never merge, and the "name already used" check ran before either saw the other's.`,
        verdict: count > 1 ? 'surprising' : 'as expected',
      };
    },
  },
  {
    id: 'L16',
    title: 'One renames an area while the other reorders it',
    setting: 'live',
    alice: 'Renames Platform to "Platform services".',
    bob: 'Moves Platform up a place, above Identity.',
    expected: 'Both changes stick.',
    run(pair) {
      renameValue(pair.alice, SYSTEM, 'platform', 'Platform services');
      reorderValue(pair.bob, SYSTEM, 'platform', 'up');
      sync(pair);
      const p = plan(pair.alice);
      const renamed = label(p, SYSTEM, 'platform') === 'Platform services';
      const system = p.properties[SYSTEM]!;
      const moved = system.kind === 'select' && system.values['platform']!.order < system.values['identity']!.order;
      return {
        result: `The area is called "${label(p, SYSTEM, 'platform')}" and is ${moved ? 'above' : 'below'} Identity. A value's name, parent and position are written as one object, so one of the two edits is dropped.`,
        verdict: renamed && moved ? 'as expected' : 'work lost',
      };
    },
  },
  {
    id: 'L17',
    title: 'One ungroups a group while the other adds a card inside it',
    setting: 'live',
    alice: 'Ungroups *Passwordless login*: its stories move up a level.',
    bob: 'Adds "WebAuthn fallback" inside *Passwordless login*.',
    expected: 'The new card moves up with its siblings.',
    run(pair) {
      ungroupItems(pair.alice, ['login']);
      const id = createChild(pair.bob, roadmap, 'login', 'WebAuthn fallback')!;
      sync(pair);
      const p = plan(pair.alice);
      return {
        result: `"WebAuthn fallback" shows at ${groupOf(p, id)}, like its former siblings. The link from *Passkey enrolment* was re-pointed at the cards Alice knew about, not at the new one.`,
        verdict: 'as expected',
      };
    },
  },
  {
    id: 'L18',
    title: 'Both give an untagged card different areas',
    setting: 'live',
    alice: 'Drags *Release notes* from "No area" into Billing.',
    bob: 'Drags *Release notes* from "No area" into Identity.',
    expected: 'The same as L2: both land, since System holds several values. Or one wins.',
    run(pair) {
      const card = { itemId: 'notes', x: 'q2', y: null };
      dropCard(pair.alice, roadmap, card, { x: 'q2', y: 'billing' });
      dropCard(pair.bob, roadmap, card, { x: 'q2', y: 'identity' });
      sync(pair);
      const areas = valuesOf(plan(pair.alice), 'notes', SYSTEM);
      return {
        result: `The card is in ${list(areas)} only. A card's first value for a property is written as a new set, and two new sets for one property replace each other, unlike L2, where both people edit a set that already exists.`,
        verdict: areas.length > 1 ? 'surprising' : 'coin toss',
      };
    },
  },
  // ---- Undo with two people --------------------------------------------------------------------
  {
    id: 'U1',
    title: 'Undo reverses only my own edit',
    setting: 'live',
    alice: 'Drags *Rate limits* from Q3 to Q2.',
    bob: 'Renames *Rate limits* to "API rate limits". Then Alice presses ⌘Z.',
    expected: 'The card goes back to Q3, and keeps Bob\'s title.',
    run(pair) {
      dropCard(pair.alice, roadmap, { itemId: 'rates', x: 'q3', y: 'platform' }, { x: 'q2', y: 'platform' });
      renameItem(pair.bob, 'rates', 'API rate limits');
      sync(pair);
      undo(pair.alice);
      sync(pair);
      const p = plan(pair.alice);
      const ok = valuesOf(p, 'rates', TIME)[0] === 'Q3' && titleOf(p, 'rates') === 'API rate limits';
      return {
        result: `The card is in ${list(valuesOf(p, 'rates', TIME))}, titled "${titleOf(p, 'rates')}".`,
        verdict: ok ? 'as expected' : 'surprising',
      };
    },
  },
  {
    id: 'U2',
    title: 'I undo a move someone has since moved again',
    setting: 'live',
    alice: 'Drags *Invoice redesign* from Q1 to Q2.',
    bob: 'Sees it in Q2, and drags it on to Q3. Then Alice presses ⌘Z.',
    expected: 'Either nothing happens, since Bob has moved it since, or it goes back to Q1. Not both.',
    run(pair) {
      dropCard(pair.alice, roadmap, { itemId: 'invoices', x: 'q1', y: 'billing' }, { x: 'q2', y: 'billing' });
      sync(pair);
      dropCard(pair.bob, roadmap, { itemId: 'invoices', x: 'q2', y: 'billing' }, { x: 'q3', y: 'billing' });
      sync(pair);
      undo(pair.alice);
      sync(pair);
      const stored = storedValues(pair.alice, 'invoices', TIME);
      return {
        result: `The board shows ${list(valuesOf(plan(pair.alice), 'invoices', TIME))}, and the document holds ${list(stored)}. Alice's undo put Q1 back without taking Bob's Q3 away.`,
        verdict: stored.length > 1 ? 'bad state' : 'as expected',
      };
    },
  },
  // ---- Offline: an hour off the VPN ------------------------------------------------------------
  {
    id: 'O1',
    title: 'An hour of overlapping drags',
    setting: 'offline',
    alice: 'Offline, moves four cards to new quarters.',
    bob: 'Online meanwhile, moves two of the same cards to other quarters.',
    expected: 'Every card is in one quarter. Whoever moved a card last, in real time, probably wins.',
    run(pair) {
      const moves: [string, string, string, string][] = [
        ['invoices', 'q1', 'billing', 'q2'],
        ['tax', 'q1', 'billing', 'q2'],
        ['audit', 'q3', 'platform', 'q1'],
        ['rates', 'q3', 'platform', 'q1'],
      ];
      for (const [id, from, area, to] of moves) dropCard(pair.alice, roadmap, { itemId: id, x: from, y: area }, { x: to, y: area });
      dropCard(pair.bob, roadmap, { itemId: 'invoices', x: 'q1', y: 'billing' }, { x: 'q3', y: 'billing' });
      dropCard(pair.bob, roadmap, { itemId: 'audit', x: 'q3', y: 'platform' }, { x: 'q2', y: 'platform' });
      sync(pair);
      const two = ['invoices', 'tax', 'audit', 'rates'].filter((id) => storedValues(pair.alice, id, TIME).length > 1);
      const p = plan(pair.alice);
      return {
        result: `${two.length} cards hold two quarters (${list(two.map((id) => titleOf(p, id)))}), and show the one with the lower ID: *Invoice redesign* in ${list(valuesOf(p, 'invoices', TIME))}, *Audit log export* in ${list(valuesOf(p, 'audit', TIME))}. Who moved last plays no part.`,
        verdict: two.length > 0 ? 'bad state' : 'coin toss',
      };
    },
  },
  {
    id: 'O2',
    title: 'Opening a plan file while offline',
    setting: 'offline',
    alice: 'Online, adds "Usage dashboard" and renames *Audit log export*.',
    bob: 'Offline, opens a plan file: the same plan, saved yesterday, with the same card IDs.',
    expected: 'Bob\'s file replaces the board for everyone, or Alice\'s work survives on top. Not a mix.',
    run(pair) {
      const added = createItem(pair.alice, roadmap, { x: 'q2', y: 'platform' }, 'Usage dashboard')!;
      renameItem(pair.alice, 'audit', 'Audit trail export');
      loadPlan(pair.bob, basePlan());
      sync(pair);
      const p = plan(pair.alice);
      return {
        result: `The board holds the file's cards plus Alice's new "${titleOf(p, added)}". Alice's rename is ${titleOf(p, 'audit') === 'Audit trail export' ? 'kept' : 'lost'}: opening a file deletes every card and writes it again, which throws away edits to cards Bob's copy knew about, but not cards it didn't.`,
        verdict: 'work lost',
      };
    },
  },
  {
    id: 'O3',
    title: 'Starting a new blank plan while offline',
    setting: 'offline',
    alice: 'Online, adds "Usage dashboard" in Q2 × Platform.',
    bob: 'Offline, chooses File › New blank plan, meaning to start something else.',
    expected: 'Bob gets a blank plan of his own. Alice\'s board is untouched.',
    run(pair) {
      const added = createItem(pair.alice, roadmap, { x: 'q2', y: 'platform' }, 'Usage dashboard')!;
      loadPlan(pair.bob, blankPlan());
      sync(pair);
      const p = plan(pair.alice);
      return {
        result: `Both boards are now blank except for ${list(titles(p).map((t) => `"${t}"`))}, whose quarter and area no longer exist (it holds ${list(valuesOf(p, added, TIME))}). One person's "new plan" wiped the shared one for everyone.`,
        verdict: 'work lost',
      };
    },
  },
  {
    id: 'O4',
    title: 'Deleting a group someone is refining offline',
    setting: 'offline',
    alice: 'Offline, adds two stories inside *Passwordless login*, renames *Passkey enrolment*, and links it before *Rate limits*.',
    bob: 'Online meanwhile, deletes *Passwordless login* as out of scope.',
    expected: 'Alice is told what happened to her work.',
    run(pair) {
      const a = createChild(pair.alice, roadmap, 'login', 'WebAuthn fallback')!;
      const b = createChild(pair.alice, roadmap, 'login', 'Device trust')!;
      renameItem(pair.alice, 'passkeys', 'Passkey enrolment and sync');
      addDependency(pair.alice, 'passkeys', 'rates');
      deleteItems(pair.bob, ['login']);
      sync(pair);
      const p = plan(pair.alice);
      const survivors = [a, b].filter((id) => p.items[id]).map((id) => `"${titleOf(p, id)}"`);
      return {
        result: `Alice's two new stories survive as loose cards (${list(survivors)}), at the top level. Her rename and her link went with the deleted group. Nothing tells her which.`,
        verdict: 'work lost',
      };
    },
  },
  {
    id: 'O5',
    title: 'Two reorganisations of the same cards',
    setting: 'offline',
    alice: 'Offline, groups *Invoice redesign* and *Tax engine migration* into a new group.',
    bob: 'Offline too, groups *Tax engine migration* and *Seat sync from directory* into a new group.',
    expected: 'The groups merge, or one wins.',
    run(pair) {
      const ga = groupItems(pair.alice, ['invoices', 'tax'])!.group;
      const gb = groupItems(pair.bob, ['tax', 'seats'])!.group;
      renameItem(pair.alice, ga, "Alice's group");
      renameItem(pair.bob, gb, "Bob's group");
      sync(pair);
      const p = plan(pair.alice);
      return {
        result: `Both groups exist. *Tax engine migration* is inside ${groupOf(p, 'tax')}, so the other group has one card left.`,
        verdict: 'coin toss',
      };
    },
  },
  {
    id: 'O6',
    title: 'Opposite links while apart',
    setting: 'offline',
    alice: 'Offline, links *Seat sync from directory* before *Tax engine migration*.',
    bob: 'Links *Tax engine migration* before *Seat sync from directory*.',
    expected: 'A loop, flagged, as when one person makes one (Q37).',
    run(pair) {
      addDependency(pair.alice, 'seats', 'tax');
      addDependency(pair.bob, 'tax', 'seats');
      sync(pair);
      const loops = dependencyLoops(plan(pair.alice));
      return {
        result: `Both links exist, and the board flags ${loops.length > 0 ? 'the loop' : 'nothing'}.`,
        verdict: loops.length > 0 ? 'as expected' : 'surprising',
      };
    },
  },
];
