# Planning Board

A planning whiteboard for product leadership on enterprise product lines: a place to shuffle, argue about, and reshape a release plan before any of it goes into Jira.

Every roadmap item is a card with properties: sequence, system area and component, size, time, and your own (team, customer, …). Any two of them can be the board's rows and columns. Drag a card into a cell and it takes both values. Pivot to another pair, and the same cards rearrange: a sequencing brainstorm, a component map, and a quarterly plan are three views of one plan, not three documents. The goal is to add dependency and component conflicts as highlights to argue about, never as hard rules.

**[Try it in your browser →](https://zjs.github.io/planning-board/)** Load the sample plan, or import a Jira CSV export.

## Your roadmap stays on your machine

The app is one static HTML file. It runs entirely in your browser, makes no network requests, and has no server, account, or analytics. Your plan is saved in your browser's own storage, and **File › Save plan to file** gives you a copy you control. You can also download the file (below) and open it from disk.

## Status: early preview

This is being built in the open, a sprint at a time. It's usable for trying the idea on your own data, but it isn't finished, and plans are single-user for now.

**Works today**

- **Start from scratch** with a blank plan, and type ideas one after another: Enter after each title starts the next card. Or explore the sample plan, or import your own.
- **Pivot** any two properties as rows and columns, and drag cards to set both values. Areas and quarters fold into one lane each, or unfold into components and releases. Undo everything.
- **Dependencies:** select two cards and press L. Links show when you point at a card, and links whose order contradicts the board are always drawn in red, along with loops.
- **Groups and levels:** cards nest to any depth, as initiatives, epics, and stories. Expand a group in place to see what's inside, and hold a dragged card over another to put it inside. Markers flag cards that don't fit their group: dated outside it, larger than it, in another area, or at or above its level.
- **Find:** press / and type. Cards that match stay bright and the rest fade, without anything moving; Enter selects them all.
- **An inspector** for editing any card's properties, description, group, and links without pivoting, for one card or many.
- **Your own properties,** such as Team, and editing any property's values (rename, move, reorder, delete).
- **Import from Jira CSV** (Jira's "Export › CSV (all fields)"): map columns, then choose where components, versions, issue types, and story points go. Epics become groups, and "Blocks" links become dependencies.
- **Plan files:** a versioned, readable JSON format ([ADR 0005](docs/decisions/0005-plan-file-format.md)). Every build is tested against plans saved by every earlier build, so a plan you save keeps opening.

**Not yet**

- Component contention (too much work landing on one component at once), and a panel listing every conflict. They're next.
- "Related to" links, ordering cards within a cell, and dragging several cards at once.
- Scenarios, saved views, and filters that hide cards (find fades them instead).
- An import replaces the board. Updating a board from a fresh export isn't built.
- One person at a time. Live collaboration comes later, through a relay that only ever sees encrypted data.

What it's for, in full, is in [`docs/requirements.md`](docs/requirements.md). What's coming is in [`docs/backlog.md`](docs/backlog.md), and decisions and open product questions are in [`docs/decisions/`](docs/decisions/) and [`docs/questions.md`](docs/questions.md).

**Browsers:** automated tests run in Chromium (Chrome, Edge). Firefox and Safari haven't been checked thoroughly yet; reports are welcome. If the board says it can't save, the page is still usable, but changes won't survive a reload.

## Feedback

[Open an issue](https://github.com/zjs/planning-board/issues/new/choose): something broken, an export that didn't import well, or what you'd need before using this for real. Please don't paste anything from a confidential roadmap. For an import problem, your file's header row is usually all that's needed. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Other ways to run it

- **Offline copy:** open the hosted page and save it (it's one self-contained file), or download a build from any CI run under **Actions**: the `planning-board-<commit>.html` artifact opens straight in a browser. The CI download needs a GitHub login.
- **From source:** needs Node 22 or later.

```sh
npm install
npm run dev          # dev server with hot reload
npm run check        # typecheck + lint + unit tests
npm run build        # dist/index.html, the single-file app
npm run e2e          # Playwright tests against dist/index.html (build first)
npm run seed         # regenerate the sample plan, src/seed/sample-plan.json
npm run sample:jira  # regenerate the sample Jira export, docs/samples/jira-export.csv
npm run compat:fixtures  # save fixtures from a newly released build (ADR 0005)
```

## Layout

- `src/domain/`: the model and every query over it, as pure functions. No UI or storage imports.
- `src/commands/`: every change to a plan, each one Yjs transaction and one undo step.
- `src/store/`: the Yjs document layout and browser storage.
- `src/ui/`: React components.
- `e2e/`: Playwright tests, including each sprint's exit criteria.
- `scripts/`: generators for the sample plan, the sample Jira export, and the compatibility fixtures.
- `docs/`: requirements, the backlog and open questions, sprint scopes and plans, decision records, demo notes, and sample data. [`docs/housekeeping.md`](docs/housekeeping.md) is how the repo is kept tidy.

## License

[Apache 2.0](LICENSE)
