# Sprint 9: engineering plan

Status: **approved 2026-10-08.** **Complete 2026-10-08.** Slices 0–2 were PRs #59–#61, slices 3 and 4 were #62, and slices 5 and 6 follow. The summary is `docs/research/collaboration/README.md`, and the build plan `docs/plans/m2-plan.md`. Scope is in `docs/sprint-9.md`. This doc covers how engineering delivers it. The review process is unchanged from sprint 0 (`docs/plans/sprint-0-plan.md`, "Quality and review process").

## Context

The PM wants sprint 9 to be a design sprint for collaboration (M2: requirements 30–32), in place of contention and the conflicts panel. Collaboration touches everything already built: undo, groups, drag semantics, persistence, the plan file. It also has failure modes nobody has seen yet, because every edit so far came from one person. Building it without a design risks shipping merges that surprise people, which matters more for this tool than most: the board's value is that everyone trusts what's on it.

**The PM's answers (2026-10-08):**
- **Deliverable:** docs plus throwaway spikes. Spikes produce evidence, live under `spikes/`, stay out of the app build, and never ship.
- **Encryption is fixed:** the relay never reads plan content. The exploration designs inside that and writes down what it costs.
- **Public demo relay:** decided after the research, so the exploration includes the options and a recommendation.
- **Go deepest on:** live-session collisions, knowing who changed what, and offline divergence. Undo is covered, but less deeply.

**What the code already gives us:** commands write differences, not whole values; multi-value properties are sets; undo already tracks only local commands (`LOCAL_ORIGIN` in `src/commands/store.ts`), so "undo only mine" mostly comes free _(priors, to be verified by a spike)_; readers already survive orphans and cycles (ADR 0004). **What it doesn't:**
- the concurrent tree repair ADR 0004 designed is unbuilt;
- a single-valued property resolves a concurrent edit to the **lowest value ID** (`readPlan` in `src/store/schema.ts`), not the last drop. In a live session, two people dragging one card to different quarters would see a winner that looks random. This is the first thing the spikes measure;
- titles are plain last-writer-wins strings (ADR 0006);
- there's one board per browser (`DB_NAME = …:default` in `src/store/persistence.ts`), so you can't keep your own plan alongside a shared one;
- `loadPlan`, import and New blank plan replace the whole document, which in a shared plan would replace it for everyone;
- there's no plan diff yet. Scenario compare (req. 23) and "what changed while you were away" both need one.

## The questions this sprint answers

