# 0016: A document schema for concurrent editing

Status: Proposed (sprint 9). To be built before any sync code, in M2's first slice. Amends ADR 0006.

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
