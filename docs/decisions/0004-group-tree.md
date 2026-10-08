# 0004: Group tree representation

Status: Accepted (sprint 0, slice 1). Single-user guard now; concurrent repair designed for M2. Sprint 9's merge harness confirmed the race is rare (no loops in 6,000 random edits) and that readers survive one (scenario L8, `docs/research/collaboration/merge-scenarios.md`); the repair is built in M2's first relay slice, with L8 as its test.

## Context

Any item can contain items, recursively; an item has at most one parent (requirements 11–14). Requirement 14: grouping never creates a cycle, even when two people nest items at the same moment. With concurrent edits, each person's move can be valid locally while the merge is a cycle: Alice puts A under B while Bob puts B under A.

## Decision

- **Representation:** each item stores a **parent pointer** (`parent: ItemId | null`). No children lists, so there's nothing to keep in sync.
- **Sprint 0 (single user):** the grouping command checks `wouldCreateCycle` (`src/domain/tree.ts`) and refuses the move. Readers are defensive regardless: an item whose parent is missing, or that sits on a cycle, shows at the top level rather than disappearing.
- **M2 (concurrent):** alongside `parent`, each item records `previousParent` and a move stamp (a Lamport counter plus client ID). The snapshot derivation looks for cycles in the merged state and breaks each one the same way on every client: in the cycle, the move with the highest stamp loses, and that item falls back to its `previousParent` (or top level, if that also cycles). The first client to notice writes the repair back, so the document converges.

## Alternatives

- **Children arrays per group.** Concurrent moves can put an item in two arrays at once; needs its own repair logic on top of cycle repair.
- **Full move-operation CRDT** (Kleppmann et al., "A highly-available move operation for replicated trees", _recalled_): a log of timestamped moves, undone and redone in order. Correct in general, but heavy to build on Yjs. Our tree is small (hundreds of nodes) and cycles need two people nesting the same items at once, so deterministic repair on read is enough.

## Consequences

- A lost concurrent move is visible (the item lands back where it was). Acceptable for a rare race; the UI can flash the item.
- Every derived view must go through the cycle-safe tree helpers, never follow `parent` blindly. Tests in `tree.test.ts` cover this.
