# 0024: Formal checks: ProVerif for the protocol, TLA+ for sync and grouping

Status: Accepted (sprint 14, slice 1). The product side is Q79, answered on 2026-10-15: a protocol verifier for secrecy and TLA+ for the relay, with the choice of verifier made here. The PM widened the scope the same day, in sprint 14's planning, to collaboration, offline work included.

## Context

The threat model (`docs/security/threat-model.md`) makes claims of three kinds:
- **Secrecy and authenticity** against an operator who controls the network and the relay: what a protocol verifier is for.
- **Sync behaves as promised:** the relay's log, snapshots and restores, and each client's shadow, cursor and resends, through offline work and crashes. These are state machines with interleavings tests rarely reach: what TLA+ and its model checker, TLC, are for.
- **Grouping never makes a cycle** under concurrent moves (requirement 14), which is known to be easy to get wrong.

A model only says something about the code if it stays next to it and runs when the code changes.

## Decision

**ProVerif, not Tamarin, for the protocol** (`formal/proverif/`).
- The protocol is a fixed message flow with no state that changes what a party will send: derive keys, seal, open. ProVerif's applied pi calculus states it directly, and proves unbounded sessions automatically in well under a second _(measured: 0.09 s)_.
- Tamarin is stronger on protocols whose state matters, such as ratchets and key rotation, but its proofs often need guiding by hand _(recalled)_, which a CI job can't do.
- Each query's expected result is recorded beside the model. CI fails if any result changes, true to false or false to true. One query is expected to be false: an operator holding a Can view link can write.

**TLA+ with TLC for sync and grouping** (`formal/tla/`).
- **`Sync.tla`:** the relay and its clients.
- **`Tree.tla`:** concurrent moves and loop repair. It models Yjs's resolution of concurrent writes to one key: a write wins over every write its author had seen, and the client ID decides between writes made apart.
- Each spec's CI config is at least as large as the smallest config its broken variant fails on: four moves for `Tree.tla`, which takes about two minutes. A larger config is run by hand before a change to the code it models.
- **CI runs each broken variant too, and requires it to fail.** A config that shrinks below where it can find the bug then fails CI, rather than passing quietly. The state count also goes in the job summary.
- **Every model is checked against a broken variant** before it's trusted: a mutation of the rule it's about, which must fail. Without that, a model too small to reach the bug passes as easily as a correct one. With three moves, the tree model passed a broken repair; it takes four moves to reach the failure.

**What the first runs found,** while this was being decided. These come from local drafts of the models, which land in the repository with slices 2–4:
- **The sync model found a bug** (the threat model's F10). A browser whose first catch-up is cut short before the relay's `synced` message has a cursor but no epoch, so after a restore it can't tell the room changed, and it misses the new room's first changes. The fix, starting again from nothing when there's a cursor but no epoch, passes the model, and is built with it.
- **It also shows why `-restored` matters.** Restoring a backup without it lets a browser keep believing the relay holds changes it lost, so they never reach anyone else.
- **The tree model passes** with three moves (11,485 states, 7 seconds) and four (244,525 states, 2 minutes).
- **The protocol model gives every expected result** in 0.09 seconds, including the one expected attack.

**Yjs is assumed, not modeled.** Both TLA+ specs treat a document as the set of changes it has seen, so syncing is union. That's the property Yjs is built for _(recalled)_. It isn't verified here, and the threat model lists it as an assumption.

**Randomized schedules bridge the models and the code.** A seeded generator drives the real app and relay through what the models describe, and checks the same properties. A failing seed prints itself so it can be replayed. It needs no new dependency.

**In CI,** built by slices 2–4 of sprint 14: a third job, "Formal: protocol, sync and grouping". Until then, the models are local drafts, not yet in the repository.
- ProVerif 2.05 is built from its source tarball, `https://bblanche.gitlabpages.inria.fr/proverif/proverif2.05.tar.gz`, pinned by SHA-256 `4871f53c32ab4a04669a060c4886ba5d9080496963fb980a9a62d2c429ceabc4`, with Ubuntu's `ocaml-nox`. That takes seconds.
- TLC is `tla2tools.jar` from `https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar`, pinned by SHA-256 `0f56d6a813368c48008dfbecb23a73ab43a4a5e1bf09f026782a674aa9d4b3c9`, on the runner's Java. The 1.8.0 release may be rebuilt in place _(recalled)_. If so, the hash check fails with a message saying so, and the pin is updated after checking the new build gives the same results. The cache is keyed by the hash, so a rebuild upstream never changes a run silently. The stable 1.7.4 was tried, and is far too slow: still running after 18 minutes on the three-move tree model, which 1.8.0 checks in 7 seconds.
- Both are cached.
- `npm run formal` will run the same job locally.

## Alternatives

- **TLA+ for everything,** as the PM first suggested. TLA+ has no attacker and no cryptography built in, so both would be written by hand, and secrecy, a property about what an attacker can derive, is awkward to state as an invariant.
- **Tamarin.** Covered above.
- **Proofs in a proof assistant** (Coq, Lean, Isabelle). Far more effort for each change to the code, and nobody on the project would maintain them.
- **Property-based tests alone.** They check the real code, but only the schedules they happen to try. They're kept as the bridge, not as the evidence.

## Consequences

- **CI gains a job of about ten minutes,** most of it the sync model: its draft's config takes 8 minutes on four cores. It runs beside the other jobs, so it adds little to how long CI takes. A change to the protocol, the relay or loop repair that breaks a model fails CI like a failing test.
- **A change to sealing, links, the protocol, sync or loop repair changes its model in the same PR.** Slice 2 adds this to the definition of done (`docs/housekeeping.md`), once `npm run formal` exists for it to point at.
- **The models prove what they model.** The threat model says what each covers and what it leaves out: the primitives, the browser, Yjs itself, and anyone who already has a link.
