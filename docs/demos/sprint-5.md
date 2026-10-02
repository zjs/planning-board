# Sprint 5 demo

Sprint 4 left five overlapping ways to look deeper into a plan. Moving a card between groups took a zoom and a breadcrumb, and a card in several lanes was easy to lose. Sprint 5 cleans that up before anything new is added:

- **Looking deeper** is now expand and fold: groups expand in place, and bands fold. Zoom is gone.
- **Moving cards between groups** is a drag: hold a card over a group to put it inside, or drop it on the strip at the top to take it out.
- **A card's copies** are joined by dashed lines when you point at one.
- **Saved plans:** every plan file and browser board from sprints 0–4 is opened on every build, so nothing you saved can quietly stop opening.

## Get the build

The app is one HTML file, with nothing to install and no server.

- **Latest `main`:** https://zjs.github.io/planning-board/. Every merge to `main` publishes there. Each CI run also attaches the same file, unzipped, as `planning-board-<commit>.html`.
- **For testers:** send them the link, or the downloaded `index.html`.

Your board is saved in the browser you open it in. **File › Reset board**, then **Load the sample plan**, starts fresh. If your browser last showed "System (component)", System opens with its areas unfolded. **Fold all** brings it back to areas.

## Exit criteria walkthrough (about 15 minutes)

| Do this | You should see |
|---|---|
| **1.** **File › Open plan file…** with a plan you saved from an earlier build, then **File › Save plan to file**. | It opens with every card, group and link, and the saved file has them all. CI opens a file and a browser board from every past sprint on every build (ADR 0005). Then load the sample plan again. |
| **2.** Select *EU data residency* and press **E**. Then select *Regional pipeline shards*, now on the board with an "EU data residency" chip, and press **E** again. | Both stay expanded: the epic's stories show with a "Regional pipeline shards" chip, and the rest of EU's cards keep theirs. Before this sprint, the second E folded the initiative. |
| Select *EU kafka cluster* and press **⇧E** (or **Fold**). | Only *Regional pipeline shards* folds back. Fold the rest the same way. |
| **3.** ⇧-click the **Initiative** badge on any card. | "Selected 3 cards with Initiative". It works in any pivot, because the badge is there whenever Level isn't an axis; with Level as rows, ⇧-click the row header instead. |
| Press **E**. | All three initiatives expand at once. |
| **4.** Drag *Custom roles* over *Passwordless login* and hold still. | After half a second the epic gets a dashed outline, and the dragged card says "Put inside "Passwordless login"". Drop it: it goes inside, and its size and area are unchanged. **Undo** in the notice puts it back. |
| Drag a card across other cards and drop without pausing. | It lands in the cell, as before. |
| **5.** With *Passwordless login* expanded, start dragging *WebAuthn enrollment*. | A "Move out of "Passwordless login"" strip appears at the top of the board. Drop there: the card moves up a level and keeps its place. |
| **6.** Select a card, press **I**, and type "pass" in the inspector's **Group** field. Pick *Passwordless login*. | The card moves inside it. "Move to the top level" takes it out again. |
| Select a card with nothing inside, and click **Add a card inside**. | The card expands, a new card appears in its place with a chip, and its title is ready to type. |
| **7.** Look for zoom. | There isn't any: no zoom bar, no **Zoom in**, and ⌘↓ does nothing. **Rows** lists System once. It starts folded, one lane per area, each saying "4 components ▸". |
| Click **Unfold all**, then **Fold all**, beside Rows. Then click "4 components ▸" in the Identity row. | All areas open into components, then close again. Then only Identity opens. Pivot to **Columns → Time** for the same with quarters and releases. |
| **8.** Hover *Seat sync from directory* (Identity and Billing), then *Tenant data deletion (GDPR)* (three areas). | Dashed gray lines with no arrow join each card's copies, every copy is outlined, and both of Seat sync's links show. Select one, and the copies stay joined until **Esc**. |
| **9.** Reload. | Nothing is lost: the plan, Identity unfolded and the other areas folded, and the expanded groups. |

An automated test runs all nine criteria on every build (`e2e/exit-criteria-5.spec.ts`).

## What changed that you might trip over

- **New cards:** a card made by double-clicking empty space is always at the top level. Add children with **Add a card inside**, by holding a card over a group, or with the inspector's Group field.
- **Highlights follow folding:** with Time folded to quarters, two releases in the same quarter are never flagged against each other. Unfold the quarter and they are (Q12).
- **Folded headers:** a folded axis spends two header columns, the area's band and then "4 components ▸".
- **Enter on a faded group copy** now renames the group, at its own copy. Without zoom, every group has one on the board.

## Known gaps

- **Hold to nest** only reaches cards on screen. The Group field covers the rest.
- **Copies:** each dependency is still drawn once, from the copy nearest its other end. The dashed lines show whose link it is.
- **No conflicts panel yet.** That's sprint 6's candidate, with "related to" links (Q44).
- **Browsers:** automated tests run in Chromium only. Firefox and Safari still need a manual check.

## Open product questions

Each has a working default in this build (see [`docs/questions.md`](../questions.md)):

- **Q42 and Q43 (answered):** expand and fold replace zoom. The session checks whether anyone misses zoom.
- **Hold to nest:** is half a second right? Too short nests by accident; too long feels unresponsive.
- **Q45 (answered):** copies show on hover. Watch whether people find a card's other copies and links.
- **Q23:** watch whether ⚠ markers add noise. It matters more now that a whole plan expands at once.
- **Still open from sprints 3 and 4:** Q21, Q33, Q35 and Q39.

See [the session script](sprint-5-session.md). It covers sprints 3, 4 and 5 in one session.
