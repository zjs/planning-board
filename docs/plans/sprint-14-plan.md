# Sprint 14: engineering plan

Status: **approved 2026-10-15.** Scope is in `docs/sprint-14.md`. This doc covers how engineering delivers it.

## Context

M2's plan put "since you were away" in sprint 14, with the threat model (Q79) and the hosted demo relay (Q64 a) after it. The PM chose, in this planning session (2026-10-15):

- **Security first.** Sprint 14 is the threat model, keeping the operator out of the app's code, and the hosted demo relay. "Since you were away" moves to sprint 15, which makes M2 six sprints.
- **Q80 is decided after the threat model.** The written model lays out the options with evidence, and the PM answers Q80 mid-sprint, before slice 5.
- **Yes to a hosted demo relay.** Engineering writes everything; the PM creates the host account and runs the first deploy from written steps.
- **"Since you were away" will be a quiet offer** (for sprint 15): markers plus a notice with **Show**. The panel opens by itself only when one of your own changes didn't stick. Recorded now so sprint 15 starts settled.

**The maintenance pass** (2026-10-15), all read-only, recorded in slice 0:
- Dependabot: #93, @types/node 26.6.4 → 26.6.5. Merge it once CI is green.
- npm: TypeScript 7.0.2 is out, but typescript-eslint 8.71.2 still needs TypeScript below 6.1, so it's still blocked. `braces` is still 3.0.3, with no patched release.
- CI actions: all on current majors. Docker actions are SHA-pinned, and Dependabot keeps them current.
- Node 22 is still supported. The move to Node 26 is still set for after 2026-10-28.
- Issues: none open.

**What exploration found, which shapes the plan:**
- **The relay always serves the app** (`relay/main.go`, `GET /` → `serveApp(*static)`). There's no flag to turn that off.
- **The operator controls `/config`.** That's where the app learns which address to put in share links. The threat model has to cover what a hostile `/config` can do.
- **The relay never expires idle rooms.** Only kept segments expire. A public relay needs idle expiry (30 days, Q64 a).
- **Only the relay downloads are checksummed and attested** (`release.yml`). The app's HTML and the Pages build aren't.
- **Tools:** Java is in the container, and `tla2tools.jar` downloads from GitHub, so TLC runs locally and in CI. ProVerif isn't packaged here. It comes from opam or a pinned container image, which is decided in slice 1's ADR.
- **A small fix is still open** (backlog D): opening a share link never asks for a name, so you show as "S" to others.

## Slices

