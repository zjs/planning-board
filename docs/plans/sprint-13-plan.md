# Sprint 13: engineering plan

Status: **approved 2026-10-09; built 2026-10-09,** all six slices. Scope is in `docs/sprint-13.md`. This doc covers how engineering delivers it.

## Context

Sprints 10–12 made sharing work: live editing, presence, collisions, new links, changes by file. But nobody can find out who changed what. The PM's sprint 9 priority was "who changed what", and requirement 36 says every change is recorded with who and when, kept indefinitely, shown in each viewer's time zone, in an activity feed and in a card's history (Q63, ADR 0020). This is M2's fourth sprint (`docs/plans/m2-plan.md`). "Since you were away" (sprint 14) reuses the plan diff and the history built here.

**The PM's answers (2026-10-09, this planning session):**
- **No view link for plans shared by file** (Q72 stays as built).
- **History on a shared plan starts at the share.** Every plan records history. Sharing starts a new history with one opening entry, "Ada shared the plan". The drafting history before that stays on the sharer's computer only (Q73).
- **Bursts are grouped in Activity.** Consecutive changes by one person within 5 minutes form one row, such as "Ada made 30 changes, 10:40–10:45", which opens to show each change (Q74).

**What exploration found, which shapes the plan:**
- **Every local command goes through one private choke point,** `edit()` in `src/commands/store.ts`, with `LOCAL_ORIGIN`. Undo and redo skip it, and their origin is the UndoManager itself. The spike recorded history on `afterTransaction` filtered on those two origins, and the plan uses the same hook.
- **The relay's protocol has no sub-documents.** A room is one update log plus one snapshot, and snapshots drop the updates they cover after 30 days. History updates mixed into the board's room would be lost to newcomers once a board snapshot covers them. **So history gets a room of its own,** derived from the board's (`<room>_h`), and syncs with a second `RelayProvider`. It reuses everything the provider already does: shadow, cursor, catch-up, offline, snapshots and loop-free resends. The relay doesn't change.
- **Deletes are tombstones** (schema 2), so Restore means un-deleting, which is exact and cheap.
- **`planChanges()` only counts.** The real diff, `planDiff`, is in the spike (`spikes/sync-client/diff.ts`), and slice 1 moves it into `src/domain/`, as the M2 plan says.
- **The relay's receive time (`at`) is read and then discarded** on updates, acks and snapshots. History needs it.
- **No time formatting helper exists.**
- **The maintenance pass (background, read-only) found nothing to take:**
  - TypeScript 7 and `braces` are still blocked;
  - CI actions, Go and its WebSocket library, and @noble are current;
  - the Node 26 move still waits for 2026-10-28;
  - there are no open issues.

## Slices

| # | Slice | You can do this afterwards |
|---|---|---|
| 0 | **Setup:** the maintenance pass recorded, `docs/sprint-13.md`, this plan, Q72's note, Q73–Q74 for the PM's answers | Read the sprint doc. |
| 1 | **The plan diff, and times** (ADR 0020) | Nothing visible on its own: tested domain code. |
| 2 | **The history document:** recorded, persisted, in sync across tabs, the relay and changes files | Nothing visible yet, but every change from here on is recorded. |
| 3 | **Activity:** a feed for the whole plan, by day, filterable by person, bursts grouped, Restore on deletions | See what happened this week, and restore a deleted group. |
| 4 | **A card's history** in the inspector, and "last changed by" | See who moved this card to Q3, and when. |
| 5 | **Tester-ready, and the release pass** | Run the demo. Fixtures follow in the next PR. |

## How each slice is built

### 0. Setup
- In the backlog's Housekeeping:
  - record the maintenance pass under Done;
  - date the blocked notes: TypeScript 7 and `braces`, still blocked on 2026-10-09.
