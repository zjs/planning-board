# Sprint 2

## Goal

Test the tool on real work. Can a PM take a Jira export and, in a few minutes, get a board they recognize as their own plan? Can they then pivot it by their own properties, such as team, and tidy the taxonomy (components, releases) on the board?

Sprints 0 and 1 showed that dragging, pivoting, grouping, and zooming work on a hand-written sample. The next user session should run on real work, because a synthetic plan can't tell us whether pivots and conflicts are useful. Dependency drawing and contention come in sprint 3, on top of the imported data.

Scope: single user, browser only, no server.

## Deliverables

### 1. Plan files (requirement 29, one scenario)

- [x] **File › Save plan to file** downloads the plan as a `.json` file in the ADR 0005 format.
- [x] **File › Open plan file…** replaces the board with a file's plan. It's undoable, and a bad file's problems are listed in plain words.
- [x] Cards can carry an optional Jira key, which is saved and opened with the plan.
- [x] Saving and then opening gives back the identical plan.

### 2. Custom properties (requirements 1, 26)

- [ ] A **Properties** panel lists the plan's properties. You can add a single- or multi-select property, rename it, and delete it. Custom properties are flat for now (Q25).
- [ ] The axis picker offers every property at every level, so a new property is an axis choice straight away.

### 3. Editing values (requirement 27)

- [ ] In the Properties panel, you can add, rename, reorder, and delete values, and rename levels.
- [ ] You can move a value to another parent: a component to another area, or a release to another quarter.
- [ ] Deleting a value that cards use moves those cards to its parent value, or to the holding lane if it has none (Q4). A notice with Undo says how many cards moved.

### 4. CSV import (requirement 28)

- [ ] **Import CSV** opens a dialog: pick a file, see its columns, and map each one to a field. Jira's usual headers are recognized automatically, including repeated columns such as Component/s.
- [ ] A preview shows the first rows as they'll be imported.
- [ ] A value table gives each Jira component an area, each version a quarter, and each story point value a size (Q27, Q28).
- [ ] Chosen columns, such as Team and Labels, become custom properties. Status, Priority, Sprint, and Assignee are off by default (Q29).
- [ ] Parents and epic links become groups. "Blocks" links become dependencies, kept but not drawn until sprint 3.
- [ ] An import replaces the board. It's one undo step, and every card keeps its Jira key (Q26).

### 5. Tester-ready

- [ ] A synthetic Jira export in `docs/samples/`, in Jira's CSV format.
- [ ] The legend and help cover saving, opening, importing, and the Properties panel.
- [ ] A demo note (`docs/demos/sprint-2.md`) and a session script built around importing the tester's own export.

## Deferred (don't build)

Dependency drawing and highlights (the gesture is settled, see Q24); contention; the conflicts panel and reviewed conflicts; scenarios; filters; saved views; re-importing or updating from Jira; hierarchical custom properties; showing card descriptions (they're imported and saved, just not displayed); the relay or any server.

## Exit criteria

Sprint 2 is done when the PM can open the latest `main` build and do all of the following:

1. Save the plan to a file, reset the board, open the file, and get the identical plan back.
2. Import the synthetic Jira export from `docs/samples/`: map its columns, give components areas and versions quarters, and import. Epics show as groups, story points as sizes, and every card carries its Jira key. The export's "Blocks" links are kept as dependencies.
3. Pivot Team × Time, where Team is a custom property the import created, and drag a card to another team.
4. Rename a component, move it to another area, add a release, and delete a release, whose cards move to its quarter (Q4). Undo each step.
5. Create a custom property from scratch, and fill it in by dragging cards in a view that uses it.
6. Reload without losing anything.
7. Import their own Jira export, in their own browser. This one is a manual check and isn't part of CI.

Then the PM runs a 20-minute session with one or two PMs or EMs on a plan imported from their own work. The questions are whether the board looks like their plan, and which pivots and fixes they reach for first. Feedback goes into `docs/questions.md` and drives sprint 3 planning.
