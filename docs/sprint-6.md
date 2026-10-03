# Sprint 6

## Goal

Find any card on a 150-card board by typing, without losing your place.

During a demo on 2026-10-03, a viewer asked to press **/** and type to narrow the board. Pressing **/** to search is a common web-app convention: Gmail, GitHub, Linear and Jira all use it. Whiteboards such as Miro dim what doesn't match rather than hide it. The PM chose dimming, matching on card text only, and shipping it before the combined tester session, so testers on a real import have it (Q50, ADR 0014).

This is *find*, not *filter*. Nothing is hidden and the layout doesn't change. Hiding stays with requirement 9's filters, which remain deferred.

Scope: single user, browser only, no server.

## Deliverables

### 1. Find (Q50)

- [x] **/** opens a find bar under the toolbar from anywhere on the board, outside a text field. A magnifier button beside **?** does the same.
- [x] Matching runs live as you type, and ignores case and accents. Every word typed must start a word in the card's title, Jira key or description, so "sso pay" finds *SSO for payments admin*, and "sso" doesn't find *Second payment processor*.
- [x] The bar shows a count: "7 cards", or "7 cards · 2 inside folded groups".

### 2. Dimming

- [x] Cards that don't match dim, and a hovered card comes forward. Dimmed cards still drag, select and edit.
- [x] A folded group with matches inside stays bright, with a "2 inside" pill that lists them on hover.
- [x] Red lines between two dimmed cards dim with them.

### 3. Acting on matches

- [x] **Enter** selects every match, expanding the groups that hide some of them, the way "Show it on the board" does. The keyboard goes back to the board, so E, L and I act on the matches.
- [x] **↓ / ↑** shows the next or previous match: it's expanded if needed, selected, flashed and scrolled into view.

### 4. Stopping

- [x] **Esc** in the bar stops finding, and so does **Done**. On the board, Esc stops finding after it has cancelled a pending link and cleared the selection.
- [x] With words typed, the bar stays open while you click and drag cards. An empty bar closes when you click away.
- [x] The words typed survive pivots, folds and expands. They're gone after a reload.

### 5. Tester-ready

- [x] The legend lists **/**.
- [ ] A demo note (`docs/demos/sprint-6.md`).
- [ ] A row in the combined session script, which now covers sprints 3–6: "Find every card about SSO, then expand them." It watches whether people press **/** or ⌘F.
- [ ] The release pass (`docs/housekeeping.md`).

## Deferred (don't build)

- Hiding non-matches (requirement 9's filters).
- Matching on values, and `key:value` syntax. ⇧-click on a badge (Q47) selects by value.
- Claiming ⌘F. The browser's find still works on titles you can see.
- Saving a query.
- The old sprint 6 candidates, now sprint 7's: "related to" links (Q44), order within a cell (Q46), dragging several cards (Q48), and contention with the conflicts panel (Q40, Q41).

## Exit criteria

Sprint 6 is done when the PM can open the latest `main` build and do all of the following:

1. Press **/**, type "sso": only the SSO cards stay bright, the count says how many, and *Second payment processor* stays dim.
2. In Time × System, type "webauthn": *Passwordless login* shows "1 inside". Press Enter: it expands, and *WebAuthn enrollment* is selected.
3. Press ↓ and ↑ to step through the SSO cards, each scrolled into view.
4. With "sso" typed, pivot Rows to Time: the find stays, and the same cards stay bright.
5. Click a match and press L: a link starts. Esc cancels it, Esc again clears the selection, and Esc a third time stops finding.
6. Typing in the find bar never triggers board shortcuts.

Then the PM runs the combined sprint 3–6 session. Feedback goes into `docs/backlog.md`.
