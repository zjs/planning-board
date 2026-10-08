# 0016: A document schema for concurrent editing

Status: Accepted (sprint 9; M2's plan approved by the PM, 2026-10-08). Built in sprint 10, slice 1. Amends ADR 0006.

## Context

ADR 0006 laid out the Yjs document so that M2 would need no rewrite. Sprint 9's merge harness tested that claim (`docs/research/collaboration/merge-scenarios.md`): 26 two-person scenarios run through the real commands, and 6,000 random edits. Every merge converged, but four parts of the layout converge to the wrong thing:

- **A single-valued property is stored as a set,** trimmed to one value on read. Two concurrent drops leave two values, and the board shows the lowest ID, not the later drop (L1, U2, O1).
- **A card's first value for a property creates a new nested set.** Two concurrent first values replace each other, unlike every later value (L18).
- **Deleting removes the card's entry,** which discards concurrent edits inside it, and strands cards added to a deleted group (L9, L11, O4).
- **A value is one object of label, parent and order,** so a concurrent rename and reorder lose one edit (L16).

## Decision

One schema version, `SCHEMA_VERSION` 2, with these changes. Each was tried on bare Yjs (`merge-encodings.md`, E1–E6).

- **Values are flat keys on the card's map.**
  - A multi-valued property is one key per value, `"system:billing": true`.
  - A single-valued property is one key holding the value, `"time": "q2"`.
  - The nested `values` map goes. A first value then behaves like any other (E3), and two concurrent drops leave exactly one value (E1).
- **Deleting marks the card,** `deleted: true`, and readers skip it. A card is shown only if neither it nor any group above it is deleted (E4, E5).
  - Undo flips the mark.
  - Concurrent edits survive inside the deleted card.
  - A card added to a deleted group hides with it, and comes back with it.
  - Values get the same treatment.
- **Each value is a map** of `label`, `parent` and `order`, edited key by key (E6).
- **Dependencies and related links are unchanged.** Their keyed entries already behave; links to a deleted card are hidden by readers and come back with it (L12).

**Migration:**
- A version 1 board, in the browser, is read and rewritten into a version 2 document on first open, outside undo, in the way `ensureBuiltIns` already works.
- Plan files are unchanged: they hold plans, not documents, and deleted cards are left out.
- A compatibility fixture from the last version 1 commit goes in first (ADR 0005).

## Alternatives

- **Keep version 1 and patch readers,** for instance with last-writer-wins by timestamp on read. Every reader would need to know, and the deletion problems can't be fixed on read.
- **A movable-tree CRDT, or switching to Loro.** It isn't needed for these problems. Loops of parents stay with ADR 0004's repair, since the harness made none in 6,000 edits.

## Consequences

- **Deleted cards stay in the document.** At a few hundred cards, that's small.
- **Every reader goes through `readPlan`,** which already exists, and that's where the "deleted" rule lives.
- **The single-user app benefits too:** undoing a delete becomes a flip of the mark, not a rebuild of the subtree.
- **This is the last schema change that's cheap.** Once boards are shared, the schema is on many people's computers at once.

## Implementation notes (sprint 10, slice 1)

- **Keys.** Value keys use the unit separator, `\u001f`, which can't appear in an ID typed or imported by a person: `v␟time` holds a single value, and `v␟system␟billing` is `true` for each multi value. Whether a property is multi-valued is read from the property when a card is written, and is fixed when the property is made.
- **Reading is forgiving.** `readPlan` (`src/store/schema.ts`) ignores a key of the wrong kind for its property, a value that's deleted or unknown, and every card that's deleted or under a deleted group. The ancestor walk stops at a loop of parents (ADR 0004).
- **Links aren't removed on delete.** Deleting a card leaves its dependencies and related links in the document, hidden by the reader, so undo, and anyone else's concurrent link, bring them back with the card. Removing a link is still an explicit command.
- **`meta.schema` is 2.** A document with content and no mark is version 1. The version 1 reader lives in `src/store/schemaV1.ts`, used only to migrate.
- **Migration in the browser.** The board now lives in `planning-board:v2:default`. When that database is empty and `planning-board:v1:default` holds a board, the board is read with the version 1 reader and written once, outside undo. The version 1 database is never written: an older build opened from disk afterwards finds the board as it was before the upgrade, and none of the later changes.
- **Compatibility.** The fixture from the last version 1 build is `sprint-9` (commit `a5bc057`). Every browser-board fixture opens through the migration in `src/commands/compat.test.ts`, and `e2e/migration.spec.ts` upgrades a sprint 8 board in a real browser.
- **The merge scenarios are store tests** (`src/commands/merge.test.ts`): L1 and L18 in both client orders, L2, L8, L9, L11 and O4, L12, L14, L16, U1, U2, and random edits that must converge without a single-valued property ever holding two values. Rerunning sprint 9's harness against schema 2: random edits leave no card with two quarters or two sizes (10 and 1 before), and no card stranded by a deleted group (14 before). L8, loops of parents, stays for ADR 0004's repair, and O2 and O3, replacing a shared board, for several plans per browser (Q58).
