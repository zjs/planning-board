# What merges do to our board

Sprint 9, slice 2. This asks what the board shows when two people edit it at once, or when one of them works offline and reconnects, and what to change before collaboration is built.

The evidence comes from two generated files:
- [`merge-results.md`](merge-results.md): 26 two-person scenarios, plus 20 runs of 150 random edits a side. Two people, Alice and Bob, each have their own Yjs document, edit through the app's real commands (`src/commands/store.ts`), and then sync.
- [`merge-encodings.md`](merge-encodings.md): six experiments on bare Yjs that try a different document layout for each problem found.

To regenerate both: `npx vitest run --config spikes/merge-scenarios/vitest.config.ts`.

## The short version

- **Everything converges.** In every scenario and every random run, both people end up with the same board. Yjs does its job, and nothing here is a sync bug.
- **The trouble is what they converge to.** 9 of the 26 scenarios come out as expected, and 17 don't:
  - **5 coin tosses:** one person's edit wins, chosen by Yjs client IDs, which are random per session, and nobody is told. That's acceptable in a live session where people see it happen.
  - **3 surprising results:** the board shows something nobody did.
  - **4 with lost work:** edits vanish without a word.
  - **5 that leave bad state:** the document holds something invalid that readers have to paper over.
- **Six causes account for 9 of the 12 results that aren't coin tosses.** The other three are acceptable (L2) or cheap to tidy (L14, L15).
- **Four of the causes have a fix confirmed on bare Yjs, of a few days each.** They change the Yjs schema, so they need a migration and compatibility fixtures (ADR 0005). They should land **before** any sync code: once two people share a board, the schema is much harder to change.

| Cause | Scenarios | Fix | Evidence |
|---|---|---|---|
| A single-value property (time, size, a custom select) is stored as a set, so two drops leave two values | L1, U2, O1; 10 cards in the random runs | Store one value, not a set | E1, E2 |
| A card's first value for a property creates a new set, and two new sets replace each other | L18; why the random runs show almost no cards with two sizes | Store values as flat keys on the card | E3 |
| Deleting removes the card's entry, which throws away concurrent edits inside it and strands cards added to a deleted group | L9, L11, O4; 14 stranded cards in the random runs | Tombstones: mark the card deleted, and hide anything inside a deleted group | E4, E5 |
| Opening a file, importing or starting a blank plan rewrites the whole document | O2, O3 | In a shared plan, these make a new plan instead of overwriting the shared one | Product decision; no Yjs change |
| A value's name, parent and position are written as one object | L16 | Store them as separate keys | E6 |
| Two people nesting cards inside each other's make a loop of parents | L8 | ADR 0004's repair, as designed | Unbuilt; no loops in 6,000 random edits, so it's rare |

## Reading each result

### Coin tosses are fine live, and need showing offline

L3 (sequence column), L5 (title), L7 (group) and O5 (two reorganisations) each pick one person's edit by client ID. Figma and Excalidraw resolve the same conflicts just as arbitrarily (see `prior-art.md`, §1). In a live session the loser sees the card move and can move it back, and presence makes the collision unlikely in the first place: you can see Dana is dragging that card.

After an hour offline it's different. Alice can't see what she lost, and there may be dozens. So the fix isn't a better tiebreak. It's to show the losers in the reconnect summary ("3 of your changes were overridden by Bob's"), each with "use mine". That's the "since you were away" diff from slice 4.

**Titles stay whole strings.** L5 picks one title, whole, and that's better than a character merge of two renames (Notion's result in `prior-art.md`, §1). ADR 0006's note about moving titles to `Y.Text` can be dropped.

### Single values held as sets: the most common problem

Each card stores every property as a set of value IDs, with single-valued ones (time, size, level, single-select custom properties) trimmed to one value on read. Commands write differences, so a drop from Q1 to Q2 deletes Q1 and adds Q2. That's right for a multi-valued property, and wrong for a single one:

