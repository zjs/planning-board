# Contributing

Thanks for looking. Planning Board is early, and it's built in the open.

## Issues and feedback: yes, please

[Open an issue](https://github.com/zjs/planning-board/issues/new/choose) for:

- **Something broken.** Include the build shown at the bottom of the cheat sheet (the **?** button in the toolbar), your browser, and how you opened the app: the hosted page, a file, or from a relay. On a shared plan, the cheat sheet names the relay's build too.
- **An import problem.** Paste your CSV's header row. It holds only column names, and it's usually enough to fix detection.
- **Ideas and feedback,** especially from PMs, EMs, and tech leads who plan multi-component releases. What would you need before you'd bring this to a planning meeting?

Please don't paste or attach real roadmap data, or a share link: anyone with a link can open its plan. Made-up titles are fine for describing a problem. Security problems go to [private reporting](SECURITY.md) instead.

Feedback from issues and user sessions is collected in [`docs/backlog.md`](docs/backlog.md), grouped into themes, so you can see where it went.

## Code: not yet

Code pull requests aren't being accepted yet, while the core design is still settling. That will change. Until then, an issue that describes the problem is the most useful contribution, and a proposed fix in an issue is welcome.

## How decisions are made

The code is written by Claude Code, with a human product manager; the README's [How this is built](README.md#how-this-is-built) says how that works.

- [`docs/requirements.md`](docs/requirements.md) is what the tool is for.
- [`docs/questions.md`](docs/questions.md) lists open product questions and their answers. It's a good place to see whether something is already being discussed.
- [`docs/decisions/`](docs/decisions/) holds short architecture decision records.
- `docs/sprint-*.md` and [`docs/plans/`](docs/plans/) record what each sprint set out to do.
