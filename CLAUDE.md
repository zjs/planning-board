# Release Planning Whiteboard

A collaborative planning whiteboard for product leadership (PMs, EMs, tech leads) on enterprise product lines. It sits upstream of Jira: a place to brainstorm and argue about a release plan before it's committed. The core bet is pivotable perspectives on one set of items (drag a card into a cell and it writes the values for both axes), plus highlights for dependency and component conflicts. Open source, Apache 2.0.

@docs/requirements.md
@docs/sprint-5.md
@docs/questions.md
@docs/backlog.md

## Roles

- **The human is the product manager.** They own requirements, priorities, and acceptance. They're an experienced engineer (Go) who is deliberately staying hands-off on code, to practice the PM role. Don't ask them to review diffs or make routine implementation choices; show them working software and ask product questions.
- **You are the engineering team.** You own implementation choices within the architecture rules below. Record significant choices as short ADRs in `docs/decisions/`.
- **Don't resolve product ambiguity silently.** If a requirement is unclear, contradictory, or looks wrong once built, add an entry to `docs/questions.md` with context, options, and your recommendation. If it blocks you, build the recommended option as a reversible default, and flag it at the end of the session.

## Current phase

Sprints 3–13 and the blank-plan slice were accepted on 2026-10-10 (Q78). From now on, the PM accepts a sprint once they've used its build and found nothing blocking. Tester sessions feed the backlog rather than gating acceptance. The combined session for sprints 3–8, which opens with a cold start, is `docs/demos/sprint-5-session.md`. Tester feedback goes into `docs/backlog.md`.

Next is sprint 14, since you were away, which starts in plan mode after the maintenance pass and the housekeeping slice from the repository review (`docs/reviews/2026-10-09-repo-hygiene.md`). The rest of M2 is `docs/plans/m2-plan.md`: sprint 14.

What's built, for orientation: sprint 9 designed collaboration (summary in `docs/research/collaboration/README.md`; its spikes are in `spikes/`, out of lint, typecheck and CI). Sprints 10–13 built it: schema 2 and several plans per browser, the relay (Go, in `relay/`, with `e2e/relay/` testing the app against it), presence and changes by file, and history. Each sprint's demo note is `docs/demos/sprint-N.md`.

If `requirements.md` and a sprint doc conflict, the sprint doc wins for now; log the conflict in `questions.md`.

## Architecture rules

- **Frontend:** TypeScript in strict mode, browser only. No backend in sprint 0.
- **Domain core (`src/domain/`):** plain TypeScript with no UI or Yjs imports. Holds the model (items, properties, value hierarchies, dependencies, parent pointers) and all queries, including view layout and conflict detection, as pure functions over plain snapshots.
- **Storage:** a Yjs document is the source of truth. The UI reads snapshots derived from it. All changes go through command functions (`src/commands/`) that apply Yjs transactions; UI code never writes to Yjs directly.
- **Every change is undoable** (Y.UndoManager) and survives reload (IndexedDB persistence).
- **Rendering:** DOM or SVG. Canvas or WebGL only if an ADR justifies it.
- **Future relay (M2) will be written in Go** and will only ever see end-to-end encrypted payloads. Never design anything that requires a server to read plan content.
- Record new runtime dependencies in the relevant ADR.

## Quality bar

- Unit tests for everything in `src/domain/` and `src/commands/`.
- CI runs typecheck, lint, and tests on every push.
- `main` is always deployable. Every PR and every merge to `main` produces a self-contained single-file HTML build as a CI artifact that the PM can open and click through (see Q5 in `questions.md`), and every merge to `main` is published to GitHub Pages (Q31).
- The repo is public (Q31). Never commit real roadmap data; samples are synthetic. Issues are welcome, but code PRs aren't being accepted yet (`CONTRIBUTING.md`).
- Engineering merges its own PRs once CI is green and self-review is done (Q6). Self-review has two parts: the author drives the build in a browser for any UI change, and a separate Claude session posts a review on the PR, whose findings are each fixed or answered before merging (Q76). The steps are in `docs/housekeeping.md`, and the reviewer's instructions in `docs/self-review.md`. The PM accepts or rejects on the build, not the diff.

## Working agreement

- Start each new piece of work in plan mode: propose, then wait for the PM's approval.
- Work in thin vertical slices. Each ends with a deployed build and a short demo note: what to click, what should happen, and known gaps.
- Keep conclusions in the repo, not the chat: ADRs, `questions.md` entries, and sprint doc checkboxes.
- Feedback goes into `docs/backlog.md` first, under a theme; decisions it needs go into `questions.md`.
- Housekeeping follows `docs/housekeeping.md` (proposed, Q49): its definition of done in every slice, a release pass in each sprint's last slice, and a maintenance pass before planning each sprint.
- End each session with a three-line summary: what shipped, what's next, and any open questions for the PM.

## Commands

- Install: `npm install` (Node 22+)
- Dev server: `npm run dev`
- All fast checks (what CI runs first): `npm run check` = `npm run typecheck && npm run lint && npm test`
- Build the single-file app: `npm run build` → `dist/index.html`
- End-to-end tests: `npm run build && npm run e2e`. Playwright runs Chromium against `dist/index.html` over `file://`, and, where Go is installed (always in CI), `e2e/relay/` against a relay it starts on port 18787 serving `dist/`. Locally, the config uses `/opt/pw-browsers/chromium` if it exists; don't run `playwright install` in the cloud container.
- The relay (Go, in `relay/`): `cd relay && go test -race ./...`. To run it with the current build: `npm run build && cd relay && go run . -static ../dist -data /tmp/relay-data`. It needs Go 1.26 or later; with an older Go installed, `GOTOOLCHAIN=auto` fetches the one `go.mod` asks for.
- Regenerate the sample plan: `npm run seed`
- Regenerate the sample Jira export (`docs/samples/jira-export.csv`): `npm run sample:jira`
- Third-party notices: the app's are generated by the build (`scripts/notices.ts`, ADR 0001); a bundled package with no license file fails it. The relay's are `relay/third_party_notices.txt`: after changing its Go modules, `npm run notices:relay`, or `go test` fails.
- Add compatibility fixtures for a new release (ADR 0005): add its commit to `VERSIONS` in `scripts/generate-compat-fixtures.ts`, then `npm run compat:fixtures`. Existing fixtures are never rewritten.
- Deploy: automatic, after CI passes on `main`. `.github/workflows/pages.yml` publishes the file CI tested to https://zjs.github.io/planning-board/, and `.github/workflows/release.yml` publishes the relay's downloads as the `relay-latest` release and its image as `ghcr.io/zjs/planning-board`, with checksums and build attestations. CI also attaches the build to every run, unzipped, as `planning-board-<sha>.html`, and the relay for each computer as `planning-board-relay-<os>-<arch>`.
- Release a version (ADR 0023): in a sprint's release pass, set the version in `package.json` and write `docs/releases/vX.Y.Z.md`. When that merges, `release.yml` publishes `vX.Y.Z` and tags the image. Nobody pushes tags by hand. If the release run fails partway, use "Re-run failed jobs" on it.
