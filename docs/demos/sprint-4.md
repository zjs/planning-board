# Sprint 4 demo

Sprint 4 set out to test whether the board can show a plan's structure, not just its items:
- Can people tell an initiative from a story?
- Can they sort in two stages, by area and then by component?
- Can they see which children make up a group?
- Can they do all of this without pivoting just to edit one card?

## Get the build

The app is one HTML file, with nothing to install and no server.

- **Latest `main`:** https://zjs.github.io/planning-board/. Every merge to `main` publishes there. Each CI run also attaches the same file as the `planning-board-<commit>` artifact.
- **For testers:** send them the link, or the downloaded `index.html`.
- **The sample export:** `docs/samples/jira-export.csv` in the repo. It's synthetic, and its Issue Type column has epics and stories.

Your board is saved in the browser you open it in. **File › Reset board**, then **Load the sample plan**, starts fresh. Expanded groups, collapsed bands and the zoom are remembered per browser too, so a fresh start may need **Plan** in the zoom bar.

## Exit criteria walkthrough (about 15 minutes)

| Do this | You should see |
|---|---|
| **1.** Select *Least-privilege default role* and press **I** (or **Inspect**). Set **Size** to L, and under **System** choose **Add…** › Invoicing. | The card's badge changes to L, and it gains a copy in the Billing row. Each change is one undo step. |
| Shift-click *Credit notes* and *VAT OSS reporting* into the selection. | The panel reads "3 cards". Time shows **Mixed**, and a component only one card has shows "1 of 3". |
| Set **Time** to Q3, then undo. | "Changed Time on 3 cards", then back to Mixed. |
| **2.** Link *Credit notes* → *VAT OSS reporting* (select both, press **L**). Select *Credit notes* and type a description. | The inspector lists *VAT OSS reporting* under **Comes before**. ✕ removes the link, with Undo. Clicking a linked card's name shows it on the board, even inside a group. |
| **3.** Look at *EU data residency* and *Tenant data deletion (GDPR)*. | Badges read Initiative and Epic. An initiative's border is heavier, with a strip along the top, and an epic's is a little heavier than a story's. Most cards have no level yet. |
| Set *Passwordless login*'s level to **Story**. Open it, select *WebAuthn enrollment*, and set it to **Epic**. | The child gets a ⚠ ("Epic, at or above its group's Story"), and the group's ⚠ count goes up. **Rows → Level** sorts by level like any property. |
| **5.** Click **Plan**, then set **Rows → System (component)**. | Areas show as bands on the left. Each area ends with a shaded "No component" lane. *Contractor and guest identities*, which has an area but no component, sits in Identity's lane. The bottom lane holds only cards with no system value at all. |
| Drag *Custom roles* into Identity's "No component" lane. | It becomes plain Identity (Q22's rule). Undo restores Roles & Permissions. |
| **6.** Click ▾ beside **Identity & Access**, then ▸. | It folds into one lane ("4 components"), with each card's component shown as a badge, then opens again. Dragging a card along a folded lane keeps its component. |
| Click the name **Billing**, then press **Esc**. | A zoom into Billing's components, then the bands come back. |
| Set **Columns → Time (release)** and fold **Q1 2027**. | Quarters show as bands above their releases, each with its own "No release" column. Q1 folds into "2 releases". |
| **7.** Set **Columns → Sequence**. Select *EU data residency* and *Usage-based pricing*, and press **E** (or **Expand**). | Both groups give way to their children. Each child has a chip naming its group and an edge in that group's color. |
| Select one of Usage-based pricing's children and press **E**. | That group folds back into one card. |
| **8.** Select *Usage-based pricing* and *Public API v2*, and press **⌘↓** (or **Zoom in**). | The breadcrumb reads "Usage-based pricing + 1". Only those two groups' children show, each with its chip. Click **Plan** to come back. |
| **9.** Fold EU back (select one of its children, press **E**). Set **Rows → System**, **Columns → Time**. | In the Identity row at Q3, EU is a dashed frame around *Region-pinned directory sync*, the card that puts it there. |
| Drag *Region-pinned directory sync* to Billing, Q3. | The card's own area changes, and EU's frame moves with it. |
| **10.** Reload. | Nothing is lost: the plan, the folded Q1, the expanded groups, and the description. |
| **4.** **File › Import CSV…** with `jira-export.csv`. Click **Next: values →**, check **Issue types → levels**, and click **Import 53 cards**. | Epics arrive as Epic and stories as Story. Select *Enterprise SSO self-service*: the inspector shows its key, IDN-1. |

An automated test runs all ten criteria on every build (`e2e/exit-criteria-4.spec.ts`).

## Known gaps

- **The inspector:**
  - It can't change a card's sequence position. Dragging does that.
  - The Jira key is read-only.
  - A group shows its own values, not its children's.
- **Nested axes:** every child-level view gets one more lane per parent. Folding a band takes it back to one.
- **Multi-zoom:**
  - It needs the groups to be on the same level; otherwise it zooms into the first one and says so.
  - A card made by double-clicking in a multi-zoom view goes into the first group.
- **Frames:** a link to a card inside a frame is still drawn to the group, as Q38 says.
- **No conflicts panel yet.** The new level marker adds to the ⚠ counts before there's any way to hide a type (Q23). Per-type hiding is sprint 5.
- **Browsers:** automated tests run in Chromium only. Firefox and Safari still need a manual check.
- **Toolbar:** Help is now the **?** button, to keep the toolbar on one row at 1440px.

## Open product questions

Each has a working default in this build (see [`docs/questions.md`](../questions.md)):

- **Q33:** E expands and folds groups. Multi-zoom is ⌘↓ with several groups selected. Frames show the cards that put a group in a cell.
- **Q35:** the inspector opens from **Inspect** or I, and follows the selection.
- **Q34 (answered):** bands fold and zoom both work; the session will show which people use.
- **Q23:** watch whether level markers add noise.
- Still open from sprint 3: Q39 and Q21.

See [the session script](sprint-4-session.md).
