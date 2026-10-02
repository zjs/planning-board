# Housekeeping

Status: **proposed 2026-10-02**, awaiting the PM (questions.md Q49). The first pass under it was done the same day.

The repo is public, and it's read by three audiences who each notice different rot:

- **Strangers** read the README and the help panel. They notice claims that are no longer true.
- **The PM** reads the backlog, questions and demo notes. They notice tenses that lie ("lands in sprint 5" after it shipped) and answers that a later decision quietly overturned.
- **The build** depends on packages and CI actions that age on their own, whether or not anyone touches the code.

Each kind of rot has a different trigger, so housekeeping is four activities rather than one. Each is small if it's done when it's triggered, and large if it's saved up.

## 1. With every slice: the definition of done

Part of the slice's own PR, checked during self-review. Nothing here waits for a cleanup pass.

- [ ] The sprint doc's checkboxes for the slice are ticked.
- [ ] Every question the slice settles or builds has a "Built in …" note, and any earlier answer it overturns has a "Superseded by …" note.
- [ ] A new or changed gesture is in the help panel (`src/ui/Legend.tsx`).
- [ ] A change to the plan file or the Yjs document adds a compatibility fixture from the commit before it (ADR 0005).
- [ ] A significant implementation choice has an ADR, or an amendment to one, and the ADR index lists it.
- [ ] A new runtime dependency is recorded in an ADR.
- [ ] The PR body has a demo note: what to click, what should happen, and known gaps.

## 2. When a sprint closes: the release pass

Part of the sprint's last slice ("tester-ready"), so `main` is tidy before the PM accepts it.

- [ ] **Compatibility fixtures:** add the sprint's last commit to `VERSIONS` and run `npm run compat:fixtures`. Do it after the merge, in the next PR.
- [ ] **README:** "Works today" and "Not yet" match the build, read as someone who has never seen the project.
- [ ] **Help panel:** read top to bottom, as a tester on their first visit. Is every gesture on the board there, and is everything there still true?
- [ ] **Backlog:** shipped themes move under "Shipped themes", with "Lands" lines in the past tense. "Sprints" says what's awaiting acceptance.
- [ ] **Questions:** statuses that name a future sprint still point at the right one.
- [ ] **Docs that describe removed behavior:** session scripts and demo notes are records, so they stay, but the current ones say what they supersede.
- [ ] **CLAUDE.md "Current phase"** and the sprint plan's status line are up to date.

## 3. Before planning each sprint: the maintenance pass

Done at the start of sprint planning, so its findings can be scheduled with everything else. The sprint cadence here is days, not weeks, so this works out to about weekly. If sprints stretch past a month, do it monthly instead.

- [ ] `npm outdated` and `npm audit`. Take patch and minor updates. Look at each major, and either take it or record in the backlog's Housekeeping what's blocking it (TypeScript 7, for example).
- [ ] CI actions in `.github/workflows/` are on their current majors. Actions on retired Node runtimes stop working without warning.
- [ ] Node: CI and `CLAUDE.md` name a supported LTS version, with a move to the next one scheduled well before end of life.
- [ ] The backlog's Housekeeping list: anything done since the last pass moves to Done, and anything stuck says why.
- [ ] GitHub issues: every new one is answered, and its feedback is in the backlog.

## 4. When feedback arrives: intake

Already defined at the top of [`backlog.md`](backlog.md): feedback goes into a theme, decisions it needs go into `questions.md`, and a sprint doc schedules it. Do it the same day, while the context is fresh.

## What's automated, and what isn't

Done by CI on every push:

- The compatibility gate (ADR 0005).
- The exit criteria of every sprint, end to end.

Can't be automated, because each needs a reader:

- Reading the README and help panel with fresh eyes.
- Tidying tenses and supersessions.
- Judging a major upgrade.

Could be automated, and needs the PM's decision (Q49):

- **Dependabot** for npm and GitHub Actions, monthly, with minor and patch updates grouped into one PR. It would open pull requests that engineering merges on green. The repo already takes engineering's PRs this way, but it adds traffic to the repo's PR list.
- **A scheduled routine** that runs pass 3 on its own and opens one PR with the results. It's useful if sprints pause for a while, and redundant while they don't.
