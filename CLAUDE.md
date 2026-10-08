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

Sprint 9 designs collaboration (M2, requirements 30–32) before any of it is built. It produces research, throwaway spikes under `spikes/`, draft ADRs, new questions and an M2 build plan, and the app doesn't change. Its scope is in `docs/sprint-9.md`, its slice plan in `docs/plans/sprint-9-plan.md`, and its documents in `docs/research/collaboration/`. Sprints 3–8 and the blank-plan slice (Q51) await the PM's acceptance, and one combined tester session covers them, opening with a cold start (`docs/demos/sprint-5-session.md`). Sprint 10's candidates are in `docs/backlog.md`: the first M2 build slices, contention with the conflicts panel, and whatever the session decides. The review process is in `docs/plans/sprint-0-plan.md`. If `requirements.md` and a sprint doc conflict, the sprint doc wins for now; log the conflict in `questions.md`. Tester feedback goes into `docs/backlog.md`.

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
- Engineering merges its own PRs once CI is green and self-review is done. The PM accepts or rejects on the build, not the diff (Q6).

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
- End-to-end tests: `npm run build && npm run e2e`. Playwright runs Chromium against `dist/index.html` over `file://`. Locally, the config uses `/opt/pw-browsers/chromium` if it exists; don't run `playwright install` in the cloud container.
- Regenerate the sample plan: `npm run seed`
- Regenerate the sample Jira export (`docs/samples/jira-export.csv`): `npm run sample:jira`
- Add compatibility fixtures for a new release (ADR 0005): add its commit to `VERSIONS` in `scripts/generate-compat-fixtures.ts`, then `npm run compat:fixtures`. Existing fixtures are never rewritten.
- Deploy: automatic. `.github/workflows/pages.yml` publishes every `main` build to https://zjs.github.io/planning-board/. CI also attaches the build to every run, unzipped, as `planning-board-<sha>.html`.