- **L1:** Alice drops a card on Q2 while Bob drops it on Q3. The document now holds {Q2, Q3}, and the board shows Q2 because its ID sorts first. Both people see it in Q2. Bob sees his drop undone, which isn't something he did, and it isn't "the later drop wins" either. The second value hides in the document until the card is next moved.
- **U2:** Alice moves a card from Q1 to Q2. Bob moves it on to Q3. Alice presses ⌘Z, and the document holds {Q1, Q3}, so the card shows in Q1. Alice's undo overrode Bob's later move, but only because Q1's ID happens to sort first.
- **O1:** after an hour apart, 2 of the 4 cards both people moved hold two quarters, and the one shown has nothing to do with who moved it last. The random runs found 10 such cards.

**The fix (E1, E2):** store a single-valued property as one value, not a set. Two concurrent drops leave exactly one, and a later edit always replaces it. With one value, Yjs's undo leaves alone a value someone else has since overwritten: in E2, Alice's ⌘Z after Bob's move does nothing visible, and Bob's Q3 stands. That's the conservative answer to U2. Whether Alice should see why her ⌘Z did nothing is a question for the experience design (slice 5).

### A card's first value is special

**L18:** Alice and Bob each drag an untagged card out of "No area", one into Billing and one into Identity. One of the two is lost, by client ID. L2 shows why that's inconsistent: when the card already had an area, both moves landed, because both people edited a set that already existed. Here each person created the set, and two concurrent creations of the same key replace each other. It's also why the random runs found almost no cards with two sizes: most cards start with no size.

**The fix (E3):** store values as flat keys on the card (`"system:billing": true`) instead of a set per property. Nothing has to be created first, so a first value behaves like any other. For a single-valued property, E1's one value per key applies: `"time": "q2"`.

### Moving one copy twice adds both

**L2:** both people drag the same Billing copy, one to Identity and one to Platform. The card ends up in both areas, and nobody put it in two.

This is set semantics working as designed, so no encoding fixes it without making multi-valued drags lose edits. It's also visible: the card shows in both lanes, and joined copies (Q45) point at each other. The recommendation is to accept it, and to rely on presence (you can see Bob holding that card) to make it rare.

### Deleting throws away concurrent work

Deleting a card removes its entry from the document. Anything someone did to it at the same time goes with it:

- **L11:** Bob's rename and move of a story are lost when Alice deletes its group.
- **O4:** Alice spends an hour offline refining *Passwordless login*. She adds two stories, renames one, and links it. Bob deletes the group in the meantime. When Alice reconnects, her two new stories are loose cards at the top level, with no sign of the group they were made in, and her rename and link are gone. Nothing tells her any of it.
- **L9:** a card added inside a group while it's being deleted is stranded the same way. The random runs stranded 14 cards.

That's Excalidraw's second bug (`prior-art.md`, §1), and their fix applies.

**The fix (E4, E5): tombstones.** A deleted card keeps its entry, marked `deleted: true`, and readers hide it. One rule handles groups: a card shows only if neither it nor any group above it is deleted. Then:
- concurrent edits are kept inside the deleted card;
- undo is a flip of the mark, so it never has to rebuild a subtree;
- a card added to a deleted group hides with it, and comes back inside it;
- "since you were away" can say "Bob deleted *Passwordless login*, with 2 cards you added and 1 you renamed. Restore?", which turns O4's "work lost" into a choice.

The costs:
- **Deleted cards stay in the document.** At a few hundred cards per plan, that's small. Plan files leave them out, so a file is still the clean plan.
- **Every reader has to skip deleted cards.** That's one filter in `readPlan`.

Links to deleted cards already behave this way. Their entries stay, readers hide them, and they come back when the card does (L12). The random runs left 93 such hidden links, which is harmless.

### One person's "open" or "new plan" overwrites everyone's

Opening a plan file, importing a CSV and New blank plan each replace the board: clear every map, write the new plan, all in one undo step (ADR 0005, Q26, Q51). On a board only you use, that's what you asked for. On a shared one:

