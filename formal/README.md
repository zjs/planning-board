# Formal models

Models of how sharing works, checked by tools rather than by tests, for the claims in [`docs/security/threat-model.md`](../docs/security/threat-model.md). Why these tools, and how they run: [ADR 0024](../docs/decisions/0024-formal-methods.md).

Run them with `npm run formal`. On first use it downloads the pinned tools into `formal/.tools/` and checks their hashes. ProVerif is built from source, which needs OCaml (`apt-get install ocaml-nox` on Ubuntu, `brew install ocaml` on a Mac). CI runs the same command in the "Formal: protocol, sync and grouping" job.

## What's here

| Model | Tool | What it shows |
|---|---|---|
| [`proverif/relay.pv`](proverif/relay.pv) | ProVerif 2.05 | Against an attacker who is the network and the relay, and who sees every write token: a plan's content, presence, history, secret and key stay secret; a client accepts only what someone holding the key sealed for that room, kind and reach; new links keep the new room's content secret from someone who kept an old link. One expected attack: an operator who also holds a Can view link can write. |

## How a model is checked

- **Its results are recorded beside it** (`relay.expected`), true and false alike. A result that changes either way fails, so an expected attack that stops being found is noticed too.
- **Each model has broken variants**, edits that remove what a result depends on, listed in `scripts/formal.ts`. Each must change that result. A model that passes its own broken variant is too weak to trust, however green it looks.

## What the models assume

- **The primitives are ideal:** XChaCha20-Poly1305 opens only with the key, nonce and additional data it was sealed with, and HKDF's two outputs are unrelated one-way functions of the secret. The models show the protocol uses them correctly, not that they're unbroken.
- **Additional data parses one way.** In the app it's `planning-board|1|<room>|<kind>|<upto>`, and room IDs can't contain `|`.
- **Yjs merges correctly.** The sync and grouping models, still to come, treat a document as the set of changes it has seen.

## Changing one

A change to sealing, keys, links, the relay's protocol, sync or loop repair changes its model in the same pull request, and `npm run formal` passes. If a result changes on purpose, update the `.expected` file and say why in the pull request.
