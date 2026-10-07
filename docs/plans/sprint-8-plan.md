# Sprint 8: engineering plan

Status: **approved 2026-10-07.** Scope is in `docs/sprint-8.md`. This doc covers how engineering delivers it. The review process is unchanged from sprint 0 (`docs/plans/sprint-0-plan.md`, "Quality and review process").

## What this sprint has to prove

- An expanded group reads as one thing: its cards sit together under its name, its own values stay on the board, and it collapses from the board.
- Two cards can be related without implying an order.
- A first-time visitor can tell what the colored edge means, and can get the holding lanes out of the way.

## Slices

| # | Slice | You can do this afterwards |
|---|---|---|
| 1 | **Frames for expanded groups** (Q57) | Expand *Passwordless login*. Its stories sit together in each cell, under a frame with its name, and the header's ▾ collapses it. No chips. |
| 2 | **"Related to" links** (Q44) | Select two cards and press ⌥L. Hovering either shows a dotted line with no arrow, and the inspector lists it under Related. It's never red. |
| 3 | **Calm: the area color, and holding lanes that collapse** | See what the colored edge means from the board itself. Collapse "No quarter" to a thin rail that still takes drops. |
| 4 | **Tester-ready, and the release pass** | Run the combined session (sprints 3–8) from the script. The exit-criteria e2e passes. |

## How each slice is built

1. **Frames.**
   - **Layout.** `viewItems` (`src/domain/view.ts`) stops replacing an expanded group with its children. Instead, `layoutView` wraps each group's shown cards in a frame, a `CardRef` with `open: true` and `inner`, in every cell or holding lane they reach. Frames inside frames give nesting.
   - **Frames below the third level** carry a breadcrumb `trail`.
   - **Placement and order.** Cards keep their own placement. A frame sorts where its first card would (sequence, then rank).
   - **The header** is the group's own card in its own lanes, and a one-line title elsewhere.
   - **Removed:** `CardRef.parent` and the tones.
   - **Collapse** reads a card's group from the plan.
   - **Other code that reads frames:**
     - dependency endpoints (cards in an open frame are on screen);
     - copy lines;
     - selection and box select;
     - find.
   - **Tests:** the e2e `card()` helper excludes only collapsed frames, and the chip assertions become frame assertions.
   - **ADRs:** an amendment to ADR 0008, and a note on 0013.
2. **Related links.**
   - **Fixture first:** `sprint-8-before-related`.
   - **Model and storage:**
     - `Plan.related` holds `{ a, b }` pairs with the ids sorted.
     - It's stored in a Yjs map `related`, in the undo scope.
     - Plan files get a `related` list, sorted. The file version stays 1, and ADR 0005 gets an amendment, which also corrects its line 83.
   - **Commands:** `addRelated` and `removeRelated`. Delete drops a card's related links, and ungroup re-points them at each child, deduplicated, as Q21 does for dependencies.
   - **Gesture:** ⌥L matches `e.code === 'KeyL'`, because ⌥L types "¬" on a Mac.
   - **Drawing:** a `related` tone in `DependencyLines.tsx`: dotted, no arrow, and direct links only.
   - **Elsewhere:** the inspector's Related list, the card menu, and the cheat sheet.
   - **CSV import** reads the "Outward/Inward issue link (Relates)" columns. The sample plan and the sample export gain a few related links.
3. **Calm.**
   - **The area color:**
     - a color bar on each area's header;
     - a key in the view bar when System isn't an axis;
     - a cheat sheet line, and a tooltip on the edge;
     - eight palette slots (`--area-0..7`), cycling after that.
   - **Holding lanes:**
     - a «/» toggle on each lane's head;
     - collapsed, a lane is a 32px rail with its name and count, and keeps its `data-drop` targets;
     - remembered per browser, in `planning-board:holding-collapsed`, beside the Cards/Chips choice;
     - no toggle on a board with no rows or columns.
4. **Release.**
   - The session script covers sprints 3–8.
   - A demo note, the exit-criteria e2e, the README, backlog and questions.
   - Fixtures for the sprint's last commit, in the next PR.

## Engineering defaults (my call; flag anything you'd veto)

- **Frames wrap cards wherever they land,** holding lanes included. The header is the group's own card only in its own lanes.
- **Related links on ungroup** are re-pointed at each child, as dependencies are (Q21).
- **⌥L with one card selected** starts a pending related link, like L.
- **The area color stays**, and the board explains it, rather than dropping it.
- **Holding lanes start open**, and each collapses per browser. Collapsing by default is a call for after the session.

## Risks I'm tracking

- **Frames reach holding lanes and nest.** It's the biggest layout change since ADR 0013, so the view tests come first. The 15 or so chip assertions become frame assertions in the same PR.
- **Repeated headers take vertical space.** A header is one line outside the group's own lanes. If boards get too tall, the fallback is showing the header only on the first frame in each row.
- **⌥ already means "add" on a drop.** ⌥L is a key, not a drop, so the two don't collide, but the cheat sheet covers both.

## What I need from you

1. The combined cold-start session (sprints 3–8), with someone who hasn't seen the board.
2. After it: calls on Q56 (a Timeline view), Q46 (c) (reordering within a cell), the command palette, and Q23 (marker noise), before sprint 9 is planned.
