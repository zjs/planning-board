# Planning Board

A planning whiteboard for product leadership on enterprise product lines, used before anything goes into Jira. Every roadmap item is a card with properties: sequence, system components, size, time. Any two of them can be the board's axes. Drag a card into a cell and it takes both values. Pivot to another pair of axes and the same cards rearrange, so a sequencing brainstorm, a component map, and a quarterly plan are three views of one plan, not three documents. Dependency and component conflicts will show as highlights to argue about, never as hard rules.

Status: sprint 0, validating the core interaction. Single user, runs entirely in the browser, no server. See [`docs/requirements.md`](docs/requirements.md) and [`docs/sprint-0.md`](docs/sprint-0.md).

## Try it

Every CI run attaches the app as one self-contained HTML file. Open a run under **Actions**, download the `planning-board-<commit>` artifact, unzip it, and open `index.html` in a browser. [`docs/demos/sprint-0.md`](docs/demos/sprint-0.md) walks through what to try.

## Develop

Needs Node 22 or later.

```sh
npm install
npm run dev        # dev server with hot reload
npm run check      # typecheck + lint + unit tests
npm run build      # dist/index.html, the single-file app
npm run e2e        # Playwright tests against dist/index.html (build first)
npm run seed       # regenerate src/seed/sample-plan.json
```

The sample plan is plain JSON in [`src/seed/sample-plan.json`](src/seed/sample-plan.json), in the format described in [ADR 0005](docs/decisions/0005-plan-file-format.md). You can replace it with your own data.

## Layout

- `src/domain/`: the model and every query over it, as pure functions. No UI or storage imports.
- `src/ui/`: React components.
- `src/seed/`: sample plan.
- `docs/decisions/`: architecture decision records.

## License

[Apache 2.0](LICENSE)