| # | Slice | You can do this afterwards |
|---|---|---|
| 0 | **Setup:** maintenance pass recorded, #93 merged, `docs/sprint-14.md`, this plan, the M2 plan reordered, Q80's status, plus the name-on-join fix | Open a share link and be asked your name. |
| 1 | **The written threat model** and ADR 0024 (tools) | Read, in plain words, what an operator can and can't do. Answer Q80 with the evidence in front of you. |
| 2 | **The protocol proof** (ProVerif or Tamarin), run in CI | See CI prove that the relay can't read a plan's content or forge a change, and see the one known limit stated as an expected attack. |
| 3 | **TLA+: the relay and its clients,** with offline work, crashes, reloads and restores, model-checked in CI | See CI check that everyone who reconnects converges, that no offline edit is lost, and that retired rooms and view links can't write. |
| 4 | **Loop repair in TLA+, and randomized schedules against the real code** | See CI check that concurrent nesting never leaves a cycle, and run hundreds of random offline and online schedules through the real app and relay. |
| 5 | **Keeping the operator out of the app** (Q80's answer) | Open the public build or a checked release file, and use a relay that serves no app. |
| 6 | **The hosted demo relay** | A stranger shares a plan from the public build with no setup. |
| 7 | **Tester-ready, and the release pass** (v0.14.0) | Run the demo. Fixtures follow in the next PR. |

Slices 2, 3 and 4 are independent of each other. Slice 5 waits for the PM's answer to Q80. Slice 6 needs slice 5's no-app mode, whatever Q80's answer is, because Q79 already settled that the hosted relay never serves the app.

**The PM widened the formal scope in planning (2026-10-15):** collaboration correctness, including offline work, and not only the operator. It's scoped to code we wrote. Yjs's own merging is assumed correct, as its authors argue _(recalled)_. It isn't verified here, so the specs model it abstractly, as a set of operations merged by union, and the threat model lists this as an assumption.

## How each slice is built

### 0. Setup
- **The backlog's Housekeeping:** the maintenance pass under Done, with the blocked items dated 2026-10-15.
- **#93:** merged after its CI passes and its self-review.
- **`docs/plans/m2-plan.md`:** sprint 14 becomes "the relay, made safe to host", and "since you were away" moves to sprint 15, with the quiet-offer default.
- **Questions:**
  - Q80 notes that it's held for the threat model.
  - Q59 gets a note on the quiet offer.
  - Theme M's and theme N's "Lands" lines are updated.
  - `CLAUDE.md`'s current phase is updated.
- **The name fix:** when you join from a share link with no name set, a one-field prompt asks for one (reusing the Share dialog's name field and `setMyName` from `src/commands/sharing.ts`). The prompt can be skipped. There's an e2e test, and backlog D's row is marked fixed.

### 1. The written threat model (`docs/security/threat-model.md`)
- **The attacker:** the relay's operator. They store, forward, drop, reorder and replay frames. They see the write token on every connection. They choose epochs, timestamps, `/config`, the origin check, retirement and backups. They may also serve the app. Also covered:
  - a network attacker, on http and on https;
  - someone holding a view link;
  - someone holding a forwarded changes file.
- **What's protected, and where it lives:**
  - card content, history and presence;
  - the keys `S`, `K` and `T` (ADR 0018), in the link fragment, in localStorage and in `.pbchanges` files;
  - the history room `<room>_h`, which uses the same keys.
- **The claims,** each tagged with how it's established: proved in slice 2, checked in slice 3, argued in prose, or an accepted limit.
  - The operator can never read content, from what the relay stores and forwards.
  - The operator can't forge or move a sealed message: the additional data binds room, kind and `upto`.
  - Write enforcement trusts the relay. This is a known limit, with Ed25519 signing as the fix if one is wanted.
  - Code served by the relay is out of the proof's reach. This feeds Q80.
  - Metadata is an accepted limit (Q79).
- **Findings** go in a table: each is fixed in this sprint, queued in the backlog, or accepted, with a reason. `/config` is examined first.
- **Q80** is rewritten from the model's findings, with costs, and goes to the PM.
- **ADR 0024:** the tools, and how CI runs them. ProVerif versus Tamarin is decided here, and so is how the tool is installed (pinned version, cached). Recommended: ProVerif, since its applied pi-calculus suits a fixed message flow and it runs in seconds _(recalled)_.
- **`SECURITY.md`** links to the model.

### 2. The protocol proof (`formal/proverif/`)
- **The model:** key derivation (`S` → `K` and `T`), sealing with the additional data, the relay as the network attacker plus `T`, view-link holders, and Make new links.
- **Queries:**
  - secrecy of content and of `K` against the operator;
  - correspondence: a client accepts an update for room *r* only if a holder of `K` sealed it for room *r* as an update, and the same for snapshots with their `upto`;
  - presence can't be passed off as an update.
- **The known limit is stated as an expected attack:** an operator who also holds a view link can write.
- **CI:** a third job, "Formal: protocol and relay", fails if any query's result changes.

### 3. TLA+: the relay and its clients (`formal/tla/Sync.tla`)
- **The relay side:** rooms, the numbered log, client snapshots with `upto`, compaction and kept segments, retirement, epochs and `-restored`. The level of detail follows `relay/PROTOCOL.md`.
- **The client side** (`src/store/relay.ts`):
  - the document;
  - the shadow, and the cursor saved with it;
  - pending local edits;
  - the resend after offline, `encodeStateAsUpdate(doc, stateVector(shadow))`;
  - uploading a snapshot;
  - the history room beside the board's.
- **The environment:**
  - clients go offline and come back, and keep editing while offline;
  - a tab crashes between saving the document and saving the cursor;
  - a plan reloads;
  - the relay restarts, or is restored from an older backup;
  - Make new links runs while someone is offline.
- **Invariants and properties:**
  - **convergence:** once everyone is back online and quiet, every client's document is the same;
  - **no offline edit is lost:** every local edit is eventually in the relay, or still pending on its computer, and never silently dropped;
  - **acknowledged edits stay:** no acknowledged update is lost to a client that later catches up, across compaction, restarts and restores;
  - **after a restore,** a client whose cursor is ahead resends what's missing;
  - **writes:** a retired room accepts none, and neither does a connection without the token;
  - **after Make new links,** an old-link client's unshared edits stay on its own computer, as the "Link replaced" banner says;
- **TLC** runs on small bounds in the "Formal" CI job. A real finding is fixed in `relay/` or `src/store/` in this slice, with a test that reproduces it.

### 4. Loop repair, and the real code under random schedules
- **`formal/tla/Tree.tla`:** concurrent moves with the stamps from loop repair (ADR 0004), applied in any order and any number of times. It checks:
  - **requirement 14:** the tree never has a cycle;
  - **convergence:** every client ends with the same parents;
  - no card is detached from the tree.
- **Randomized schedules** (`e2e/relay/schedules.spec.ts`, plus a fast in-process variant in `src/store/`): a seeded generator drives 2–3 clients against the real relay. It mixes edits, nests, deletes, going offline, reloads, relay restarts and a restore. After each schedule it checks the spec's properties on the real state:
  - every client's plan is equal;
  - every edit made offline is present, or superseded by a later one;
  - no cycles.
- **In CI and locally:** the in-process variant runs a few hundred seeds in `npm run check`, and the e2e variant a few dozen in CI. A failing seed prints itself, so it can be replayed.

### 5. Keeping the operator out of the app (shape set by Q80's answer)
Built whatever the answer:
- **A relay flag, `-serve-app=false`:** `GET /` gives a small page that names the public build and the release file, and never the app.
- **The app's HTML gets a checksum in `SHA256SUMS` and a build attestation,** in the release and the Pages deploy. Docs say how to check it.
- **Links name the app and the relay separately** wherever the app didn't come from the relay. The existing `&relay=` path covers most of this.

Added if the PM picks Q80 (a): it becomes the recommended way for every relay, with `docs/hosting.md`, the relay's README and the Share dialog wording to match. That includes opening the release HTML from disk for a laptop relay over http.

### 6. The hosted demo relay
- **On the relay:**
  - **idle expiry:** a room with no connection for 30 days is deleted (`-expire-idle`, off by default). `Sync.tla` gains it too, and checks that a room used within its window is never dropped;
  - public limits set as flags: rooms, bytes, share rate, and connection rate;
  - `-serve-app=false`;
  - a `/privacy` page.
- **The privacy note** says what the operator (the project) can see, which is the metadata, how long plans last, that there's no warranty, and what to do instead for confidential plans: self-host.
- **Deploy:** a config for one host, recorded in `docs/hosting-demo.md` with the steps the PM follows. The host is engineering's default, flagged below. The image is the one `release.yml` already publishes, pinned by version.
- **The app:** on the public build, Share offers the demo relay by default. It names the relay and links to the privacy note. "Use another relay" keeps today's address field.
- **The PM does:** creates the account, adds the deploy secret, and runs the first deploy. Engineering checks it from outside: Share from Pages, join from a second profile, and confirm that `/` serves no app.

### 7. Tester-ready
- `docs/demos/sprint-14.md`.
- e2e tests for the no-app mode and the join prompt. The relay tests cover idle expiry.
- The README, `SECURITY.md`, `hosting.md`, the relay's README, the cheat sheet, and `docs/releases/v0.14.0.md`.
- The release pass. Fixtures go in the next PR.

## Engineering defaults (flag anything you'd veto)
- **The host is Fly.io,** with one small machine and a volume, at about $5/month _(recalled)_. It runs the published image as is, and its TLS is automatic. The deploy doc stays generic enough for any container host.
- **The demo relay's address** is the host's default subdomain until you want a domain.
- **Demo limits:** 30 days idle, 5 MB per plan, 2,000 plans, and 10 new shared plans per hour per address.
- **The formal specs run in CI on every push** (seconds to a minute), so they can't drift from the code.
- **Signing updates (Ed25519)** to close "an operator holding a view link can write" is queued, not built, unless the threat model finds it matters for the demo.

## Risks
- **Getting ProVerif into CI** may take some fiddling (opam or an image). If it costs more than half a slice, the CI job runs it from a pinned container image.
- **The threat model may find something structural,** such as `/config` steering links. A fix that's small and in the relay or the app goes into this sprint; anything bigger goes back to you as a question before slice 6.
- **The formal work is now about three slices of seven.** If the specs run long, the hosted relay slips to sprint 15 rather than the specs being cut short. You'd hear before slice 6.
- **A spec proves the design, not the code.** The randomized schedules in slice 4 are the bridge. They find bugs only as well as the generator explores, so its coverage (which events, how often) is reported in the CI summary.
- **Running a public relay is ongoing work:** abuse, cost and uptime. Expiry and limits keep it small, and the privacy note sets expectations.

## Verification
- The randomized schedules: a few hundred seeds in `npm run check`, a few dozen against the real relay in e2e.
- `npm run check`, `cd relay && go test -race ./...`, and `npm run build && npm run e2e`, including `e2e/relay/`.
- The new CI job proves the ProVerif queries and runs TLC on the spec. A deliberately broken variant (additional data without the room) is checked locally to show the proof would catch it. In the same way, a broken resend (skipping the shadow) shows TLC and the randomized schedules both catching a lost offline edit.
- In a browser: join prompt. Relay with `-serve-app=false` from the release HTML. After deploy, Share from https://zjs.github.io/planning-board/ and join from a second profile.
- Self-review on each PR per `docs/self-review.md`, and screenshots for UI slices.
