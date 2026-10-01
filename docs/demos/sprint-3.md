# Sprint 3 demo

Sprint 3 set out to test whether dependency links and order highlights make a plan's sequencing problems visible and worth arguing about, without turning the board into spaghetti.

## Get the build

The app is one HTML file, with nothing to install and no server.

- **Latest `main`:** https://zjs.github.io/planning-board/. Every merge to `main` publishes there. Each CI run also attaches the same file as the `planning-board-<commit>` artifact.
- **For testers:** send them the link, or the downloaded `index.html`.
- **The sample export:** `docs/samples/jira-export.csv` in the repo. It's synthetic, and carries 12 Blocks links.

Your board is saved in the browser you open it in. **File › Reset board** clears it, then **Load the sample plan** starts fresh. The walkthrough uses the sample plan's cards.

## Exit criteria walkthrough (about 10 minutes)

| Do this | You should see |
|---|---|
| **1.** Click *Credit notes*, ⇧-click *VAT OSS reporting*, and press **L**. | "Linked “Credit notes” → “VAT OSS reporting”". A curved line runs from the first card selected to the second, with the arrowhead at the dependent. |
| Press Esc, move the mouse away, then hover over either card. | The line shows only while one of them is hovered or selected (Q14). |
| Press **Undo**. | The link is gone. |
| **2.** Select *Custom roles* and press **L**. | A bar says "Linking from “Custom roles”: select the card it comes before, then press L." |
| Select *EU data residency*, click its child count ("4 ›"), select *Region-pinned directory sync* inside, and press **L**. | "Linked “Custom roles” → “Region-pinned directory sync”". The pending link survived the zoom. |
| Click **Plan** in the zoom bar and select *Custom roles*. | The line runs to *EU data residency*, the card on screen that holds the child (Q38). |
| **3.** Link *Custom roles* → *Least-privilege default role* (both in Identity's first column). Drag *Custom roles* to *Resource-level permissions*' column, further right. | The line turns red and stays drawn with nothing selected. Hovering over it explains: "“Custom roles” must come before “Least-privilege default role”, but it's to its right in the sequence." |
| Drag it back. | The highlight clears, and the line hides again. |
| **4.** Set **Columns → Time (release)**. Link *SSO session timeout policy* (27.4) → *TOTP enrollment rework* (27.3). | Red: the prerequisite ships a release later. |
| Set **Columns → Time**. | No red: both cards are in Q2, so at the quarter level the order isn't wrong (Q12). Set **Columns → Sequence** again. |
| **5 and 6.** Zoom into *EU data residency*, select *Region-pinned directory sync*, press **L**, go back to **Plan**, select *Custom roles*, and press **L**. | Both lines between *Custom roles* and the group turn red: they form a loop (Q37). The group's ⚠ count goes up by 2, and hovering over the ⚠ lists "… is part of a loop". Zoom in to see the card it hides. |
| **7.** Click the line from *EU data residency* to *Custom roles* and press **Delete**. | "Removed the link …". The other line is no longer red, since there's no loop any more, and the ⚠ count drops by 2. **Undo** brings it back. Pressing L again on a selected pair also removes a link. |
| **8.** **File › Import CSV…**, pick `jira-export.csv`, then **Next: values →** and **Import 53 cards**. Hover over *Zero-downtime index rebuild*. | Its Blocks link to *Typo-tolerant search* shows. Many Blocks links are inside an epic, so they show once you zoom into it. |
| **9.** Double-click a group's title. | It renames, groups included (Q36). The child count opens the group once the group is selected, and ⌘↓ still zooms. |
| In a sequence view, double-click the thin gap between two columns. | A new card in a new column. **Rows** is to the left of **Columns**. |
| **10.** Reload. | Nothing is lost. The undo history starts fresh after a reload. |

An automated test runs all ten steps on every build (`e2e/exit-criteria-3.spec.ts`).

## Known gaps

- **No conflicts panel yet.** Red lines and ⚠ counts are the only signal, and there's no way to mark one as reviewed or to hide a type. That's sprint 4 (requirements 19 and 20).
- **Links that leave a zoom aren't drawn.** Zoomed into a group, a link from one of its children to a card outside it doesn't show (Q38). The group's ⚠ count still flags problems.
- **Imported cards have no sequence** (Q30), so an imported plan shows red only in time views. Versions are "Not dated" by default (Q27). Give them quarters in the import's Values step, or nothing can be judged.
- **Ungrouping re-points a group's links at every child** (Q21). One link can become many.
- **Only time and sequence order count.** A view by size or team draws loops, but doesn't judge order.
- **No list of a card's dependencies.** It belongs in the card inspector (Q35, a sprint 4 candidate).
- **Browsers:** automated tests run in Chromium only. Firefox and Safari still need a manual check, and the line overlay is new there.
- **Input:** mouse or trackpad, plus the keyboard for L, or the toolbar's **Link** button.

## Open product questions

Each has a working default in this build (see [`docs/questions.md`](../questions.md)):

- **Q39:** hovering over a card shows its direct links, and selecting it shows its whole chain. L with three or more cards selected does nothing, and says why.
- **Q21:** ungrouping re-points links at every child. The session will tell whether that's noisy.
- **Q23:** a group's ⚠ count now includes dependency problems inside it, as well as mismatches. Watch whether it's too noisy.
- Still open from sprint 2: Q27–Q30. Sprint 4 candidates: Q32–Q35.

See [the session script](sprint-3-session.md).
