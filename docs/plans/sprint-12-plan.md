# Sprint 12: engineering plan

Status: **approved 2026-10-08; built 2026-10-08,** all six slices, slice 4 included. Scope is in `docs/sprint-12.md`. This doc covers how engineering delivers it.

## Context

Sprint 11 made sharing real: a relay, Can edit and Can view links, live edits, and offline work with the connection pill. But nobody can see anybody: two people on one plan see each other's edits, not each other. When two of them grab the same card, the later drop silently wins. There's no way to cut off an old link. And companies where no relay is allowed have no way in at all.

Sprint 12 is the M2 plan's third sprint (`docs/plans/m2-plan.md`): a live session should feel like a whiteboard, and collisions should be rare and recoverable. It covers:
- requirement 32, presence;
- requirement 31, collisions;
- requirement 33, revoking links;
- requirement 37's two fallbacks: hosting docs for (e), and changes by file for (f).

**The PM's answers (2026-10-08, this planning session):**
- **The driver is claimed by clicking.** Anyone clicks "I'm driving" in the avatar row. There's one driver at a time, and a new claim takes over. Everyone sees "Ada is driving". With nobody driving, "Driver only" shows no pointers.
- **Changes-file keys are sent separately.** "Share by file" makes the plan's key and gives a short Can edit link, sent once by a second channel. Files carry no key, so a forwarded or misfiled attachment is unreadable.

**What exploration found, which shapes the plan:**
- **The relay counts presence and plan updates against one limit** (50/s per connection). Presence at 20/s would take 40% of a writer's budget.
- **The relay's peer numbers change on every reconnect and in every tab.** Presence carries its own stable per-browser ID, so one person shows as one avatar.
- **Updates from the relay don't say who sent them.** A collision notice names the other person from presence.
- **Schema 2's single-valued properties are last-writer-wins registers** (ADR 0016). Multi-valued ones (areas) keep both drops. Undoing a value someone has since overwritten does nothing, so the loser's way back is a fresh drop, not undo.
- **The relay's sync record is kept per plan, not per room.** Making new links reuses the share path, so the record must reset when the room changes, or the old room's shadow would hide unsent changes.
- **A shared plan always needs a relay today** (`SharedPlan.relay`, and `openPlanStore` always builds a provider). File-only plans need it to be optional.
- **The maintenance pass** (read-only, in the background) found:
  - one thing to take: Go toolchain 1.27.1 → 1.27.2;
  - TypeScript 7 and `braces` still blocked;
  - CI actions all current, on node24;
  - no open issues.

## Slices

| # | Slice | You can do this afterwards |
|---|---|---|
| 0 | **Setup:** the maintenance fix, `docs/sprint-12.md`, this plan, Q71–Q72 for the PM's answers | Read the sprint doc. |
| 1 | **Presence** (ADR 0019, Q61, Q71, requirement 32) | See who's here and what they point at and select, even in another view. Claim driving. Quiet the cursors. |
| 2 | **Drag intent and collisions** (Q60, requirement 31) | See "Ada is moving this → Q3 · Billing". Be warned when you reach for the same card. Lose a race and get a way back. |
| 3 | **Make new links, and hosting docs** (Q62, Q64 e, requirement 33) | Revoke links: old ones turn read-only and say so. Run the relay on a server or a laptop from the docs. |
| 4 | **Changes by file** (Q64 f, Q72, requirement 37) | Share a plan by email or a shared drive, with no relay at all. |
| 5 | **Tester-ready, and the release pass** | Run the session script: three people live, one offline. Fixtures follow in the next PR. |

If the sprint runs long, slice 4 moves whole to sprint 13, where the history document it must carry is built (ADR 0017). It doesn't depend on slices 1–3.

## How each slice is built

