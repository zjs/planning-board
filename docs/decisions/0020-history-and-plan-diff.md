# 0020: History, and one plan diff

Status: Accepted (sprint 9). The product side is Q59 and Q63, answered on 2026-10-08: history is kept forever, with times normalized to each viewer's time zone. Measured in `docs/research/collaboration/relay-measurements.md`.

## Context

Requirements 23 and 31–32, and the PM's priority of knowing who changed what. Yjs records no lasting authors: `PermanentUserData` is experimental, and client IDs change every session. Yjs snapshots need garbage collection off, and say what changed, not who. Logging history into the board's own document tripled its size after 1,000 edits.

## Decision

- **A pure plan diff in `src/domain/`:** `planDiff(a, b)` returns cards added, deleted, renamed, moved between groups or sequence columns, and changed per property, plus links. It's tested like the rest of the domain. Three features use it:
  - scenario compare (requirement 23);
  - "since you were away";
  - history.
- **History is its own encrypted Yjs document per plan,** synced in the same relay room. After each command, the client appends one compact entry: who, when, and the changes as IDs and values, about 60 bytes. Entries are turned into words when they're shown.
- **Kept forever** (Q63). Nothing prunes it. The history document loads after the board, never before, so its size can't slow opening a plan, and its own snapshots keep catching up fast.
- **Times are instants in UTC,** never local times, and each viewer sees them in their own time zone. Beside the author's clock, each entry records the relay's receive time for the update that carried it (ADR 0017). Where the two disagree by more than a minute, the relay's time is shown, so a wrongly set laptop clock can't misdate history.
- **"Since you were away"** compares the board when you left with the board after catching up. It lists others' history entries since then, and your own changes the merged board doesn't show ("didn't stick"). It marks them on the board with scenario compare's markers.

## Alternatives

- **History inside the board's document.** It triples its size and can't be pruned on its own.
- **`PermanentUserData`, or Yjs snapshots.** Covered in the context above.
- **History kept by the relay.** It can't read.

## Consequences

- **The plan file never includes history.**
- **History grows without end,** at about 60 bytes per change: about 6 MB after 100,000 changes _(priors)_. If that ever matters, older entries can move to a snapshot of their own without being lost.
- **Attribution is a courtesy.** Names are self-chosen. Times are as good as the relay's clock, or the author's, when offline work has no relay time yet.
- **Scenario compare gets its diff and its markers built early,** as part of M2.

## Amendment: as built in sprint 13, slices 1 and 2

**The diff** is `planDiff(before, after, seen)` in `src/domain/diff.ts`. It reports:
- cards added, deleted and restored;
- renamed, described, and moved between groups or sequence columns;
- values changed per property;
- links made and removed;
- properties and their values added, renamed, moved or deleted.

It reports ids and values only, never words. A deleted group is one change, with the cards that went with it. A card that reappears is `restored` when `seen` says it existed before, as after an undo or a Restore. `describeChange` puts a change into words when it's shown, in today's names. `planChanges`, the cheap counter behind "7 changes not shared yet", stays as it is.

**The history document** (`src/store/history.ts`) holds two maps:
- `entries`: entry id → `{ v, id, by, name, at, via?, event?, changes }`. `by` is the stable per-browser id presence uses, and the author's color comes from it.
- `clocks`: person → how far the relay's clock is ahead of theirs.

**Recording** (`src/commands/history.ts`) listens for each transaction made by this person's commands, undos and redos, and diffs the plan before and after. Changes from the relay, other tabs, files and loop repairs aren't recorded, since whoever made them recorded them.

**Measured on the sample plan** (151 cards, 1,000 commands):
- about 1.4 ms per command;
- about 190 bytes per entry, not 60, partly because the sample's card ids are long. Kept forever, that's about 19 MB after 100,000 changes. It still loads after the board, never before. If it ever matters, entries can be compacted or moved to a snapshot of their own.

**Times:**
- The relay's receive time isn't stamped on each entry.
- Each acknowledged change tells the author how far the relay's clock is ahead of theirs. Once that's more than a minute, they write it to `clocks`, so their entries are shown corrected.
- Work done offline keeps the time it was done, which a receive time wouldn't.

**Where it lives:**
- A plan only on this computer keeps a `local` history.
- Sharing starts a `shared` history (Q73), with an opening "shared the plan" entry. The `local` one stays on the sharer's computer, read-only.
- On a relay, the `shared` history has a room of its own, `<room>_h`, with the same keys. That way the board's snapshots never drop its updates.
  - The history room is created by anyone with the edit link, so plans shared before this build gain one on first open.
  - Making new links retires both rooms. History carries on into the new ones.
- In a changes file, history fills the slot ADR 0022 left for it, sealed as kind `history-file`.
- History stays out of plan files, as decided.
