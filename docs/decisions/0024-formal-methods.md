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

**What the first runs found,** while this was being decided. All of them are in the repository, and CI repeats their results:
- **The sync model found a bug** (the threat model's F10). A browser whose first catch-up is cut short before the relay's `synced` message has a cursor but no epoch, so after a restore it can't tell the room changed, and it misses the new room's first changes. The fix, starting again from nothing when a connection opens with a cursor but no epoch, passes the model (24,168,513 distinct states, counting each pair of mirror-image states once), and the code as it was is one of its broken variants. The first version of the fix checked at `synced` instead, which made every first join download the plan twice; the self-review caught it.
- **It also shows why `-restored` matters.** Restoring a backup without it lets a browser keep believing the relay holds changes it lost, so they never reach anyone else.
- **The tree model passes** with three moves (11,485 states, 7 seconds) and four (244,525 states, 2 minutes).
- **The protocol model gives every expected result** in 0.09 seconds, including the one expected attack.

**Yjs is assumed, not modeled.** Both TLA+ specs treat a document as the set of changes it has seen, so syncing is union. That's the property Yjs is built for _(recalled)_. It isn't verified here, and the threat model lists it as an assumption.

**Randomized schedules bridge the models and the code.** A seeded generator drives the real commands and relay provider through what the models describe, and checks the same properties: `src/commands/schedules.test.ts` in memory, 200 seeds in `npm run check` and 2,000 in the formal job, and `e2e/relay/schedules.spec.ts` through real browsers and the Go relay, a few seeds. A failing seed is in the test's name, so it can be run again. It needs no new dependency. The schedules are only as good as what they reach: the first version never reached F10's interleaving, and caught the old code only once it added people opening the link mid-session, catch-ups cut short, and restores from any earlier backup. Even so, it's one seed in the first 200.

**In CI:** a third job, "Formal: protocol, sync and grouping", which runs `npm run formal` (`scripts/formal.ts`). The protocol model is in it from sprint 14, slice 2, the sync model from slice 3, and the tree model and the random schedules from slice 4.
- **ProVerif 2.05** is built from its source tarball, kept in the repository as `formal/tools/proverif2.05.tar.gz` (from `https://bblanche.gitlabpages.inria.fr/proverif/proverif2.05.tar.gz`, SHA-256 `4871f53c32ab4a04669a060c4886ba5d9080496963fb980a9a62d2c429ceabc4`), with Ubuntu's `ocaml-nox`, in seconds. It's GPL v2, and kept unmodified, with its license, as a separate tool: nothing of it is in the app or the relay.
- **TLC** is `tla2tools.jar`, kept in the repository as `formal/tools/tla2tools.jar` and checked against its SHA-256 `15d103b7e5617780bcc904c0af12f1ad242e2b345c0301136c5be4588f17edac` on every run, on the runner's Java. It's the nightly 2026.10.15.145915 (its manifest: 2.0 2026-10-15, git revision `932d35ec2b9fdb3d3e4d0a3321689c634a1f6b43`), MIT-licensed. TLA+ publishes its tools only as builds replaced in place: the jar at `https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar` was rebuilt between two runs on the day this was written, and isn't on Maven Central. A pin on the download would fail at each rebuild, and building TLC from source in CI would take far longer than the models. The stable 1.7.4 was tried, and is far too slow: still running after 18 minutes on the three-move tree model, which the kept build checks in 7 seconds.
- **Nothing is downloaded,** so neither CI nor what waits on it depends on another server. Moving to a new version of either tool is a change of its own: replace the file and its hash, and run every model.
- `npm run formal` runs the same job locally, installing ProVerif into `formal/.tools/` on first use (`formal/README.md`). The whole job takes about 15 minutes on four cores.

## Alternatives

- **TLA+ for everything,** as the PM first suggested. TLA+ has no attacker and no cryptography built in, so both would be written by hand, and secrecy, a property about what an attacker can derive, is awkward to state as an invariant.
- **Tamarin.** Covered above.
- **Proofs in a proof assistant** (Coq, Lean, Isabelle). Far more effort for each change to the code, and nobody on the project would maintain them.
- **Property-based tests alone.** They check the real code, but only the schedules they happen to try. They're kept as the bridge, not as the evidence.

## Consequences

- **CI gains a job of about 15 minutes,** most of it the sync model, whose config takes about 10 minutes on four cores. It runs beside the other jobs, so it adds little to how long CI takes. **The Pages deploy and the releases wait on it,** since they wait for the whole CI run, whether or not `main`'s ruleset requires the check; that's why its tools are kept in the repository. A change to the protocol, the relay or loop repair that breaks a model fails CI like a failing test.
- **A change to sealing, links, the protocol, sync or loop repair changes its model in the same PR.** The definition of done (`docs/housekeeping.md`) says so, from slice 2.
- **The models prove what they model.** The threat model says what each covers and what it leaves out: the primitives, the browser, Yjs itself, and anyone who already has a link.