- Fix `CLAUDE.md`'s current phase: sprint 12's fixtures are merged (#81), and sprint 13 is under way.
- Q72 gets the PM's note: no view link for file sharing. Q73 (pre-share history) and Q74 (bursts) are recorded as answered.
- Write `docs/sprint-13.md` and `docs/plans/sprint-13-plan.md`.

### 1. The plan diff, and times (`src/domain/`, pure, unit-tested)

**`planDiff(before, after): Change[]`,** moved and hardened from the spike. The changes it reports:
- `added`
- `deleted`, with the title and the ids of everything deleted with it
- `restored`
- `renamed`, with the old and new titles
- `values`, per property, before and after
- `group`, from one group to another
- `sequence`
- `linked` and `unlinked`, for dependencies and related links
- `property`, for a value added, renamed or deleted

It's all ids and values, never words. `planChanges` is rebuilt on top of it, so the counts don't change (existing tests).

**Other domain code:**
- **`describeChange(change, plan)`** turns a change into words at display time ("moved *Tax engine* to Q3 · Billing"). It uses today's names, and the title a deleted card had.
- **`src/domain/time.ts`:**
  - `formatWhen(at, now, timeZone?)`: "10:42", "Yesterday 16:05", "8 Oct";
  - `dayKey(at, timeZone)`: for grouping by day;
  - both use `Intl.DateTimeFormat` in the viewer's time zone, and times are stored as UTC instants.
- **`groupBursts(entries, gapMs = 5 min)`.**

### 2. The history document (ADR 0020, amended)

**Store** (`src/store/history.ts`):
- History is a `Y.Doc` per plan: a `Y.Map` of entries by id, plus a `Y.Map` of relay stamps.
- It's persisted in its own IndexedDB database, `…:history:<id>:<local|shared>`, and synced across tabs with the existing `syncTabs`.
- It loads after the board, never before.

**An entry** (version 1), about 60–100 bytes:
`{ v, id, by, name, color, at, via?: 'undo'|'redo', changes: Change[] }`
- `by` is the stable per-browser id, `myPresenceId()`.
- `at` is the author's clock, in UTC milliseconds.

**Recording** (`src/commands/history.ts`, `watchHistory`):
- It listens on `afterTransaction` for `LOCAL_ORIGIN` or the UndoManager.
- It diffs the plan it last saw against the new one, and appends one entry. The history document is separate from the board, so recording is never an undo step.
- Merges from files, the relay, other tabs and loop repairs are never recorded as yours.
- `deleteItems` needs no change: the diff sees the tombstones.

**Sharing** (Q73):
- An unshared plan records into its `local` history.
- `startSharing` and `startSharingByFile` switch the plan to a fresh `shared` history, which starts with "Ada shared the plan". The `local` one stays on this computer, and Activity shows it to its owner under "Before sharing · only on this computer".
- Joiners only ever have `shared`.

**Sync through the relay:**
- A second `RelayProvider` runs on `<room>_h`, with the same keys. The room is bound into each message's additional data, so nothing crosses between the two.
- Whoever shares creates both rooms. For plans shared before this build, the first person with the edit link to open them creates the history room, since repeating a create with the same token is harmless. A view link that finds no history room yet shows no history, and nothing fails.
- `retireRoom` and `renewLinks` cover both rooms. History carries on into the new room: same team, same history.
- The relay doesn't change. `docs/hosting.md` notes that each shared plan counts as two rooms against `-max-rooms`.

**Relay times:**
- The provider reports each ack's `at`.
- After its own entries are acknowledged, the author writes their stamps (entry id → relay time) into the stamps map, at most once a second, so the times survive snapshots and files.
- Shown: the relay's time, if it differs from the author's clock by more than a minute; otherwise the author's.

**Changes files:**
- The empty history slot now carries the `shared` history, sealed as a new kind, `history-file`.
- Merging applies it too.
- A v1 file with an empty slot still merges. The fixture from #81 checks this.

**Not recorded:** changes from builds older than this one carry no entries. Activity can't name them, and the ADR says so.

### 3. Activity
- **Where:**
  - an **Activity** toolbar button beside Inspect and Properties, opening a third side panel (`panel` gains `'activity'` in `App.tsx`);
  - also in File and the avatar menu;
  - the toolbar must still fit one row at 1180 wide. If it doesn't, the button moves into the avatar menu and File only.
- **Contents:**
  - grouped by day in your time zone ("Today", "Yesterday", then dates), newest first;
  - a person filter, built from the entries' authors;
  - bursts as rows that open;
  - "(undo)" marks an undo.
- **Each change:**
  - clicking it shows the card on the board, the same as the inspector's "Show it on the board";
  - **Restore** on a deletion un-deletes the card and everything deleted with it, as one undo step, recorded as "restored".
- **The footnote:** "Names are the ones people chose. History is kept forever, and times are shown in your time zone."
- **On a plan that isn't shared:** the same panel, showing your own history.

### 4. A card's history
- **The inspector** gains a **History** section after Links, for one selected card: its entries, newest first, in the same words as Activity.
- **"Last changed by Ada, 10:42"** goes under the title in the inspector, and in the card's tooltip on hover. There's no new badge on the board.

### 5. Tester-ready
- `docs/demos/sprint-13.md`.
- Exit-criteria tests: e2e for Activity and a card's history across two people on a relay, Restore, and Activity on an unshared plan.
- The cheat sheet, the README, and the release pass.
- Fixtures go in the next PR: a history document, and a changes file with history.

## Engineering defaults (flag anything you'd veto)
- **An entry is one command:** a multi-card drag is one entry, listing every card.
- **Undo and redo are entries of their own,** marked "(undo)". Nothing is struck out, since others may have seen the change.
- **Restore is only for deletions.** Reverting other changes waits for "since you were away" (sprint 14), which has "Use mine".
- **History never leaves in a plan file** (ADR 0020). Only changes files and the relay carry it.

## Risks
- **The second connection per plan** doubles WebSockets and rooms. It's cheap at our scale (measured in sprint 9: an idle room costs almost nothing), but the hosting doc says it.
- **Diffing after every command** costs a `readPlan` per transaction. That's fine for a few hundred cards _(priors)_. It's measured in slice 2 on the sample plus 1,000 edits, and incremental if it shows.
- **Plans shared before this build** have no shared history until an editor opens them with this build. It's said in the demo note.

## Verification
- **`npm run check`.** Unit tests cover:
  - `planDiff`: every kind, undo, groups and copies;
  - `describeChange`;
  - times in two time zones, across a day boundary;
  - grouping bursts;
  - recording: local commands only, undo marked, merges not attributed;
  - two documents syncing through a fake relay, with stamps;
  - pre-share history not uploaded;
  - Restore;
  - changes files with and without history.
- **`go test -race ./relay/...`** stays unchanged and green.
- **e2e:**
  - two browsers on a relay: Ada moves and deletes cards, Bo's Activity names Ada and the times, Bo restores a deleted group, and the card's History shows each change;
  - a burst of drags groups into one row;
  - an unshared plan's Activity;
  - the toolbar still fits at 1180.
- **By hand, from the demo note:** two profiles in different time zones (Chrome's sensors panel), to see the times shift.

## Session end
A three-line summary, as `CLAUDE.md` asks.