- **O2:** Bob, offline, opens yesterday's plan file. When he reconnects, the board is the file's cards plus the cards Alice made in the meantime, which his copy didn't know to delete. Alice's edits to existing cards are gone. It's neither the file nor the shared board.
- **O3:** Bob, offline, chooses New blank plan, meaning to start something else. When he reconnects, the shared board is blank for everyone, except for Alice's new card, which now points at a quarter and an area that don't exist.

No encoding fixes this, because the command does what it says. The fix is in the product:
- In a shared plan, Open, Import and New blank plan **make a new plan** beside it.
- Replacing a shared plan becomes its own explicit, warned action, if it's kept at all.

That needs more than one board per browser, which is already on the list (one IndexedDB database per plan). It's a question for the PM (slice 6).

### A value's fields are written together

**L16:** Alice renames Platform while Bob moves it up a place, and one edit is lost by client ID. Each value is stored as one plain object holding its label, parent and position, so any edit rewrites all three.

**The fix (E6):** each value gets its own map with separate keys, and a rename and a reorder both stick. It's the same rule ADR 0006 already applies to cards: write differences, not whole values.

### Values deleted under someone's drop

**L14:** Alice deletes Q3 while Bob drops a card into it. Bob's card ends up holding a quarter that no longer exists, so it shows as undated, in "No quarter". Alice expected every Q3 card to end up undated, so the result is right. The document just holds a dangling ID, and if Alice undoes, Q3 comes back with Bob's card in it, which is also right.

Tombstones for values, the same rule as for cards, would make this tidy rather than lucky, at no extra cost once card tombstones exist.

### Two areas with one name

**L15:** two people add an area called "Data" at once, and get two of them. Each value has a random ID, and the "name already used" check ran before either saw the other's.

It's rare and visible. Properties could offer "Merge into…" for two values with one name, which moves one value's cards to the other and deletes it. It's low priority, and the build plan lists it as a candidate.

### Loops of parents: rare, and designed for

**L8:** Alice puts *Tax engine migration* inside *Invoice redesign* while Bob does the reverse. The document now holds a loop. The board's cycle-safe readers (ADR 0004) show both cards at the top level, so neither nest survives and nothing says why. The random runs made no loops in 6,000 edits, so the race is as rare as ADR 0004 predicted.

ADR 0004's repair (the later move loses, and its card falls back to its previous parent) is still right, and it's a small piece of work once moves carry a stamp. It belongs in the first collaboration slice, with a test from this scenario.

### What works already

- **Undo reverses only my own edits (U1).** Alice's ⌘Z after Bob renamed the same card reverses her move and keeps his title. That's because undo tracks only edits made through commands (`LOCAL_ORIGIN`), so this came free, as the plan guessed.
- **Different fields of one card never collide (L4).**
- **A card moved into a deleted group survives (L10).** Ungrouping strands nothing (L17).
- **Opposite links make a flagged loop (O6),** the same as one person making one (Q37).
- **New cards in the same new column stay together (L13),** since both people compute the same key for the gap.

## Recommendations

1. **Make four schema changes before writing any sync code:**
   - single values as one value (E1);
   - flat value keys (E3);
   - tombstones for cards and values (E4, E5);
   - values as maps (E6).

   Together they're one schema version: `SCHEMA_VERSION` 2, with a migration from 1 on open, a fixture from the commit before, and plan files unchanged. Each fix is small, and doing them together means one migration rather than four. They're worth doing even for one person, since Undo after a delete gets simpler.
2. **Build ADR 0004's loop repair in the first collaboration slice.**
3. **Make Open, Import and New blank plan create a new plan when the current one is shared.** That needs more than one board per browser. The product question goes to the PM.
4. **Leave coin tosses to chance in live sessions, and show them after offline work.** The reconnect summary lists your overridden edits, each with "use mine". Last-writer-wins by wall-clock time isn't worth it: it makes the one who edited later, perhaps offline and stale, win silently.
5. **Accept that one copy moved twice lands in both lanes (L2),** and let presence make it rare.
6. **Keep the harness.** Its scenarios become unit tests of the store when the build starts, with these verdicts as the expected behavior.
