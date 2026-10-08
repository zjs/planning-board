# Sprint 11: engineering plan

Status: **approved 2026-10-08.** Scope is in `docs/sprint-11.md`. This doc covers how engineering delivers it.

## Context

Sprint 10 laid M2's foundations: schema 2, several plans per browser, and two tabs in step. Sprint 11 is the M2 plan's second sprint (`docs/plans/m2-plan.md`): two people on two computers share a plan, end-to-end encrypted, and either can go offline and come back. It covers:
- requirement 30, share links;
- requirement 31, the live sync underneath;
- requirement 33, edit and view links (revoking is sprint 12);
- requirement 35, the connection pill;
- requirement 37, the relay on a laptop;
- requirement 14, loop repair.

ADRs 0017 (relay and sync), 0018 (keys and links) and 0004 (loop repair) are Accepted. Sprint 9's spike relay (`spikes/relay`, Go) and client (`spikes/sync-client`) proved the model on the real board.

**The PM's answers (2026-10-08, this planning session):**
- **Share turns the plan you're on into the shared plan,** marked as shared in File › Your plans, with no copy beside it. This supersedes artboard 7's "makes a shared copy", which assumed one board per browser.
- **Binaries and a container.** CI builds the relay, with the app inside, for Mac, Linux and Windows, as downloads. A container image is published on each merge to `main`.
- **Builds the relay doesn't serve ask for a relay.** The relay serves the app, and links point at the relay's address. Opened anywhere else (Pages, a file), Share asks once for a relay address and remembers it.

**What the research and a design review turned up, which shapes the plan:**
- **The spike client no longer fits.** Sprint 10 changed `persistence.ts`, so the client is ported into `src/store/`.
- **The spike relay is missing what ADR 0017 requires:** write tokens, an origin check, limits, receive times, binary frames, and 30 days of kept log segments. It also creates a room directory for any request.
- **WebCrypto only works in a secure context** _(recalled)_. A laptop pilot is opened over plain `http://192.168.x.x`, so encryption uses audited pure-JS code (`@noble/ciphers`, `@noble/hashes`).
- **An https page can't open `ws://` to another machine** _(recalled)_. From Pages, the relay must be `https` or `localhost`.
- **Browser storage is kept per address.** A plan made on Pages isn't there when the app is opened from the relay.
- **Every build on `main` deploys.** So link and ciphertext formats are fixed from the first build that can share. They carry a version from day one.
- **Loop repair has to ship before sharing.** Otherwise rooms mix builds that stamp moves with builds that don't, and repairs choose wrongly.

## Slices

| # | Slice | You can do this afterwards |
|---|---|---|
| 0 | **Setup:** the maintenance pass's fixes; `docs/sprint-11.md` and this plan; the PM's three answers (Q68–Q70) | Read the sprint doc. |
| 1 | **The relay, for real** (ADR 0017) | Download the relay for your computer, run it, and open the address it prints: the board, served by your own relay. |
| 2 | **Loop repair** (ADR 0004, requirement 14) | Nothing visible yet. Two tabs nesting cards inside each other's at once leave one nest, not two loose cards. |
| 3 | **Share and join** (ADR 0018, Q62, Q58, requirements 30 and 33). Hidden behind a switch until slice 4, so Pages never offers sharing without the pill | With the switch on: share a plan, and open its Can edit or Can view link on another computer. Edits show up on both. |
| 4 | **The connection pill, and offline** (Q59, requirement 35). The switch goes | Go offline, keep working ("Offline · 7 changes not shared yet"), come back, and both boards converge. |
| 5 | **Tester-ready, and the release pass** | Run the demo note on two computers. Sprint 11's fixtures follow in the next PR. |

## How each slice is built

### 0. Setup, and the maintenance pass

The pass ran read-only in the background. **To take:**
- vite 8.3.3 → 8.3.4, a patch.
- **The backlog's Node item, reworded.** Node 24 enters maintenance on 2026-10-20, and Node 26 becomes Active LTS on 2026-10-28 (verified in nodejs/Release). So CI and `CLAUDE.md` skip to Node 26 after 2026-10-28, well before Node 22's end of life on 2027-04-30.
- The pass recorded under Housekeeping › Done.

**Unchanged:** TypeScript 7 is still blocked (typescript-eslint 8.71.1 requires TypeScript below 6.1), `braces` still has no patched release, CI actions are current (all node24), and there are no open issues.

**Records:**
- Q68–Q70, answered.
- A note on artboard 7 in `ux.md`.
- `docs/sprint-11.md`, this plan, and `CLAUDE.md`'s current phase.

