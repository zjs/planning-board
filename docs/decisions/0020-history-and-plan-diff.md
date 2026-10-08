# 0020: History, and one plan diff

Status: Proposed (sprint 9). The product side is Q59 and Q63. Measured in `docs/research/collaboration/relay-measurements.md`.

## Context

Requirements 23 and 31–32, and the PM's priority of knowing who changed what. Yjs records no lasting authors: `PermanentUserData` is experimental, and client IDs change every session. Yjs snapshots need garbage collection off, and say what changed, not who. Logging history into the board's own document tripled its size after 1,000 edits.

## Decision

- **A pure plan diff in `src/domain/`:** `planDiff(a, b)` returns cards added, deleted, renamed, moved between groups or sequence columns, and changed per property, plus links. It's tested like the rest of the domain. Three features use it:
  - scenario compare (requirement 23);
  - "since you were away";
  - history.
- **History is its own encrypted Yjs document per plan,** synced in the same relay room. After each command, the client appends one compact entry: who, when, and the changes as IDs and values, about 60 bytes. Entries are turned into words when they're shown. Any client prunes entries past the kept period (Q63).
- **"Since you were away"** compares the board when you left with the board after catching up. It lists others' history entries since then, and your own changes the merged board doesn't show ("didn't stick"). It marks them on the board with scenario compare's markers.

## Alternatives

- **History inside the board's document.** It triples its size and can't be pruned on its own.
- **`PermanentUserData`, or Yjs snapshots.** Covered in the context above.
- **History kept by the relay.** It can't read.

## Consequences

- **The plan file never includes history.**
- **Attribution is a courtesy.** Names are self-chosen, and times come from each person's clock.
- **Scenario compare gets its diff and its markers built early,** as part of M2.
