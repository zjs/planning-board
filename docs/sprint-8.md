# Sprint 8

## Goal

Polish the board before the combined cold-start session, which covers sprints 3–8.

The PM chose a short sprint (2026-10-07):
- three pieces of polish that need no tester input;
- the session next;
- conflicts in sprint 9.

The three pieces:

- **An expanded group shows as a frame** (Q57). Today an expanded group disappears, and its cards spread through the cells, each marked with a chip. A collapsed group already frames the cards that put it in a lane. Both kinds become frames, so a group looks the same however far it's open.
- **"Related to" links** (Q44). A link with no order, agreed on 2026-10-02 and pushed back four times since.
- **Calm.** The colored edge on every card isn't explained anywhere, and the holding lanes take about 40% of the screen.

Scope: single user, browser only, no server.

## Deliverables

### 1. Frames for expanded groups (Q57)

- [x] An expanded group is a frame in every cell its cards reach, holding lanes included. Each frame has a header with the group's name, and the group's cards in that cell sit under it.
- [x] In the group's own lanes, the header is the group's card itself, with its badges. It can be dragged, renamed and opened in the inspector.
- [x] The header's ▾ collapses the group.
- [x] Frames nest three deep. A group expanded below that shows inside the third frame, with a breadcrumb title ("API auth › Token rotation").
- [x] The parent chips and colored edges on expanded cards go away.

### 2. "Related to" links (Q44)

- [ ] Select two cards and press ⌥L to relate them, and ⌥L again to remove it. With one card selected, ⌥L starts a link to finish on another, as L does.
- [ ] Related links are dotted lines with no arrow. They show on hover and on selection, direct links only, and are never red or counted in ⚠.
- [ ] The inspector lists them under **Related**, beside Comes after and Comes before.
- [ ] A Jira CSV's "Relates" link columns import as related links.
- [ ] Plan files keep them. Older builds ignore them, and the file version stays 1 (ADR 0005).

### 3. Calm

- [ ] Each area's header shows its color, and a key in the view bar shows it in views without System. The cheat sheet explains the colored edge, and its tooltip names the area.
- [ ] Eight area colors, up from four, so a fifth area isn't gray.
- [ ] Each holding lane collapses to a thin rail that still shows its count and still takes drops. Each lane is remembered per browser, and both start open.

### 4. Tester-ready

- [ ] The combined session script covers sprints 3–8. It opens with the cold start, and it adds tasks for frames and related links.
- [ ] A demo note (`docs/demos/sprint-8.md`), and the release pass (`docs/housekeeping.md`).

## Deferred (don't build)

Each waits for a decision the session informs:
- sequence nested under time, as a Timeline view (Q56);
- reordering cards by hand within a cell (Q46 c);
- a command palette (Q54 b).

Also deferred:
- **To sprint 9:** component contention, the conflicts panel and reviewed conflicts (requirements 17–20), which bring quieter ⚠ markers (Q23).
- **Out of scope:** scenarios, filters, saved views, and the relay or any server.

## Exit criteria

Sprint 8 is done when the PM can open the latest `main` build and do all of the following:

1. In Roadmap, expand *Passwordless login*:
   - its stories sit under one frame per cell, with no chips;
   - its own quarter shows its header with its badges;
   - ▾ collapses it.
2. Expand an initiative, then an epic inside it, then a group inside that, and see frames nested three deep. A fourth level shows a breadcrumb title.
3. Select two cards and press ⌥L:
   - hovering either shows a dotted line with no arrow;
   - the inspector lists it under Related;
   - nothing turns red;
   - ⌥L again removes it, and ⌘Z brings it back.
4. Import a Jira CSV with a Relates column, and see the link.
5. In Roadmap, each area's header shows its color. In Sizing, the view bar's key shows it. The cheat sheet explains it.
6. Collapse "No quarter" to a rail, drop a card on it, and reload: it's still collapsed.
7. Open a plan file from sprint 7 and save it again, with nothing lost.

Then the PM runs the combined cold-start session (sprints 3–8). Feedback goes into `docs/backlog.md`. The session decides Q56, Q46 (c), the palette and Q23's default before sprint 9 is planned.