1. **Live collisions.** What should happen when two people drag, nest, rename or delete the same thing within seconds, and does the loser notice? Options to evaluate: pure CRDT merge with last-writer-wins on single values; showing intent through presence ("Dana is moving this"), with a soft hold; or flashing whatever lost.
2. **Who changed what.** What attribution and history can an end-to-end encrypted, accountless CRDT support? What's shown: "last changed by" in the inspector, a change feed, and a "since you were away" view (one diff that reuses scenario compare)?
3. **Offline divergence.** Someone works for an hour off the VPN, then reconnects. Options to evaluate: (a) silent merge, with a summary afterwards; (b) a review step before the merge; (c) the offline edits become a scenario (ADR 0003) that can be compared before it's applied; (d) the UX prevents it: read-only when the relay is gone, or a clear "working offline" state. Which of these fits a whiteboard better than a document?
4. **Presence.** Cursors, selections, a card being dragged, "follow the driver" for a shared-screen session (the M1 assumption), names and colors with no accounts.
5. **Sharing and keys.** A link is the key (Excalidraw's model _(recalled)_). What does revoking access mean? How are snapshots compacted when the server can't read them? How does someone go from a local plan to a shared one?
6. **Feasibility and cost.** The relay protocol, catch-up after a disconnect, snapshot storage, the size and speed cost of encryption, and how "one container" self-hosting looks.
7. **The public demo.** A hosted relay, peer-to-peer for demos, or self-host only (left open by the PM).

## Slices

Each slice is a PR, merged on green, with a short note on what to read and run. The research docs go under `docs/research/collaboration/`.

| # | Slice | You can do this afterwards |
|---|---|---|
| 0 | **Sprint setup** | Read `docs/sprint-9.md` and this plan in the repo. The backlog moves contention to sprint 10's candidates. |
| 1 | **Prior art** | Read how ~12 tools handle merging, offline work, presence, history and encryption, side by side, and what each choice cost them. |
| 2 | **Merge scenarios on our own schema** | Run one command and read a table of ~25 two-person scenarios: what each person did, what the board shows after syncing, and whether that would surprise anyone. |
| 3 | **Relay and encrypted sync** | Start a Go relay, open two browsers on one encrypted link, edit in both, take one offline, reconnect. The relay's storage holds only ciphertext. |
| 4 | **Presence and attribution** | In the spike, see the other person's cursor, selection and the card they're dragging, plus a "since you were away" summary after a reconnect. |
| 5 | **UX design** | Read mockups for presence, collisions, offline state, reconnecting, history and sharing, each tied to a question it resolves. |
| 6 | **Decisions and the build plan** | Answer a short list of new questions, read draft ADRs, and see M2 split into build sprints with thin slices. |

## How each slice is built

0. **Setup.**
   - Maintenance pass: it ran on 2026-10-07, so this one is light. `npm outdated`, `npm audit` (the `braces` advisory is still open, with no patched release) and CI actions all match yesterday's pass. Record it in the backlog's Housekeeping.
   - `docs/sprint-9.md` (goal, deliverables, exit criteria) and `docs/plans/sprint-9-plan.md` (this plan).
   - Backlog: a new theme M, Collaboration, with sprint 9 as an exploration. Contention and the conflicts panel become sprint 10 candidates.
   - `CLAUDE.md`: update the current phase.
1. **Prior art** (`prior-art.md`).
   - **Tools:** Figma multiplayer, Excalidraw (E2EE rooms), tldraw sync, Miro/FigJam, Linear's sync engine, Google Docs (suggestions, version history), Notion offline, Jira's concurrent edit handling, and Actual Budget (E2EE CRDT sync).
   - **Research:** Ink & Switch's local-first work (Upwelling, Patchwork, Keyhive), Kleppmann's move operation, Secsync and Serenity Notes (E2EE on Yjs).
   - **Infrastructure:** y-websocket, y-sweet, Hocuspocus, Liveblocks, PartyKit.
   - **For each:** the merge model, what offline does, the presence UX, history and attribution, encryption, and lessons that apply here.
   - Verified against sources with web search. Each claim gets a provenance tag.
2. **Merge harness** (`spikes/merge-scenarios/`).
   - Two `PlanStore`s from `createPlanStore` (`src/commands/store.ts`), driven by the real commands (`dropCard`, the group and ungroup commands, rename, delete, link, value edits, import). Each store edits on its own, then the two exchange `Y.encodeStateAsUpdate`. The result is read with `readPlan`, and the layout with `layoutView` (`src/domain/view.ts`).
   - **Scenarios:**
     - same card dragged to two cells;
     - nest A in B while B is nested in A;
     - a group deleted while someone edits its child or adds a child;
     - one person renames while the other deletes;
     - concurrent inserts into one sequence gap;
     - an import or New blank plan made offline;
     - a value deleted while someone tags with it;
     - a link to a card someone else deleted;
     - two Alt-drops to different lanes;
     - one person undoes after a merge;
     - long-offline edits against a heavily edited board.
   - **Output:** a generated Markdown table in `merge-scenarios.md`, plus my reading of each surprise and the smallest fix. The fix candidates include last-writer-wins for single values (a timestamped write in place of lowest ID), the ADR 0004 tree repair, and `Y.Text` titles.
   - It has its own Vitest config, kept out of `npm run check` so changes to the app can't break a throwaway. Scenarios worth keeping become real tests in the build sprints.
3. **Relay and encrypted sync** (`spikes/relay/`, Go 1.24, which the container has; `spikes/sync-client/`).
   - **Relay:** WebSocket rooms keyed by a random ID. It forwards opaque frames, appends them to a per-room log on disk, and stores client-made encrypted snapshots, so compaction is a client's job. It has no Yjs code and no keys.
   - **Client:** a provider that wraps Yjs sync and awareness messages in AES-GCM (WebCrypto), with the key in the URL fragment.
   - **Measure:** catch-up after offline, both by replaying the log and from a snapshot plus its tail; the relay restarting; payload overhead; and catch-up time for the sample plan after 1,000 edits.
   - **Driven by Playwright:** two browser contexts against a local relay. It also checks that nothing in the relay's storage contains plain text from the plan.
   - **Write-up:** `relay-and-sync.md`, including what self-hosting in one container would take, and the public-demo options with their cost and abuse surface.
4. **Presence and attribution** (in the sync spike).
   - **Presence:** awareness carries the cursor, selection, the card being dragged and its target, and a name and color. It's encrypted like everything else.
   - **Attribution, three ways:** Yjs's own client IDs and `PermanentUserData`, an encrypted change log of our own, and diffing snapshots.
   - **Since you were away:** a prototype of the pure plan diff in `spikes/` (moved, added, removed, changed), the same function scenario compare will need. Measure what each attribution approach costs in document size.
   - **Write-up:** `presence-and-history.md`.
5. **UX design** (`ux.md`, plus a clickable mockup page, published as a private artifact).
   - **Presence:** cursors, selection outlines, a card held by someone else.
   - **Collisions:** what the losing person sees.
   - **Connection:** the states (live, reconnecting, offline with N changes not yet shared), and what reconnecting shows.
   - **History:** the inspector's history, and a change feed.
   - **Sharing:** the share flow, which turns a local plan into a shared one, and what import and file open do in a shared plan.
   - **Follow mode,** for one-driver sessions.
   - Each mockup states the question it answers and engineering's recommendation.
6. **Decisions and the plan.**
   - **Draft ADRs, Proposed:** sync protocol and relay; encryption and keys; presence; reconciliation and attribution. Amendments to 0004 (tree repair) and 0006 (single-value resolution, more than one board per browser).
   - **`questions.md`, Q58 on:** the offline posture, the collision policy, presence visibility, history retention, the public demo relay, and what replacing a board means when it's shared. Each has a recommendation.
   - **Requirements:** proposed changes to the M2 section, logged as questions rather than made silently.
   - **Build plan:** M2 in thin vertical slices across sprints 10 and later. The first is probably two tabs of one browser syncing with no server, then the relay.
   - **The PM's summary:** one page, `docs/research/collaboration/README.md`, with the recommendation, the decisions needed, and the risks.

## Engineering defaults (flag anything you'd veto)

- **Spikes are throwaway.** `spikes/` is excluded from lint, typecheck, the app build and CI. Each has a README with its run command, and nothing in `src/` imports it.
- **Spikes don't change app behavior.** If a spike shows a real bug in single-user code, it gets a separate small fix PR.
- **Go dependencies:** a WebSocket library (probably `nhooyr.io/websocket` or `gorilla/websocket`) for the spike only. No app runtime dependency is added this sprint.
- **The combined cold-start tester session** can run during this sprint. Nothing here changes the build it tests.

## Risks

- **Research sprawl.** The answers to the sprint's seven questions bound it. Prior art stops at what changes a decision.
- **Spikes looking like product.** Each spike's README and UI says "spike", and none deploys to Pages.
- **E2EE limits attribution.** With no accounts, "who" is a self-chosen name, and a malicious peer can claim anyone's. The docs say plainly what attribution can and can't promise.

## Verification

- `npm run check` and `npm run e2e` stay green on every PR. The app is unchanged.
- `spikes/merge-scenarios`: `npx vitest run --config spikes/merge-scenarios/vitest.config.ts` regenerates its table deterministically.
- `spikes/relay`: `go test ./...`, plus a Playwright script with two contexts that syncs, goes offline, reconnects, converges, and finds no plain text in the relay's storage.
- Every research doc is reread as a newcomer who knows only the repo, per the PM's preference for writing aimed at its reader.

## Session end

A three-line summary, as `CLAUDE.md` asks, plus the list of new questions for the PM.
