# Formal models

Models of how sharing works, checked by tools rather than by tests, for the claims in [`docs/security/threat-model.md`](../docs/security/threat-model.md). Why these tools, and how they run: [ADR 0024](../docs/decisions/0024-formal-methods.md).

Run them with `npm run formal`. It needs:
- **OCaml,** for ProVerif, which it builds into `formal/.tools/` on first use (`apt-get install ocaml-nox` on Ubuntu, `brew install ocaml` on a Mac);
- **Java,** for TLC.

Both tools are kept in [`tools/`](tools/), so nothing is downloaded, and their hashes are checked on every run: `tla2tools.jar` is the TLA+ nightly 2026.10.15.145915 (git revision `932d35ec2b9fdb3d3e4d0a3321689c634a1f6b43`), MIT-licensed, with its own and its libraries' licenses inside; `proverif2.05.tar.gz` is ProVerif's source, GPL v2, unmodified, with its license. Neither is part of the app or the relay. Why they're kept here: ADR 0024.

The sync model takes about 10 minutes on four cores here, and the whole run about 15; on GitHub's runners the job took about 7 (2026-10-15). CI runs the same command in the "Formal: protocol, sync and grouping" job.

## What's here

| Model | Tool | What it shows |
|---|---|---|
| [`tla/Sync.tla`](tla/Sync.tla) | TLC | The relay and two clients, through offline editing, dropped connections, a tab crashing between saves, a relay restored from a backup, and snapshots. Checked in every reachable state: a live client's shadow holds only what the relay holds, and its cursor never claims more than its shadow; no change is lost from everywhere; and once everyone is connected and quiet, every copy holds every change. Broken variants: a cursor with no epoch trusted after a restore (as built before the F10 fix), and a backup restored without `-restored`. A witness shows the bounds reach a quiet state after a restore made while everyone was in sync. |
| [`tla/Tree.tla`](tla/Tree.tla) | TLC | Two people moving three cards between groups, up to four moves, each on their own copy, with Yjs settling concurrent writes between the two, and loop repair (`loopRepairs`) running wherever a loop appears. Checked: a repair always leaves a tree, and once people stop, every copy ends the same tree. Broken variants: a repair that sends a card back into a group now inside it, and no repair at all. It leaves out deleted cards, which repair treats like any other. |
| [`proverif/relay.pv`](proverif/relay.pv) | ProVerif 2.05 | Against an attacker who is the network and the relay, and who sees every write token: a plan's content, presence, history, secret and key stay secret; a client accepts only what someone holding the key sealed for that room, kind and reach; new links keep the new room's content secret from someone who kept an old link (by construction, since the new secret is never sent). One expected attack: an operator who also holds a Can view link can write. Broken variants: the room, the kind, or a snapshot's reach left out of the additional data. |

## Random schedules: the models against the code

A model checks a design, not the code. Two tests check the code against the same properties, on seeded random schedules:

- **[`src/commands/schedules.test.ts`](../src/commands/schedules.test.ts)** runs the real commands and the real relay provider over an in-memory relay (`src/store/fakeRelay.ts`). Up to five people add, rename and nest cards, go offline, crash between saves, open the link for the first time, and live through relay restarts, flaky catch-ups and restores from any earlier backup. Afterwards every copy must be the same plan, with every card it ever had, titles someone gave them, and no loop. `npm run check` runs 200 seeds; CI's formal job runs 2,000. Run one seed with `npx vitest run src/commands/schedules.test.ts -t "seed 72:"`.
- **[`e2e/relay/schedules.spec.ts`](../e2e/relay/schedules.spec.ts)** runs a few seeds through two real browsers and the Go relay: drags, going offline and reloading, then both must save the same plan.

Code as it was before F10's fix fails seed 72 of the first 200, and 7 of the first 1,000.

## How a model is checked

- **Its results are recorded beside it.** For ProVerif, every query's result is in `relay.expected`, true and false alike, so an expected attack that stops being found is noticed too. For TLC, every invariant holds in every state its config reaches (`Sync.cfg`).
- **Each model has broken variants**, edits that remove what a result depends on, listed in `scripts/formal.ts`. Each must change that result. A model that passes its own broken variant is too weak to trust, however green it looks.

## What the models assume

- **The primitives are ideal:** XChaCha20-Poly1305 opens only with the key, nonce and additional data it was sealed with, and HKDF's two outputs are unrelated one-way functions of the secret. The models show the protocol uses them correctly, not that they're unbroken.
- **Additional data parses one way.** In the app it's `planning-board|1|<room>|<kind>|<upto>`, and room IDs can't contain `|`.
- **Yjs merges correctly.** The sync model treats a document as the set of changes it has seen, so merging is union.
- **The tree model's bounds:** two people, three cards, four moves. Its first broken variant needs four moves to fail; with three, it passes. Its rule for which of two concurrent writes wins is Yjs's for two people; with three or more Yjs also weighs a write both saw (YATA), which isn't modeled, so the model is held to two. Its move counter counts further than the code's, an over-approximation a copy counting the code's way also passes, and it moves one card at a time, leaving out a drag of several cards, which share one stamp.
- **The sync model's bounds:** two clients, two edits, one crash, one restore and four connections. A broken variant must fail within them, which is what keeps them from being too small. What it leaves out: view links and retiring a room, which the relay's Go tests cover; the relay refusing a change (too large, too fast, over a limit), which in the app waits for the next reconnect; asking for every kept update when a snapshot can't be read; Make new links; and the history room, which syncs the same way under another room name.

## Changing one

A change to sealing, keys, links, the relay's protocol, sync or loop repair changes its model in the same pull request, and `npm run formal` passes. If a result changes on purpose, update the `.expected` file and say why in the pull request.
