# Sprint 0

## Goal

Lay the foundations and test the riskiest assumption: that "drag writes values" feels good across pivoted views. Conflict logic is ordinary code; this interaction is the unknown.

Scope: single user, browser only, no server.

## Deliverables

### 1. Decision records (`docs/decisions/`)

Short ADRs (context, decision, alternatives, consequences), each readable without opening the code:

- [ ] Frontend framework and build tooling
- [ ] CRDT library (default: Yjs)
- [ ] Drag-and-drop approach
- [ ] Rendering approach (default: DOM/SVG)
- [ ] Scenario representation. Proposed: one Yjs document per scenario, diffed by item ID. Decide now, even though the scenario UI is deferred, because it shapes the data model.
- [ ] Plan file format, with a version field
- [ ] Group tree representation, and how it will stay cycle-free under concurrent moves in M2. Single-user cycle prevention is enough to implement now.

### 2. Domain core

- [ ] Types for items, built-in properties (sequence, dependencies, system, size, time), multi-valued properties, value hierarchies of any depth, and parent pointers.
- [ ] A view query: given X and Y properties at a hierarchy level, return cells plus a holding area. Multi-valued items appear once in each matching lane.
- [ ] Tests covering the view query, including multi-valued items, missing values, and items with no system values.
- [ ] _Stretch:_ conflict functions with tests (dependency order violations in sequence and time, component contention against a per-component limit with no limit by default, group/child mismatches). No UI yet.

### 3. Walking skeleton

- [ ] The board renders a view: lanes on Y, columns on X, and a holding area.
- [ ] An axis picker chooses X and Y from sequence, system (top level), size, and time (top level).
- [ ] Dragging a card into a cell sets both values; after re-pivoting, the card shows up where it should.
- [ ] A multi-valued card appears in each matching lane. Dragging one copy replaces only that lane's value. Dropping with a modifier key adds a value. Dragging a copy to the holding area removes only that value.
- [ ] Sequence views show no column numbers or labels (requirement 6).
- [ ] Group items render as a single card with a child count.
- [ ] Undo and redo work for every change.
- [ ] Reloading the page preserves the board.
- [ ] Every PR and merge to `main` produces a single-file HTML build as a CI artifact (Q5; replaces "deploys to a static URL" for now).

### 4. Seed data

- [ ] A synthetic but realistic plan of about 150 items: 3–4 areas, about 15 components, some items touching several components, dependency chains across areas, a few groups nested 2–3 deep, and sizes and quarters on only about half the items. The sparseness is deliberate (requirement 21).
- [ ] Stored as a plain JSON file, so the PM can swap in sanitized real data later.
- [ ] "Load sample plan" and "Reset" actions in the UI.

### 5. Repository basics

- [ ] Apache 2.0 `LICENSE`, and a `README` with a one-paragraph pitch and how to run it.
- [ ] CI running typecheck, lint, and tests.
- [ ] The Commands section of `CLAUDE.md` filled in.

## Deferred (don't build)

The relay or any server, the scenario UI, the custom property editor, CSV import, zooming into groups or deeper hierarchy levels, dependency-drawing UI, the conflicts panel, and the grouping UI.

## Exit criteria

Sprint 0 is done when the PM can open the latest `main` build, load the sample plan, pivot between sequence × system and time × system, drag cards and watch values change, and reload without losing anything.

Then the PM runs a 20-minute session with one or two PMs or EMs. Their feedback goes into `docs/questions.md` and drives sprint 1 planning.

## Demo note

At the end of the sprint, write `docs/demos/sprint-0.md`: where to get the build, what to click, what should happen, and known gaps.
