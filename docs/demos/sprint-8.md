# Sprint 8 demo

Sprint 8 is polish before the combined cold-start session:

- **Frames for expanded groups.** An expanded group used to leave the board, its cards spread among others and marked with chips. It now frames its cards in every cell they reach, the same way a collapsed group already did.
- **Related links.** Two cards can be related with no order between them.
- **A calmer board.** The colored edge on every card is explained on the board, and the holding lanes collapse out of the way.

## Get the build

- **Latest `main`:** https://zjs.github.io/planning-board/. Each CI run also attaches the same file as `planning-board-<commit>.html`.
- **Load the sample** with **File › Load sample plan**. If your browser already has a board, save it to a file first.

## Exit criteria walkthrough (about 10 minutes)

| Do this | You should see |
|---|---|
| **1.** In **Roadmap**, click *Passwordless login* and press **E**. | Its own card heads a frame in Q1 · Identity, with its badges, and its stories sit under it. In "No quarter", *WebAuthn enrollment* sits in a frame titled "Passwordless login". There are no chips. |
| Click the card's count, **3 ▾**. | The group collapses. A frame's title has a **▾** that does the same. |
| **2.** Expand *EU data residency*, then *Regional pipeline shards*. Select *EU Kafka cluster*, press **I**, and use **Add a card inside** twice, the second time on the new card. | Frames nest three deep. The fourth level sits inside the third, under the breadcrumb "EU Kafka cluster ›". |
| **3.** Select two cards and press **⌥L** (Alt+L). | A notice says they're related, and a dotted line with no arrow joins them. Nothing turns red. |
| Press **I** with one of them selected. | The inspector's links list the other under **Related**, with ✕ to remove it. |
| Select both again and press **⌥L**, then **⌘Z**. | The link goes, then comes back. |
| Point at *Audit log export API* (Data Platform, No quarter). | The sample's own related link: a dotted line to *Permission audit report*. |
| **4.** **File › Import CSV** with `docs/samples/jira-export.csv`, then **Next: values →**. | The summary says "… 12 dependencies, and 3 related links". |
| **5.** In Roadmap, look at the row bands. Then click **Sizing**. | Each area's band carries its color. In Sizing, the view bar shows "Edge = area" with each area's swatch. Point at a card's colored edge to see its area. **?** explains it under "What the board tells you". |
| **6.** In Roadmap, click **»** on "No quarter" and **▾** on "No area". | The lanes become a thin rail and a strip, each with its counts. |
| Drag a card onto the rail, then reload. | The count goes up, and after the reload the rail is still collapsed. **«** and **▴** bring the lanes back. |
| **7.** Open a plan file saved by sprint 7, and save it again. | Nothing is lost. |

An automated test runs all seven on every build (`e2e/exit-criteria-8.spec.ts`).

## Known gaps

- **Frame titles repeat.** A group whose cards reach four cells shows its title four times. It's one line each, but busy cells get taller.
- **A dependency and a related link between the same two cards overlap.** The dotted line runs over the arrow.
- **Holding lanes start open.** Whether a first-time visitor should see them collapsed is a question for the session.
- **A collapsed right rail has no name,** only « and a count per row.
- **Held for the session:** a Timeline view (Q56), reordering within a cell (Q46 c), a command palette (Q54 b), and quieter ⚠ markers, which come with the conflicts panel (sprint 9).