### 1. The relay, for real

**Where it lives:** `relay/` (module `github.com/zjs/planning-board/relay`), grown from `spikes/relay/relay.go`. It declares Go 1.26, and CI builds with 1.27.x; the spike's 1.24 is out of support.

**Kept from the spike:**
- the log and snapshot per room, with an fsync before each acknowledgement;
- atomic snapshot swaps, and recovery from a torn last line;
- per-room ordering, and dropping slow peers;
- room ID validation.

**Added:**
- **A versioned binary protocol** (`relay/PROTOCOL.md`).
  - `hello` carries the protocol version, the write token (or none), and the cursor. An outdated relay answers "your relay is out of date".
  - Frames: a type byte, then varint-prefixed fields.
  - Presence (`ephemeral`) and `left` are defined now, so sprint 12 needs no protocol change.
  - `hello` can ask for a full replay from kept segments, for a snapshot that won't decrypt.
- **Rooms are created explicitly.** `create` stores the write token's hash and a random **epoch** in `room.json`. It's idempotent when the hash matches. A `hello` for an unknown room never creates anything: it answers "unknown room".
- **Write tokens.** Hashes are compared in constant time. Without the token, `update` and `snapshot` frames are refused with an error frame, and the connection can still read.
- **Receive times.** `at` is kept beside each sequence number and sent with each update. History uses it in sprint 13 (ADR 0020).
- **Compacted segments are kept for 30 days** (`log-<upto>.seg`), outside the room's quota.
- **The origin check,** comparing hosts so a TLS proxy doesn't break it. Allowed by default:
  - the relay's own host, or `-public-url`;
  - `null` (a file);
  - `zjs.github.io`.

  `-allow-origin` adds others. It isn't a security boundary: writes need the token. ADR 0017 says so.
- **Limits, each a flag:**
  - messages, 4 MB;
  - each room, 200 MB;
  - all data, 2 GB;
  - 1,000 rooms;
  - per-address connection and room-creation rates;
  - updates per second per connection.

  The public relay's tighter numbers come in sprint 14.
- **Serves the app.** `go:embed web/` holds a committed `placeholder.html` and a gitignored `index.html`, which CI copies from `dist/`. `index.html` is sent with `Cache-Control: no-cache`.
- **A pilot on a laptop (Q64 e).**
  - It listens on `:8787` and keeps `planning-board-data/` next to the binary.
  - It prints `On this computer: http://localhost:8787 · On your network: http://192.168.1.23:8787`.
  - `/config` tells the app the relay's public address, so links never say `localhost` when there's a better one.

**Tests:** Go tests over `httptest`. The spike's five, plus:
- write tokens, and refusing view-only writes;
- room creation, idempotency, and unknown rooms;
- epochs;
- origin rules;
- each limit;
- receive times;
- segment retention;
- frame round trips and version refusal.

**CI and release:**
- **`ci.yml` gains a `relay` job:** `setup-go`, `go vet`, `go test -race`. After the web build, it cross-compiles with `CGO_ENABLED=0 -trimpath` for `darwin/arm64`, `darwin/amd64`, `linux/amd64`, `linux/arm64` and `windows/amd64`.
- **`release.yml`, after CI passes on `main`** (`workflow_run`):
  - updates a rolling **`relay-latest` prerelease** with tar.gz and zip downloads, which work without a GitHub login and keep the executable bit;
  - pushes a multi-arch container to `ghcr.io/zjs/planning-board`, built from those binaries on distroless `:nonroot`, with `/data` as a volume and the `org.opencontainers.image.source` label.

  `pages.yml` moves to the same gating, so `main` deploys only after CI passes.
- **`relay/README.md`:** running it, `chmod +x`, Mac's `xattr -d com.apple.quarantine`, and Windows' firewall prompt.

**ADR 0017 amendment:** the protocol, defaults, limits, data layout and epochs. Plus the threat model: when the relay serves the app over plain http, it protects what's stored, not the network or the operator, who could serve altered code. That's why links can name the app and the relay separately (slice 3), for sprint 14's public relay.

### 2. Loop repair

ADR 0004 as designed, before any build can share.

**Writing:** items gain `previousParent` and `moveStamp` (a Lamport counter, then the client ID). `moveToParent`, `groupItems` and `ungroupItems` set both.

**A pure domain function** (`src/domain/tree.ts`) finds parent loops, over deleted items too, so a restore can't bring one back:
- it repeats until none remain;
- in each loop, the highest stamp loses, with unstamped cards ordered by ID;
- the losing card goes back to `previousParent`, or to the top level if that loops or is missing;
- a `previousParent` that's deleted hides the card with it, as any card under a deleted group is hidden (ADR 0016).

