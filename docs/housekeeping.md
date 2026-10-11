# Housekeeping

Status: **proposed 2026-10-02**, awaiting the PM (questions.md Q49). The first pass under it was done the same day.

The repo is public, and it's read by three audiences who each notice different rot:

- **Strangers** read the README, the help panel, and the relay's docs if they run one. They notice claims that are no longer true, and words they can't look up. The full list is in [User-facing docs](#user-facing-docs), below.
- **The PM** reads the backlog, questions and demo notes. They notice tenses that lie ("lands in sprint 5" after it shipped) and answers that a later decision quietly overturned.
- **The build** depends on packages and CI actions that age on their own, whether or not anyone touches the code.

Each kind of rot has a different trigger, so housekeeping is four activities rather than one. Each is small if it's done when it's triggered, and large if it's saved up.

## 1. With every slice: the definition of done

Part of the slice's own PR, checked during self-review. Nothing here waits for a cleanup pass.

- [ ] The sprint doc's checkboxes for the slice are ticked.
- [ ] Every question the slice settles or builds has a "Built in …" note, and any earlier answer it overturns has a "Superseded by …" note.
- [ ] A new or changed gesture is in the help panel (`src/ui/Legend.tsx`).
- [ ] A change someone outside the project would notice is in the user-facing doc that describes it ([the list](#user-facing-docs)): a feature, a renamed control or view, a relay flag or a line it prints, a new way to open or share the app. A renamed label is searched for in all of them, issue templates included.
- [ ] A change to the plan file or the Yjs document adds a compatibility fixture from the commit before it (ADR 0005).
- [ ] A significant implementation choice has an ADR, or an amendment to one, and the ADR index lists it.
- [ ] A new runtime dependency is recorded in an ADR. Its license notice comes with it: the app's build lists bundled packages on its own, and a new or upgraded Go module needs `npm run notices:relay`.
- [ ] The PR body has a demo note: what to click, what should happen, and known gaps.
- [ ] **The author drives the build** in a browser before opening the PR, for any slice that changes the UI. Take screenshots, to catch what tests can't see: overlap, jank, drop highlights (the pass from `docs/plans/sprint-0-plan.md`). The review below reads only the diff, so it doesn't replace this.
- [ ] **Self-review is on the PR** (Q76), once the PR is open, alongside CI and before merging:
  - A separate Claude session reviews the diff: a subagent with a fresh context, or a new session, given only the PR number and the instructions in [`self-review.md`](self-review.md), never the authoring session's reasoning.
  - It posts one **Comment** review that opens with "Self-review by a separate Claude session", with each finding inline on its line. GitHub doesn't let an author approve their own PR, and engineering works under the PM's account.
  - Each finding is fixed in a commit or answered in its thread, then resolved. The `main` ruleset requires resolved threads before a merge.

## 2. When a sprint closes: the release pass

Part of the sprint's last slice ("tester-ready"), so `main` is tidy before the PM accepts it.

- [ ] **The version** (ADR 0023): set `package.json`'s version to `0.N.0` for sprint N, and write `docs/releases/v0.N.0.md` for someone on the release page: what's new, that older plans still open, anything to know before upgrading a relay, and how to check a download. Move the pinned version in the user-facing docs along (a test checks they match). The release is published when this PR merges and CI passes on `main`; check it appeared, with its checksums and the image tag.
- [ ] **Compatibility fixtures:** add the sprint's last commit to `VERSIONS` and run `npm run compat:fixtures`. Do it after the merge, in the next PR.
- [ ] **User-facing docs:** read each one in [the list](#user-facing-docs) as its reader, who has never seen the project. The README's "Works today" and "Not yet" match the build, and anything the list says goes stale on the sprint's kind of change is checked.
- [ ] **Help panel:** read top to bottom, as a tester on their first visit. Is every gesture on the board there, and is everything there still true?
- [ ] **Backlog:** shipped themes move under "Shipped themes", with "Lands" lines in the past tense. "Sprints" says what's awaiting acceptance.
- [ ] **Questions:** statuses that name a future sprint still point at the right one.
- [ ] **Docs that describe removed behavior:** session scripts and demo notes are records, so they stay, but the current ones say what they supersede.
- [ ] **CLAUDE.md "Current phase"** and the sprint plan's status line are up to date.

## 3. Before planning each sprint: the maintenance pass

Done at the start of sprint planning, so its findings can be scheduled with everything else. The sprint cadence here is days, not weeks, so this works out to about weekly. If sprints stretch past a month, do it monthly instead.

- [ ] Dependabot's pull requests (weekly, Q49) are merged or answered. A major version gets its own PR; take it or record what's blocking it. A Go module it adds needs `npm run notices:relay`.
- [ ] `npm outdated` and `npm audit`. Take patch and minor updates. Look at each major, and either take it or record in the backlog's Housekeeping what's blocking it (TypeScript 7, for example).
- [ ] CI actions in `.github/workflows/` are on their current majors. Actions on retired Node runtimes stop working without warning.
- [ ] Node: CI and `CLAUDE.md` name a supported LTS version, with a move to the next one scheduled well before end of life.
- [ ] The backlog's Housekeeping list: anything done since the last pass moves to Done, and anything stuck says why.
- [ ] GitHub issues: every new one is answered, and its feedback is in the backlog.

## User-facing docs

Read by people who know nothing of our sprints, questions or ADRs. Each is written for its reader, refers to a version by what it does or a date (never "sprint 12"), and links an ADR only as "how this works", for anyone who wants the reasoning.

| Doc | Reader | Goes stale when |
|---|---|---|
| `README.md` | Someone deciding whether to try it, from a link or word of mouth | Anything ships; "Not yet" changes; a way to open or run the app changes |
| Help panel (`src/ui/Legend.tsx`) | Someone using the board | A gesture, control or word on the board changes |
| `relay/README.md`, also in each relay download | Whoever runs a relay, often with only the download | A flag, a default, or what it prints changes; anything it links moves |
| `docs/hosting.md` | IT, or a pilot user running it for a team | Deploying, upgrading, backups, HTTPS, or what needs a newer relay |
| `SECURITY.md` | A security researcher, or a reviewer at a company | What leaves the browser changes: sharing, a new file type, a new service |
| `CONTRIBUTING.md` and `.github/ISSUE_TEMPLATE/` | Someone reporting a problem | A control they're told to find is renamed or moved; a new way to open the app |
| `docs/releases/vX.Y.Z.md`, published as the release's page | Someone choosing which relay to run, or upgrading one | Written once per release; links must be absolute |
| The `relay-latest` notes in `.github/workflows/release.yml` | Someone on the relay download page | What's in the download, or where its docs live |

`npm run check` runs `scripts/user-docs.test.ts`, which fails on the mechanical part of this: a link inside the repo that doesn't resolve, a relative link in the relay's README (which ships without the repo around it), and sprint, question or requirement numbers in any of these. Whether a doc is still true and clear needs a reader.

## 4. When feedback arrives: intake

Already defined at the top of [`backlog.md`](backlog.md): feedback goes into a theme, decisions it needs go into `questions.md`, and a sprint doc schedules it. Do it the same day, while the context is fresh.

## What's automated, and what isn't

Done by CI on every push:

- The compatibility gate (ADR 0005).
- The user-facing docs' links, and keeping our internal numbering out of them.
- The exit criteria of every sprint, end to end.

Can't be automated, because each needs a reader:

- Reading the user-facing docs with fresh eyes.
- Tidying tenses and supersessions.
- Judging a major upgrade.

Automated since 2026-10-11 (Q49): **Dependabot**, weekly, for npm, Go modules and GitHub Actions, with minor and patch updates grouped into one PR per ecosystem (`.github/dependabot.yml`). Its PRs go through CI and self-review like engineering's.

Could be automated, and needs the PM's decision:

- **A scheduled routine** that runs pass 3 on its own and opens one PR with the results. It's useful if sprints pause for a while, and redundant while they don't.
