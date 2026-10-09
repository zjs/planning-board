# Sprint 13

## Goal

Anyone can find out who changed what, and when, in their own time zone (`docs/plans/m2-plan.md`, sprint 13; requirement 36, Q63, ADR 0020).

- **The plan diff** (ADR 0020): one diff in `src/domain/`, which history uses now and "since you were away" and scenario compare use later.
- **History** (requirement 36): every change is recorded with who and when, in a document of its own beside the board, kept forever, synced through the relay and changes files.
- **Activity:** a feed for the whole plan, by day, filterable by person, with Restore on deletions.
- **A card's history** in the inspector, and "last changed by".

The PM's answers (2026-10-09):
- **History on a shared plan starts at the share** (Q73). The drafting before it stays on the sharer's computer.
- **Bursts are grouped** (Q74): one person's changes within 5 minutes of each other are one row that opens.
- **No view link for plans shared by file** (Q72).

The engineering plan is `docs/plans/sprint-13-plan.md`.

## Deliverables

### 1. The plan diff, and times (ADR 0020)

- [x] `planDiff` in `src/domain/`: cards added, deleted, restored, renamed, moved between groups or sequence columns, changed per property, and links, all as ids and values.
- [x] Changes in words, times in each viewer's time zone, and bursts grouped.

### 2. History (ADR 0020, Q63, Q73)

- [ ] Every local change and undo is recorded, in a history document per plan, kept forever.
- [ ] It syncs across tabs, through the relay in a room of its own, and in changes files. Times use the relay's clock where the author's is off by more than a minute.
- [ ] Sharing starts a new history; what came before stays on the sharer's computer.

### 3. Activity (Q74)

- [ ] A feed for the whole plan: by day, newest first, filterable by person, with bursts grouped, and a footnote on what attribution means.
- [ ] Clicking a change shows the card; Restore brings back a deleted card and everything deleted with it.

### 4. A card's history

- [ ] A History section in the inspector, and "Last changed by" under the title and in the card's tooltip.

### 5. Tester-ready

- [ ] A demo note (`docs/demos/sprint-13.md`), exit-criteria tests, the cheat sheet, the README, and the release pass.

## Deferred (don't build)

- **Since you were away,** and the hosted demo relay: sprint 14.
- **Reverting changes other than deletions:** "Use mine" comes with since you were away.
- **History in plan files:** never (ADR 0020).

## Exit criteria

Sprint 13 is done when the PM can do all of the following with the latest `main`, on a relay with two browser profiles:

1. Move, rename and delete cards in one profile. In the other, open Activity: each change is there, named for its author, at a time in this profile's time zone.
2. Filter Activity to one person. A burst of drags shows as one row that opens.
3. Restore a deleted group from Activity: it's back, with everything inside it, on both boards.
4. Select a card: the inspector says who changed it last, and its History lists each change.
5. On a plan that isn't shared, Activity shows your own changes. Share it: the others see history from the share on, starting with "shared the plan".
6. Send changes by file to someone with the link: their Activity shows your changes too.
