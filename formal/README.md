# Formal models

Models of how sharing works, checked by tools rather than by tests, for the claims in [`docs/security/threat-model.md`](../docs/security/threat-model.md). Why these tools, and how they run: [ADR 0024](../docs/decisions/0024-formal-methods.md).

Run them with `npm run formal`. It needs:
- **OCaml,** for ProVerif, which it downloads on first use, checks against its pinned hash, and builds into `formal/.tools/` (`apt-get install ocaml-nox` on Ubuntu, `brew install ocaml` on a Mac);
- **Java,** for TLC. TLA+ publishes its tools only as builds replaced in place, so the one these models were checked with is kept here, as [`tools/tla2tools.jar`](tools/tla2tools.jar) (the nightly 2026.10.15.145915, MIT-licensed, with its own and its libraries' licenses inside), and its hash is checked on every run.

The sync model takes about 8 minutes on four cores. CI runs the same command in the "Formal: protocol, sync and grouping" job.

## What's here

| Model | Tool | What it shows |
|---|---|---|
| [`tla/Sync.tla`](tla/Sync.tla) | TLC | The relay and two clients, through offline editing, dropped connections, a tab crashing between saves, a relay restored from a backup, and snapshots. Checked in every reachable state: a live client's shadow holds only what the relay holds, and its cursor never claims more than its shadow; no change is lost from everywhere; and once everyone is connected and quiet, every copy holds every change. Broken variants: a cursor with no epoch trusted after a restore (as built before the F10 fix), and a backup restored without `-restored`. |
| [`proverif/relay.pv`](proverif/relay.pv) | ProVerif 2.05 | Against an attacker who is the network and the relay, and who sees every write token: a plan's content, presence, history, secret and key stay secret; a client accepts only what someone holding the key sealed for that room, kind and reach; new links keep the new room's content secret from someone who kept an old link. One expected attack: an operator who also holds a Can view link can write. |

## How a model is checked

- **Its results are recorded beside it.** For ProVerif, every query's result is in `relay.expected`, true and false alike, so an expected attack that stops being found is noticed too. For TLC, every invariant holds in every state its config reaches (`Sync.cfg`).
- **Each model has broken variants**, edits that remove what a result depends on, listed in `scripts/formal.ts`. Each must change that result. A model that passes its own broken variant is too weak to trust, however green it looks.

## What the models assume

- **The primitives are ideal:** XChaCha20-Poly1305 opens only with the key, nonce and additional data it was sealed with, and HKDF's two outputs are unrelated one-way functions of the secret. The models show the protocol uses them correctly, not that they're unbroken.
- **Additional data parses one way.** In the app it's `planning-board|1|<room>|<kind>|<upto>`, and room IDs can't contain `|`.
- **Yjs merges correctly.** The sync model treats a document as the set of changes it has seen, so merging is union.
- **The sync model's bounds:** two clients, two edits, one crash, one restore and four connections. A broken variant must fail within them, which is what keeps them from being too small. What it leaves out: view links and retiring a room, which the relay's Go tests cover; Make new links; and the history room, which syncs the same way under another room name.

## Changing one

A change to sealing, keys, links, the relay's protocol, sync or loop repair changes its model in the same pull request, and `npm run formal` passes. If a result changes on purpose, update the `.expected` file and say why in the pull request.