**Repairs** write `parent` only, outside undo, and only from a client that can write. In this slice, that's after a tab update; in slice 3, after the relay says the client is caught up. Two clients writing the same repair converge, because the values are identical.

**Tests:**
- L8 in `merge.test.ts` expects one nest.
- A property test: no loop survives random concurrent nesting, and every client agrees.
- Tests pin undo after a repair: undoing the original move is a visible no-op, and redo is repaired again.
- Values (`moveValue`) are checked for the same problem.

**Format:** a compatibility fixture from the commit before the change (ADR 0005). The keys are optional, so schema 2 stays and plan files are unchanged.

### 3. Share and join (behind a switch)

**Keys and encryption (`src/store/keys.ts`; ADR 0018, amended):**
- **Derivation.** A 32-byte secret `S`. HKDF-SHA256 gives the encryption key `K` ("enc") and the write token `T` ("write"). A view link holder can't derive `T`.
- **Encryption.** **XChaCha20-Poly1305** (`@noble/ciphers`), which takes random 192-bit nonces safely for the life of a room. It replaces AES-GCM, whose 96-bit nonces run short for a long-lived room with presence traffic.
- **Additional data:** `version | room | kind`, plus `upto` for snapshots. So the relay can't relabel presence as an update, or pass off an old snapshot as new.
- **Links:**
  - edit: `<app>/#v=1&room=<id>&key=<S>`
  - view: `<app>/#v=1&room=<id>&view=<K>`
  - `&relay=<url>` is added when the app's address isn't the relay's.
- **ADR 0018 states:**
  - Write enforcement trusts the relay. It sees `T`, and an operator who also holds a view link could write.
  - Replaying old updates is harmless.
  - Withholding updates only stops sync.
  - Signing updates (Ed25519) stays possible behind the version byte, if a public relay needs it.

**The provider (`src/store/relay.ts`),** ported from the spike's `EncryptedProvider`:
- binary frames, and its own `RELAY_ORIGIN`;
- forwards only updates whose origin isn't the relay or another tab;
- jittered reconnects, and snapshots every 200 updates;
- no stored "unsent" flag. On every `synced`, it sends `doc` minus the shadow if they differ.
- **The shadow and cursor** are saved as one record in `planning-board:v2:sync:<id>`, which goes when the plan is deleted.
  - If two tabs overwrite each other's, an older record only means fetching again.
  - On open, if the plan's document lacks something the shadow has, the shadow and cursor reset.
  - A changed **epoch**, or a relay behind the cursor, also resets them and uploads everything. An unknown room offers to create it again from this copy.

**Read-only, in one place:**
- `PlanStore` carries `readOnly`, which every write path checks: commands, `startPlan`, `ensureBuiltIns`, repairs, `namePlan`, undo and redo.
- A refused command returns a reason the UI can show.
- View-only clients never write built-ins, repairs, names or snapshots.
- On a shared plan, the document's name is the authority. `show()` never writes it before the first sync.

**Plans and links (`src/commands/plans.ts`, `App.tsx`):**
- `PlanEntry` gains `shared: { relay, room, secret?, viewKey, pending? }`. ADR 0018 records that keys are kept in localStorage, beside the plan already held unencrypted in IndexedDB. It also notes that every `file://` page, and every site under `zjs.github.io`, shares one store.
- **The hash is read once,** synchronously, before start-up, so `showHash` can't overwrite a link first.
- **Matching:**
  - plans match on relay and room together;
  - a view link where the edit link is held is a no-op, with a notice;
  - an edit link upgrades a view-only plan, after checking that `K` comes from `S`;
  - keys that don't match are refused, never overwritten.
