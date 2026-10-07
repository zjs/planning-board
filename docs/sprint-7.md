# Sprint 7

## Goal

A board that explains itself to someone who arrives with no demo.

The PM chose to optimize for new users who find the board from a public link or by word of mouth (2026-10-07). An expert review (`docs/reviews/2026-10-07-ux-assessment.md`) found three things standing in their way:

- pivoting, the core bet, is neither visible nor animated;
- help is a 30-entry manual that opens over the board;
- a blank plan stalls after the brain dump, because there's nowhere on the board to make areas.

This sprint shows the pivot, teaches by doing, and puts every action somewhere it can be found. It also takes the journey one step further, from a rough sequence into a timeline: cards keep their order, and a run of them can be dragged into a quarter at once.

Scope: single user, browser only, no server.

## Deliverables

### 1. Views and visible pivots (Q52)

- [x] A view bar above the board, with one-click views:
  - **Sequence** (Sequence × System);
  - **Roadmap** (Time × System);
  - **Sizing** (Size × Level);
  - **Structure** (Level × System).
- [x] Rows, Columns, ⇄ and Fold all / Unfold all move into the view bar, so the toolbar fits on one row at 1280px.
- [x] When the view changes, cards glide to their new places, unless the browser asks for reduced motion.
- [x] The sample plan opens on Roadmap.

### 2. Edit values from the headers (Q55)

- [x] Double-click a row, column or band header to rename it.
- [x] "+ Add area" (or quarter, component, size, team…) adds a value, named as it's added. It sits under each holding lane's name ("No area", "No quarter"), which stays pinned to the board's edge, and under each area's own "No component" lane. The field stays open for the next one, and adding inside a folded area unfolds it.
- [x] On a blank plan, "+ Add area" sits where the rows will be, and the empty message points to it.

### 3. Drags that say what they do; Expand and Collapse (Q54)

- [ ] A dragged card says what the drop will set: "→ Q2 2027 · Billing".
- [ ] On a multi-value axis, the dragged card says "Alt adds instead".
- [ ] Groups **Expand** and **Collapse**, and bands **Fold** and **Unfold**. No word is shared.

### 4. Card menu (Q54)

- [ ] Right-click a card, or click its "⋯", for every action on it, each with its key.

### 5. From a sequence to a timeline (Q46, Q48)

- [ ] Cards in one cell keep sequence order, then the order they were made in, instead of title order.
- [ ] Drag across empty space to box-select cards, in cells and holding lanes.
- [ ] Dragging any selected card moves the whole selection, in one undo step.

### 6. Guided start (Q53)

- [ ] **Start a blank plan** is the empty board's primary button, and it starts a short guide: dump ideas, make an area, sort into it, see another view, and group. Each step is checked off by doing it, and the guide can be skipped.
- [ ] Help becomes a cheat sheet grouped by goal, and stops opening by itself.
- [ ] Two one-time hints: "Alt adds instead" while dragging, and "Press E to see what's inside" on first selecting a group.

### 7. Tester-ready

- [ ] The session script starts with five minutes of cold start on the public link, before any demo.
- [ ] A demo note (`docs/demos/sprint-7.md`), and the release pass (`docs/housekeeping.md`).

## Deferred (don't build)

- Sequence nested under time, as a Timeline view (Q56): a sprint 8 candidate, judged after the cold-start session.
- Reordering cards by hand within a cell (Q46 c).
- A command palette (Q54 b).
- Moving and deleting values from the headers; the Properties panel keeps those.
- The calm items: explaining the area color, quieter mismatch markers, and collapsible holding lanes. They go with the conflicts panel (Q23).
- "Related to" links (Q44), and component contention with the conflicts panel (Q40, Q41).
- Scenarios, filters, saved views, and the relay or any server.

## Exit criteria

Sprint 7 is done when the PM can open the latest `main` build in a fresh browser and do all of the following:

1. See **Start a blank plan** first. Follow the guide to the end without opening help: five ideas typed, an area made from the header, ideas dragged into it, a card sized in Sizing, and one card put inside another.
2. Type three ideas in a column and see them stay in typing order.
3. Load the sample: it opens on Roadmap. Click Sequence, then Roadmap, and watch the cards move.
4. In Roadmap, box-select three cards in "No quarter" and drag them onto Q1. All three land there, and one undo puts them back.
5. Double-click a quarter's header and rename it. Click "+ Add quarter" and name a new one.
6. While dragging, see where the card will go. Right-click a card and see its actions and keys.
7. Find no "Fold" on a group, and no "Expand" on a band.
8. At 1280×720, the toolbar fits on one row.

Then the PM runs a cold-start session with someone who hasn't seen the board. Feedback goes into `docs/backlog.md`.
