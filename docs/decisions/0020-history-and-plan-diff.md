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
