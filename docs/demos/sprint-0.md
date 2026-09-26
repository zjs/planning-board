# Sprint 0 demo

What sprint 0 set out to test: does dragging a card into a cell, and then pivoting, feel like moving a sticky note rather than filling in a form?

## Get the build

The whole app is one HTML file, with nothing to install and no server.

- **Latest `main`:** repo → Actions → the newest **CI** run on `main` → Artifacts → `planning-board-<commit>`. Unzip it and open `index.html`.
- **For testers:** send them the unzipped `index.html` directly (email, chat). The artifact download needs a GitHub login.

Your board is saved in the browser you open it in, and all builds opened from disk share it (Chromium; see ADR 0006). **Reset** clears it.

## Exit criteria walkthrough (about 5 minutes)

| Do this | You should see |
|---|---|
| Open the file | "No plan yet", then the **How it works** panel once you click **Load sample plan**. About 150 roadmap items for a fictional B2B product line. |
| Look at **Sequence × System** | Four area rows, unlabeled columns, and cards roughly left to right in dependency order. Badges show size, time, and component. Cards missing a value wait in holding lanes pinned to the right edge ("No position": an area but no position), the bottom ("No area": a position but no area), and the corner (neither). |
| Drag a card to another cell | The cell highlights while you hover; the card lands with a blue flash, and its badges show the new values. |
| Drop a card in the gap between two columns | A new column opens there. Columns never get numbers. |
| Columns → **Time (quarter)** | The same cards, by quarter. The card you moved sits in its row, with its quarter unchanged. |
| Drag a card from a "No quarter" lane into a cell in another row | It gets that quarter and moves to that row, like any other drop. With ⌥/Alt held, it keeps its old row too (Q10). |
| Hold **⌥ Option / Alt** and drop a card in another row | "+ add" appears on the ghost, and the card now shows in both rows. |
| Drag a card from a cell to its row's "No quarter" lane, then to another column's "No area" lane | The first drop clears its quarter and keeps its area. The second sets the quarter and clears the area (Q11). The corner clears both. Hovering a holding lane never scrolls the board. |
| Click **Chips** in the top-right corner | Holding-lane cards shrink to one-line chips, so crowded lanes are easier to scan. **Cards** switches back. Your choice is remembered in this browser. |
| **⌘Z / Ctrl+Z** a few times, then **⇧⌘Z / Ctrl+Y** | Each drag undoes and redoes as one step. |
| Reload the page | Everything is where you left it. (Undo history starts fresh.) |

## Known gaps

- **Browsers:** automated tests run in Chromium only. Firefox and Safari have **not** been checked. Please open the file in whatever browser your testers will use before the session. If a browser won't save, a yellow banner says so and the board still works until reload.
- **Not built (by design):** creating or editing cards, grouping, zooming into groups, dependency lines, the conflicts panel, scenarios, custom properties, CSV import, save/open file. Conflict *rules* exist and are tested (`src/domain/conflicts.ts`) but aren't shown yet.
- **Input:** mouse or trackpad only. No touch, no keyboard dragging.
- **⌥/Alt-drag** is taken by some Linux window managers (ADR 0007). A Linux tester may not be able to add rows.
- **Card height:** badges make cards taller, so fewer fit on screen.

## Open product questions

Q1 and Q8–Q11 are answered in [`docs/questions.md`](../questions.md); the holding lanes (slice 5) are the Q10/Q11 answer. Q13 is new: a multi-area card dropped on "No area" keeps its other areas, so it lands in their rows instead. The tester session is the best source of answers; see [the session script](sprint-0-session.md).