- **The key leaves the address bar** as soon as it's saved. It stays when the plan list fell back to memory, so a reload doesn't lose it.
- **An address of `#plan=<id>`** for a plan this browser doesn't have says: "This link is for a plan on another computer. Ask for its share link."
- **Shared plans are never replaced** as an "untouched empty plan" (ADR 0021's rule).
- **A plan shared in another tab** connects here too, on the plan list's `storage` event.

**The Share dialog** (toolbar **Share** and **File › Share…**):
1. **Your name,** once per browser (Q61). It's shown as a chip in the toolbar on shared plans.
2. **The relay.**
   - Opened from a relay, it uses that relay's public address, with a warning if that's `localhost`.
   - Opened elsewhere, it asks for an address. It explains why it must be `https` or `localhost`, and remembers it.
   - "Open the app from your relay instead" first offers to save the plan to a file, since each address keeps its own plans.
   - A shared plan's relay address can be edited, for a laptop whose network address changed.
3. **Share** saves the keys as pending, creates the room, and uploads the plan through the normal catch-up path. A crash part-way through leaves nothing orphaned. A plan over the message limit gets a clear error.
4. **Can edit and Can view links,** each with Copy (selecting the text where the clipboard isn't allowed), and "The relay never sees your plan". A shared plan opens straight to its links; a view-only plan shows only the view link.

**View-only plans:** the board doesn't start drags or edits, and editing actions are disabled, with the reason as their tooltip.

**Replace this shared plan from a file… (Q58).** On a shared plan, File gains it. A warning says everyone with the link will see the file's plan instead, and that it's one undo step for you.

**Deleting a shared plan** removes it from this browser only. If this browser holds its only edit link, the notice says edit access goes with it.

**A plan written by a newer build** opens view-only, saying why, rather than writing what it doesn't understand. Plans record their writer's version in `meta`.

**The switch:** `localStorage['planning-board:feature:share'] = '1'`. Tests and the PM's preview turn it on; slice 4 removes it.

### 4. The connection pill, and offline

**The pill sits beside the plan name, on shared plans only (artboards 4 and 5):**

| State | It says |
|---|---|
| Live | **Live** |
| Reconnecting, after 3 seconds | **Reconnecting…** |
| Offline | **Offline · 7 changes not shared yet** |
| Offline for an hour, or with many changes | Louder: "Others may be changing the same cards" |
| A view link | **View only** |
| The relay refused a write (room full, too fast) | **Not saved on the relay**, with the reason |
| Unreachable, with nothing local | **Can't reach the relay** |

**"Changes not shared yet"** is counted from the document's difference from the shadow, as the cards it touches. So it's right across tabs, undo and repairs, and survives a reload.

**Offline is always allowed (Q59).** Reconnecting sends one catch-up update. The switch from slice 3 goes.

### 5. Tester-ready

- **`docs/demos/sprint-11.md`:** download the relay from `relay-latest`, and use two computers, or two browser profiles.
- **An exit-criteria test** in a second Playwright project (`e2e/relay/`). Its `webServer` runs the relay CI just built, on a fixed port with `-static dist`, and it uses two browser contexts. Locally it's skipped without Go; in CI it must run.
- **The README:** "Run your own relay", a quick start. The full hosting docs come in sprint 12.
- **The cheat sheet and the release pass.**

## Engineering defaults (flag anything you'd veto)

- **Names** are self-chosen and kept per browser, with no color until presence (sprint 12).
- **Revoking** ("Make new links") and the retired-room flag stay in sprint 12, as the M2 plan has them.
- **Default limits:** 4 MB per message, 200 MB per room, 2 GB in all and 1,000 rooms. Generous for a self-hosted relay.
- **Downloads** come from a rolling `relay-latest` prerelease. The container is public on GHCR, like the repo.
- **Pages deploys only after CI passes,** which matches "main is always deployable".

## Risks

- **Go 1.26+ locally.** The container has 1.24.7. The first commit checks that `GOTOOLCHAIN=auto` fetches 1.27 through the proxy; if not, local builds use 1.24 and CI builds with 1.27.
- **GHCR and releases** need Actions to be allowed to write packages and contents. If refused, the PM flips one setting. The first GHCR image may need its visibility set to public, once.
- **Unsigned Mac binaries** trip Gatekeeper. The README gives the workaround; signing is later.
- **Size.** It's five slices, and the review added real work. If it runs long, the louder offline state, replacing a shared plan, and the relay-refused pill state move to sprint 12.

## Verification

- **`npm run check`.** Unit tests cover:
  - keys, derivation and additional data;
  - frames and versions;
  - the provider against a fake socket: catch-up, shadow reset on a lagging relay or a new epoch, the unshared count, and view-only refusal;
  - read-only on every write path;
  - loop repair, with its property test;
  - the plan list's `shared` field and link matching.
- **`go test -race ./relay/...`** passes in CI.
- **`npm run e2e`.** The `file://` suite as today, and the relay project:
  - share, and join by edit and view link;
  - live edits;
  - offline, then converging (a route closes the WebSocket);
  - replacing a shared plan;
  - a relay restarted with a wiped room;
  - a check that the relay's data holds no card titles.
- **The merge harness** is rerun with loop repair, and L8's result is noted in slice 2's PR.
- **By hand, from the demo note:** download a binary, run it, and share between two browser profiles.

