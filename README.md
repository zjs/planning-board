# Planning Board

A planning whiteboard for product leadership on enterprise product lines: a place to shuffle, argue about, and reshape a release plan before any of it goes into Jira.

Every roadmap item is a card with properties: sequence, system area and component, size, time, and your own (team, customer, …). Any two of them can be the board's rows and columns. Drag a card into a cell and it takes both values. Pivot to another pair, and the same cards rearrange: a sequencing brainstorm, a component map, and a quarterly plan are three views of one plan, not three documents. A dependency placed out of order is highlighted as something to argue about, never blocked as a rule.

**[Try it in your browser →](https://zjs.github.io/planning-board/)** Start a blank plan and follow the short guide, look around the sample plan, or import a Jira CSV export.

## Your roadmap stays on your machine

The app is one static HTML file. It runs entirely in your browser, and has no account or analytics. Your plan is saved in your browser's own storage, and **File › Save plan to file** gives you a copy you control. You can also download the file (below) and open it from disk.

It makes no network requests unless you share a plan through a relay. A shared plan goes through a relay, which you run yourself (below), or travels as files you send. Everything is encrypted in your browser first, with a key that's only in the share link, after the `#`, which browsers never send to a server. The relay stores and forwards what it can't read.

## Status: early preview

This is being built in the open, a sprint at a time. It's usable for trying the idea on your own data, but it isn't finished.

**Works today**

*Thinking it through on your own*

- **Start from scratch** with a blank plan and a five-step guide that's done by doing it. Type ideas one after another: Enter after each title starts the next card, and they stay in the order you typed them.
- **Pivot** with one click: Sequence, Roadmap, Sizing and Structure, or any two properties as rows and columns. The cards glide to their new places, so you can see they're the same cards. Drag a card to set both values; it says where it will land while you drag. Areas and quarters fold into one lane each, or unfold into components and releases. Undo everything.
- **Name things where they are:** double-click a row or column header to rename it, and add areas, quarters, sizes or your own values from "+ Add" at the board's edges.
- **Move several cards at once:** drag a box across empty space to select a run of cards, then drag one of them; they all move, in one undo step.
- **Dependencies:** select two cards and press L. Links show when you point at a card, and links whose order contradicts the board are always drawn in red, along with loops. Press ⌥L (Alt+L) instead to mark two cards as related, with no order: a dotted line that's never red.
- **Groups and levels:** cards nest to any depth, as initiatives, epics, and stories. Expand a group in place to see its cards framed under its name, wherever they land, and collapse it again from the frame. Hold a dragged card over another to put it inside. Markers flag cards that don't fit their group: dated outside it, larger than it, in another area, or at or above its level.
- **Find:** press / and type. Cards that match stay bright and the rest fade, without anything moving; Enter selects them all.
- **An inspector** for editing any card's properties, description, group, and links without pivoting, for one card or many.
- **Your own properties,** such as Team, and editing any property's values (rename, move, reorder, delete).
- **Right-click any card,** or its ⋯, for every action on it and its keyboard shortcut. **?** opens a cheat sheet. Each card's colored edge is its area, and the holding lanes for cards without a value collapse to a thin rail.

*Working on it together*

- **Share a plan** through a relay you run (below): **Share** gives a Can edit and a Can view link. Edits show up on everyone's board as they're made. Work offline whenever you like: the board counts what isn't shared yet, and shares it when you're back. **Make new links** cuts off the old ones.
- **See each other:** an avatar per person, and their pointers and selections on the same cards in your own view, whatever view each of you is in. Someone can drive, and pointers can be quieted to the driver's or nobody's. A card someone is dragging says so, and when two people drop the same card, both are told, each with a way back.
- **Who changed what:** Activity lists every change to a plan, by day and by person, in your own time zone, and brings back anything deleted. A card's history is in the inspector. History is kept forever, in its own encrypted document beside the plan.
- **Share by file** where no relay is allowed: the plan travels as encrypted files, by email or a shared drive, and each person merges what the others send.

*Getting plans in and out*

- **Import from Jira CSV** (Jira's "Export › CSV (all fields)"): map columns, then choose where components, versions, issue types, and story points go. Epics become groups, "Blocks" links become dependencies, and "Relates" links become related links.
- **Several plans in one browser:** a scratch plan beside the real one, listed in the File menu and named in the toolbar. Opening a file, importing, starting a blank plan and loading the sample each make a new plan, so nothing you're working on is overwritten. The same plan open in two tabs stays in step as you edit.
- **Plan files:** a versioned, readable JSON format ([ADR 0005](docs/decisions/0005-plan-file-format.md)). Every build is tested against plans saved by every earlier build, so a plan you save keeps opening.

**Not yet**

- Component contention (too much work landing on one component at once), and a panel listing every conflict.
- Reordering cards by hand within a cell.
- Scenarios, saved views, and filters that hide cards (find fades them instead).
- Updating a plan from a fresh Jira export: each import is a new plan.
- Seeing what others changed while you were away, marked on the board. It's next ([`docs/plans/m2-plan.md`](docs/plans/m2-plan.md)).
- A hosted relay to share through without running your own. Until then, sharing needs a relay you or your company run.

What it's for, in full, is in [`docs/requirements.md`](docs/requirements.md). What's coming is in [`docs/backlog.md`](docs/backlog.md), and decisions and open product questions are in [`docs/decisions/`](docs/decisions/) and [`docs/questions.md`](docs/questions.md).

**Browsers:** automated tests run in Chromium (Chrome, Edge). Firefox and Safari haven't been checked thoroughly yet; reports are welcome. If the board says it can't save, the page is still usable, but changes won't survive a reload.

## Feedback

[Open an issue](https://github.com/zjs/planning-board/issues/new/choose): something broken, an export that didn't import well, or what you'd need before using this for real. Please don't paste anything from a confidential roadmap. For an import problem, your file's header row is usually all that's needed. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Run your own relay

The relay is one program, with the app inside. Download the archive for your computer from the [`relay-latest` release](https://github.com/zjs/planning-board/releases/tag/relay-latest), unpack it, and run `planning-board-relay`. It prints two addresses: one for this computer, and one colleagues on your network can open. Open the first, and **Share** a plan from there; the links it gives use the second. The relay is only for sharing: on your own, the hosted page or a downloaded file is all you need.

For a server, there's a container: `docker run -p 8787:8787 -v planning-board-data:/data ghcr.io/zjs/planning-board`. Options, Mac and Windows notes, and what the relay can and can't see are in [`relay/README.md`](relay/README.md), which comes in the download too. HTTPS behind a proxy, upgrades, backups, and a pilot on a laptop are in [`docs/hosting.md`](docs/hosting.md).

## Other ways to run it

- **Offline copy:** open the hosted page and save it (it's one self-contained file), or download a build from any CI run under **Actions**: the `planning-board-<commit>.html` artifact opens straight in a browser. The CI download needs a GitHub login.
- **From source:** needs Node 22 or later, and Go 1.26 or later for the relay.

```sh
npm install
npm run dev          # dev server with hot reload
npm run check        # typecheck + lint + unit tests
npm run build        # dist/index.html, the single-file app
npm run e2e          # Playwright tests against dist/index.html (build first); with Go installed, also against a relay
npm run seed         # regenerate the sample plan, src/seed/sample-plan.json
npm run sample:jira  # regenerate the sample Jira export, docs/samples/jira-export.csv
npm run notices:relay  # regenerate the relay's license notices, after changing its Go modules
npm run compat:fixtures  # save fixtures from a newly released build (ADR 0005)
(cd relay && go test -race ./...)  # the relay's tests
```

## Layout

- `src/domain/`: the model and every query over it, as pure functions. No UI or storage imports.
- `src/commands/`: every change to a plan, each one Yjs transaction and one undo step.
- `src/store/`: the Yjs document layout, browser storage, and syncing a shared plan through a relay, encrypted.
- `src/ui/`: React components.
- `relay/`: the relay, in Go. It serves the app, and stores and forwards shared plans it can't read.
- `e2e/`: Playwright tests, including each sprint's exit criteria. `e2e/relay/` runs against a real relay.
- `scripts/`: generators for the sample plan, the sample Jira export, and the compatibility fixtures.
- `docs/`: requirements, the backlog and open questions, sprint scopes and plans, decision records, demo notes, and sample data. [`docs/housekeeping.md`](docs/housekeeping.md) is how the repo is kept tidy.

## License

[Apache 2.0](LICENSE). The open-source software inside the app is listed with its licenses in the cheat sheet, under **Open-source licenses**, and the relay's in each download.
