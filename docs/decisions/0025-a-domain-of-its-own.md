# 0025: A domain of its own for the public build, and moving plans to it

Status: Accepted (sprint 14, slice 5). The product side is Q80 (d), answered on 2026-10-16: move the public build to a domain of its own, help people bring their plans, and keep the current site until the new one is bought, deployed and validated. The host and the name are still to be chosen.

## Context

The public build is served at `zjs.github.io/planning-board/`. Every site under `zjs.github.io` shares that browser origin, so any of them could read the plans and keys kept there (F3 in `docs/security/threat-model.md`). A domain of its own fixes that.

Browser storage belongs to one origin. A new address starts with nothing, and people's plans, the edit keys of shared plans, their history and their names stay at the old one. Share links already sent name the old address too.

GitHub sends a project's `github.io` address to the custom domain set on it _(recalled)_. So if this repository's Pages site took the new domain, no page could run at the old address to hand plans over.

## Decision

**The new address is served from somewhere other than this repository's Pages site.** That's a second repository's Pages site, or another host, which the PM chooses. This repository's Pages site keeps the old address.

**Plans move browser to browser, at the person's request.** The new address offers **Bring plans from zjs.github.io** in the File menu, and opens with it when it was reached through the old address.
- **The old side, `move.html`:** the dialog opens it in a tab of its own. A frame wouldn't work: browsers keep a frame's storage apart from its site's own _(recalled)_.
- **What it sends:** it reads every localStorage key and IndexedDB database of ours, record by record, without knowing what's in them. It posts them to the page that opened it, with the new address as the only origin allowed to receive them.
- **The new side:** it accepts one message, from the tab it opened, at the old address. It shows the plans by name, and writes nothing until the person confirms.
- **How each plan arrives (`src/commands/move.ts`):**
  - its boards and histories are merged in as Yjs updates;
  - its sync records come along, so the relay sends only what's missing;
  - it keeps its id, unless that id is taken here, when it gets a new one;
  - a shared plan already held here takes in the moved copy's changes instead of being added twice;
  - settings come along only where this browser has none.

**At the switch, the old address serves a stub (`stub.html`).**
- **Share links:** it sends them on to the new address with the same fragment, so a key never reaches a server, adding `&moved=1` when this browser still keeps plans there.
- **No plans:** it goes straight on.
- **Plans held:** it offers to move them, or to open the old app, kept beside it at `./app/`, to save them to files. Once they're moved, it offers to delete them from the old address.

**One switch.** `pages.yml` reads the repository variable `OLD_ADDRESS_SERVES`:
- `app`, the default, deploys the app with `move.html` beside it, which is what runs now;
- `stub` deploys the stub, `move.html` and the old app at `./app/`.

`docs/domain-move.md` is the runbook.

**Placeholders until the name is chosen.** `NEW_PUBLIC_APP` in `src/move/addresses.ts` is `https://planning-board.example/`, a reserved name nobody can serve. So nothing links to it, and the menu item shows nowhere today. Tests point both sides at two addresses on the test computer through two localStorage keys, which each side reads only for itself.

## Alternatives

- **Download and open a file.** It needs no second page and no pop-up. But a plan file carries no sharing, history or keys, and a file that did would leave edit keys in someone's downloads folder. The old app at `./app/` keeps it as the fallback.
- **A frame at the old address.** It's simpler than a tab, but storage partitioning gives a frame from another site its own empty storage _(recalled)_.
- **Keep the custom domain on this repository's site, and the stub in the user site repository.** It depends on which of GitHub's two sites wins a path, which we haven't checked, and it moves the stub out of this repository.

## Consequences

- `move.html` is deployed beside the app now. It can only post to the placeholder until the domain exists, and a reserved name can't be anyone's.
- **A page elsewhere on `zjs.github.io`** can already read the old address's storage (F3), and could try to post plans to the new address. The new side listens only to the tab it opened, and adds nothing the person hasn't confirmed by name.
- **Relays need the new host allowed.** Their `-allow-origin` default names only `zjs.github.io` today. A release that adds the new host has to come before the switch, and the runbook says so.
- **After the switch,** plans stay at the old address until their owner moves or deletes them. The old app at `./app/` stays as long as the stub does.
