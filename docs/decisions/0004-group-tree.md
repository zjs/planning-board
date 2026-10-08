# 0004: Group tree representation

Status: Accepted (sprint 0, slice 1). Single-user guard now; concurrent repair designed for M2. Sprint 9's merge harness confirmed the race is rare (no loops in 6,000 random edits) and that readers survive one (scenario L8, `docs/research/collaboration/merge-scenarios.md`); the repair is built in M2's first relay slice, with L8 as its test. Built in sprint 11, slice 2 (amendment below).

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

## Amendment (sprint 11, slice 2): loop repair, as built

Built before any build could share, so every build that can share stamps its moves.

- **What a card records.** A move between groups writes one `move` key beside `parent`: `{ previous, counter, client }`, the group it left and a Lamport stamp. `counter` is one more than the highest in the document; `client` is the Yjs client ID. `moveToParent`, `groupItems` and `ungroupItems` all go through one helper, so every move in a command shares a stamp.
- **Finding loops.** `loopRepairs` (`src/domain/tree.ts`) is pure. It looks at every card, deleted ones too, so a restore can't bring a loop back. In each loop, the card with the highest stamp loses (then the higher client ID, then the higher card ID, which also orders cards from before stamps existed). It goes back to the group it left. If that group is gone, or would loop again, it goes to the top level. A group that's deleted still counts: the card hides with it (ADR 0016). It repeats until no loop is left.
- **Writing the repair.** `repairLoops` writes `parent` only, with its own origin, outside undo. Every computer works out the same repair from the same cards, so two writing it at once agree. `watchLoops` runs it after any change that isn't itself a repair: another tab's or person's move, and undo, which can restore a group someone has since moved inside. It also runs once when a plan opens. In slice 3, view-only plans won't write repairs.
- **Undo after a repair.** Undoing the move that lost changes nothing on the board: Yjs won't put back a value something untracked has replaced. Redoing it makes the loop again, which is settled again. Both are pinned by tests.
- **Values can't loop.** A value only moves under another value one level up (`moveTargets`), so a move never changes its depth. A loop would need depth to fall all the way round, so it can't happen.
- **Evidence.**
  - `src/commands/merge.test.ts`: L8 ends in one nest on both sides, in both client orders. The watcher settles a loop as soon as the other side's move arrives.
  - A property test: 25 runs of random concurrent nesting leave no loop, and both sides agree.
  - Sprint 9's harness, rerun with repairs: L8 leaves one nest, and random edits converge with no loop.
