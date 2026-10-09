# Repository review, 2026-10-09

A review of the repository as a technical stranger meets it, asked for by the PM: "How would things look to a potential new user, given that the most likely users to discover the project at this stage are going to be rather technical. Do our PR descriptions and commit messages inspire confidence? Is our CI legible? Is the testing and review process sufficiently transparent? We flipped the switch from private to public — but is there more we need to adjust in our way of working?"

Provenance tags: _(recalled)_ = from memory, unverified; _(priors)_ = reasoned guess. Untagged claims about the repo were checked on 2026-10-09 against `main` at `4349272`, the GitHub API, and the last 40 CI runs.

## The problem

A technical visitor, such as an engineering lead weighing the tool for their team, doesn't start with the app. They read the repo the way they'd review a vendor: the README, then the commit log, a few PRs, the Actions tab, and Releases. They want to know whether it's maintained, whether `main` works, whether a self-hosted relay can be pinned and upgraded safely, and who is behind it.

What they find is good work that doesn't explain itself:

- **The tool's honest story is invisible.** Every PR ends "🤖 Generated with Claude Code", and every commit is co-authored by Claude. The README never says so. A visitor works it out within a minute, and finding it out on their own reads as concealment. Hearing it up front reads as an experiment worth watching.
- **Review is invisible.** 89 PRs, all opened and merged by the same account, typically 5–20 minutes after opening (just long enough for CI), with no reviews or comments on any of them. The averages over the last 50 commits are 19 files and about 1,800 inserted lines per merge. To an outsider, the process docs (definition of done, self-review) are claims with no trace.
- **Nothing is accepted.** The README, backlog and `CLAUDE.md` all say that sprints 3–13 await the PM's acceptance. A stranger reads that as eleven sprints that nobody has signed off.
- **There's nothing to pin.** The app's version is `0.0.0`. The only release is `relay-latest`, deleted and recreated on every merge, and the container image has `latest` plus a commit hash. There are no release notes beyond a git log written in sprint numbers.

None of this calls for a change to how the code is built. It needs the process to show itself, plus a few settings and small CI changes.

## How this was assessed

- **The front door:** the README, CONTRIBUTING, SECURITY, the issue templates, the ADR index and `docs/`, read as a stranger.
- **The record:** all 89 PR titles and timings, the full bodies of several PRs, the last 50 commit messages, branches, tags and releases.
- **CI:** `ci.yml`, `pages.yml` and `release.yml`, and the last 40 runs of CI with their timing against each merge.
- **Not covered:**
  - Branch protection and repository settings beyond what the API returned; the tools here can't read them.
  - Whether private vulnerability reporting is turned on.
  - Dependabot or secret scanning alerts.

## What's working: keep it