### 0. Setup
- In `relay/go.mod`, `toolchain go1.27.2`.
- Record the maintenance pass under the backlog's Housekeeping › Done.
- Write `docs/sprint-12.md` and `docs/plans/sprint-12-plan.md`.
- Answer **Q71** (who drives) and **Q72** (how a changes file's key travels).
- Update `CLAUDE.md`'s current phase.

### 1. Presence

**Relay** (`relay.go`, `limits.go`, `main.go`, `PROTOCOL.md`)
- Presence gets its own limiter, 30/s with a burst of 60 (`-presence-rate`), so it can never slow down plan updates.
- Frames over 4 KiB are dropped silently.
- People with a view link send presence too: being present doesn't need write access.

**Domain** (`src/domain/presence.ts`, pure)
- `PeerState`, version 1:
  - `id`: stable per browser, kept in localStorage;
  - `name` and `color`;
  - `pointer`: `{item, fx, fy} | null`;
  - `selection`: up to 200 cards;
  - `drag`: `{item, label} | null`;
  - `drive`: a Lamport number, or null;
  - `dropped`: `{item, label, at} | null`, for slice 2.
- `currentDriver(peers, me)` picks the highest `(drive, id)`.
  - A claim is `maxSeen + 1`.
  - Stop driving, leaving, or 10 seconds of silence releases it.
  - Every browser works out the same driver from the same peers, with no server.
- `visiblePointers(peers, setting, driver)`.
- `people(peers)` groups by `id`, so a person's two tabs show as one avatar.
- `colorFor(id)` uses a palette kept apart from the area colors, each color with a name.

**Store** (`src/store/presence.ts`, plus `RelayProvider` handling `EphemeralOut` and `Left`)
- Messages are JSON, sealed with the plan's key (kind `presence`, already in `keys.ts`).
- Timing follows sprint 9's spike: sends throttled to 50 ms, a heartbeat every 3 seconds, and peers pruned after 10 seconds.
- On reconnecting, a browser sends its state again at once.

**Commands** (`src/commands/presence.ts`): the UI's way in.
- `watchPresence`, `setPointer`, `setSelection`, `setDrag`, `claimDriving`, `stopDriving`.
- `cursorSetting` and `setCursorSetting`, per browser.

**UI**
- `Avatars.tsx` sits beside the connection pill. It shows:
  - the avatars;
  - "Ada is driving";
  - the **I'm driving** toggle;
  - a cursor menu: Everyone, Driver only, None.
- `PresenceLayer.tsx` is an SVG beside `DependencyLines`, with the same redraw triggers and the same clipping under pinned headers.
  - A pointer goes on the first copy of its card on screen, at the same fractions.
  - A selection outlines every copy, in the person's color.
  - A card that's off screen, or inside a collapsed group, draws nothing (ADR 0019).
- The cursor setting quiets pointers only. Avatars and selections always show.
- Presence is viewer state, never in the plan's document.

### 2. Drag intent and collisions
- **While dragging,** a browser sends `drag: {item, label}`, where the label comes from `dropText` ("Q3 · Billing"). Other boards draw a dashed outline on every copy of the card, with "Ada is moving this → Q3 · Billing".
- **Reaching for the same card:** when someone else is already dragging it, the drag ghost adds "Ada is moving this too".
- **Collisions** (`src/commands/collisions.ts`, with `classifyCollision` pure in `src/domain/`):
  - `dropCard`, `dropCards` and `moveCards` return the keys they wrote.
  - `watchCollisions` remembers each drop for 10 seconds, and watches for a change from the relay that touches those keys. Changes from another tab are ignored, since they're the same person.
  - The other person is named from their `dropped` field, or from whoever was last seen dragging that card.
- **The later drop wins, and both people are told:**
  - The winner sees "Ben moved this too; yours stuck", with **Undo**. Ordinary undo restores Ben's value.
  - The loser sees "Ada moved this to Q4 after you", with **Put it back**. That's a fresh drop to their own target.
  - On a property that holds several values, both drops land. The notice says "It's in both lanes now", with **Keep only mine**.

### 3. Make new links, and hosting docs

**Relay**
- `room.json` gains `retired`, a time.
- A new `hello` flag, Retire (4), carries the room's write token. It marks the room retired and tells everyone connected.
- `synced` gains a trailing `retired` field.
- In a retired room:
  - writes get the new error 13, "This link was replaced";
  - presence isn't forwarded;
  - reads still work, so people keep what they saw;
  - creating it again is refused.
- A fixture of sprint 11's data folder checks that an older relay's rooms still open.

**Client**
- `renewLinks(id)`:
  1. remembers the old room in `SharedPlan.replaces`;
  2. shares again, making a new room and secret, as pending;
  3. uploads the board through the existing catch-up;
  4. once the relay confirms, retires the old room with a one-shot connection, then forgets `replaces`.

  A crash partway is retried on the next open.
- **The sync record** gains its `room`. A record for another room starts again from nothing.
- **People with old links:**
  - the pill and the read-only banner say "This link was replaced. Ask for the new one";
  - `ReadOnlyReason` gains `replaced`;
  - their board stays, and their unsent changes stay on their computer.
- **ShareDialog** gains **Make new links…**, behind a confirmation. It says old links stop working, and that people who had them keep what they already saw.

**Docs:** `docs/hosting.md`, linked from both READMEs.
- HTTPS behind Caddy or nginx, with the WebSocket upgrade and the origin check.
- A systemd unit and a compose file.
- Upgrades.
- Backup and restore. A restored room gets a new epoch, so boards send what it's missing.
- A pilot on a laptop: the same network, sleep, and moving to a server with "The relay moved?".

### 4. Changes by file (ADR 0022)
- **No relay needed:** `SharedPlan.relay` becomes optional; without one, the plan is shared by file. Its link is `#v=1&room=…&key=…&file=1`. Opening it before any file arrives makes an empty plan that says "Waiting for changes from whoever sent this link · Merge changes…".
- **The format** (`src/store/changesFile.ts`, binary `.pbchanges`):
  - a magic number and a version;
  - the room ID, so a file finds its plan;
  - the whole board, sealed with the plan's key (a new kind, `file`);
  - an empty slot for sprint 13's history.

  No name and no key appear in clear text.
- **Sending:** **File › Send changes** downloads `<plan>-changes-<date>.pbchanges`. It always holds the whole board.
- **Merging:** **File › Merge changes…**, or dropping a file on the board:
  - it finds the plan by room;
  - it unseals and applies the file outside undo, as changes from the relay are;
  - it says what changed, using `planChanges`: "Merged: 4 cards changed" or "Nothing new".
- **Edge cases:**
  - Merging is idempotent and order-free.
  - A file sealed for a replaced room says to ask for the new link.
  - Relay-shared plans can send and merge files too, and merged changes go on to the relay.
- **Share by file** gives the one short Can edit link, and says to send it once, another way.

### 5. Tester-ready
- `docs/demos/sprint-12.md`: a session script for three people live, and one working offline.
- Exit-criteria tests in `e2e/relay/` and `e2e/`.
- The cheat sheet and the README.
- The release pass, with fixtures in the next PR. These now include a v1 `.pbchanges` file.

## Engineering defaults (flag anything you'd veto)
- **Avatars and selections always show.** The cursor setting covers pointers only. The setting is per browser.
- **A driver claim reaches everyone within one heartbeat,** about 3 seconds. Two people claiming in the same second settle on one driver within that time.
- **Presence colors** come from the person's ID, and stay apart from the area colors.
- **A merged changes file isn't an undo step.** Undoing it would delete other people's work at the next send.
- **Old links are refused,** never upgraded to the new room.

## Risks
- **Collisions on multi-valued properties** are the least certain design. If time runs short, "It's in both lanes now · Keep only mine" ships without anything cleverer.
- **Presence across pivots** is new to everyone. Feel needs people, so the session matters.
- **Revoking reuses the share path,** which is safe only with the per-room sync record.
- **Size.** Slice 4 is the cut, and it moves whole to sprint 13 if needed.

## Verification
- **`npm run check`.** Unit tests cover:
  - presence: driver resolution, with ties, leaving and stale claims; the cursor filter; grouping by person; sealing; throttling and pruning, with fake timers;
  - `classifyCollision`, and crossed updates between two documents;
  - `renewLinks` retried after a crash, and the sync record resetting per room;
  - the changes-file format: round trip, the wrong room, the wrong key, a replaced room, and idempotent, order-free merging.
- **`go test -race ./relay/...`** covers:
  - the presence limiter and size cap;
  - viewers sending presence;
  - Retire with a wrong token;
  - error 13;
  - `synced` saying `retired`;
  - a retirement surviving a restart;
  - opening sprint 11's data fixture.
- **e2e, with several browser contexts:**
  - a pointer seen on the same card in another pivot;
  - outlines on every copy;
  - claiming and taking over driving;
  - "Driver only" with nobody driving;
  - leaving removes the avatar;
  - a drag race with both notices and both ways back;
  - revoking, with the old link read-only and the new link current;
  - changes files exchanged both ways, with no relay;
  - a file without its link refused.
- **By hand, from the demo note:** three browser profiles on one relay.

## Session end
A three-line summary, as `CLAUDE.md` asks.