- **PR bodies are strong.** They say what to click, what changed and why, and what was checked, with test counts. The fix for the blank board (#87) is a model: what the PM saw, the root cause, why the tests missed it, and a test that fails without the fix.
- **Commit bodies are prose.** Squash merges keep the PR's explanation in `git log`, so `git blame` leads to a reason.
- **CI gates everything that ships.** Pages and the relay release run only after CI passes on a push to `main`. Merges in the sample all waited for a green PR run, and every `main` run in it passed. The default token is read-only, and forks are handled safely.
- **The compatibility gate is unusual, and a selling point.** Every build is tested against plans saved by every earlier build. Few projects at this stage do that _(priors)_.
- **Decisions are traceable.** There are 22 ADRs with an index and statuses, and every product decision is in `questions.md` with its options and its answer.
- **The user-facing docs are tested.** Broken links and internal jargon fail `npm run check`.
- **Basics are in place:** a license, CONTRIBUTING that's honest about not taking code yet, SECURITY with private reporting, issue templates that warn against pasting roadmaps or share links, and third-party notices.

## Findings, ranked by effect on a technical visitor's trust

### 1. Say how it's built (Q75)

The repo is an AI engineering team with a human PM who stays out of the code on purpose. That is the most interesting thing about it to a technical reader, and also the first thing they'll be suspicious of. Today it shows only in PR footers, co-author trailers, and a root `CLAUDE.md` addressed to Claude.

A short "How this is built" section in the README would say:

- who does what;
- that a human sets requirements and accepts on the build, not the diff;
- what CI gates;
- how it's tested;
- where the decision log is.

Then the same facts read as a deliberate method rather than a discovery. It also explains the `Claude-Session` links at the end of every commit and PR, which are private and lead nowhere for anyone else.

### 2. Make review visible (Q76)

The definition of done in `docs/housekeeping.md` asks for self-review, but nothing on a PR shows it happened. Two cheap changes:

- **A "Reviewed" section in each PR body:** what the self-review checked, what it found and fixed, the risks, and what isn't covered by tests. This turns "trust me" into a record.
- **An independent automated review** on each PR, posting findings that the PR answers before merging. It costs setup and some money per PR, so it's the PM's call.

### 3. Close the acceptance gap, or rename it (Q78)

Eleven sprints "await acceptance". It's a process risk as well as an appearance problem. Engineering is building M2 on foundations no one has accepted, and the combined tester session for sprints 3–8 hasn't happened. A stranger also can't tell "awaiting acceptance" from "unfinished".

### 4. Versions, release notes, and checksums (Q77)

A self-hoster needs:

- a version to pin;
- notes that say what changed and whether an upgrade is safe;
- a way to check that a download is the one CI built.

Today the relay downloads have no checksums or provenance, and the release is replaced on every merge, which notifies anyone watching releases each time _(priors)_. For a tool that sells end-to-end encryption to companies, provenance is cheap evidence:

- `SHA256SUMS`;
- GitHub's build attestations, so `gh attestation verify` proves a download came from this repo's CI _(recalled)_.

### 5. Commit subjects lead with the sprint, not the change

`Sprint 13, slice 4: a card's history` tells a maintainer when; `git log --oneline` readers want what. Engineering's default from now on: the subject says what changed, and the sprint goes in brackets at the end: `Card history in the inspector (sprint 13, slice 4)`.

Two smaller things:

- Merged commits carry Claude as co-author twice, once from the commit and once from GitHub's squash.
- One branch, `claude/collaborative-editing-exploration-8uklmd`, carried sprints 11–13.

### 6. CI is sound, but you have to open it to see that

- **One job does most of the work.** The `check` job runs typecheck, lint, unit tests, the build, and end-to-end tests. A red ✗ says "check", and the reader has to open the log to learn which step failed.
- **The summary is thin.** It says only "Build ready", although CI knows more: 563 unit tests, 158 end-to-end tests, and the relay's tests.
- **The README has no CI badge,** the usual first signal that `main` is green _(priors)_.
- **Pages rebuilds the app** instead of deploying the file CI tested, although its comment says it's "the same single file". `release.yml` reuses CI's build, and Pages should too, so what's tested is what's deployed.
- **Actions are pinned to major versions** (`@v7`), including the third-party `docker/*` actions in a job that can push the container image. Pinning those to commit SHAs is common supply-chain advice _(recalled)_. Dependabot (Q49) would keep the pins current.

### 7. How it's tested isn't written down anywhere a stranger looks

The strategy is good: pure-function unit tests over `src/domain/` and `src/commands/`, the compatibility gate, each sprint's exit criteria as end-to-end tests, and end-to-end tests against a real relay. It's spread across `CLAUDE.md`, ADR 0005 and the README's command list. Four lines in the README would say it.

### 8. Repository settings

These are all one-click settings, so they're the PM's to do:

- **The About box:** the API returned no description, homepage or topics. Add a one-line description, the Pages link, and topics such as `roadmap`, `planning`, `crdt`, `yjs` and `end-to-end-encryption`.
- **Branch hygiene:** nine branches besides `main`, all merged or abandoned. Turn on "Automatically delete head branches" and delete the old ones.
- **A ruleset on `main`:** require CI's `check` and `relay-test` jobs to pass, and block force-pushes. Merges already wait for green, but a rule makes "main is always deployable" a guarantee rather than a habit. This couldn't be checked here.
- **Private vulnerability reporting:** check it's on. SECURITY.md promises a reply through it.

### 9. `docs/` is a decision log with no map

`docs/` holds 15 sprint docs, 15 plans, 20 demo notes, a 642-line `questions.md`, and the research. That's valuable, and Q31 kept it public on purpose. But a newcomer can't tell which documents describe the system now and which are records of a sprint.

- **A map:** a short `docs/README.md` that says where to start: requirements, the ADR index, `hosting.md`; then the process records.
- **The code:** comments cite questions by number on 341 lines in `src/`. That's fine, as long as each comment also carries the gist, so it reads without opening `questions.md`. Fix them as they're touched; no sweep.

### 10. Firefox and Safari, still

The check has been open since sprint 1. Technical early adopters use Firefox more than most _(priors)_, so a broken board in Firefox would be their first impression. It needs a person, and an hour.

## What changes in how we work

The private-repo habits that should change now that strangers read the record:

- **The record is the product's first impression,** not just a log. Commit subjects, PR bodies and release notes are written for a stranger as well as the PM.
- **Show the gate, not just the outcome.** Each PR says what review found. Each release says what was tested and what's compatible.
- **Acceptance keeps pace with building,** or the word changes (Q78).
- **Versions are promises.** Once self-hosters pin a version, a breaking relay change needs a note and a version bump. The compatibility gate already covers plan files; the relay protocol needs the same discipline (ADR 0017).

## Next steps

**For the PM:** Q75–Q78 in `questions.md`, Q49's automation (now more pressing), and the settings in finding 8.

**For engineering,** proposed as one housekeeping slice once the PM answers, since most items depend on the answers:

- the README's "How this is built" and "How it's tested" sections, and a CI badge;
- a `docs/README.md` map;
- CI job names, a step summary with test counts, and Pages deploying CI's own file;
- for the relay release: checksums, build attestations, and SHA-pinned third-party actions;
- a "Reviewed" section in the PR body, added to the definition of done;
- versioned releases, if Q77 says so.

The commit subject style (finding 5) needs no decision, and starts with the next commit.
