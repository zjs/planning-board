# Sprint 7 demo

Until now, every tester met the board after a demo. A stranger opening the public link met a reference manual over the board, a first view that didn't look like a grid, and a dozen gestures nothing on screen pointed to.

Sprint 7 makes the board explain itself. Views are one click away and pivots visibly move the cards. A blank plan comes with a short guide that's done by doing it. Values can be named right in the headers, every card has a menu, and a dragged card says where it's going. It also carries a rough sequence into a timeline: cards keep their order, and a run of them drags into a quarter at once.

## Get the build

- **Latest `main`:** https://zjs.github.io/planning-board/. Each CI run also attaches the same file as `planning-board-<commit>.html`.
- **For the first part,** use a private window, so the board starts empty, as it does for a stranger.

## Exit criteria walkthrough (about 10 minutes)

| Do this | You should see |
|---|---|
| **1.** Open the link in a private window. | "Sort out a release plan", one line on what it's for, and **Start a blank plan** as the main button. No help covering anything. |
| Click **Start a blank plan**. | The first card is ready to type, and a guide on the right lists five steps. |
| **2.** Type five ideas, pressing **Enter** after each, then **Esc**. | They stay in the order you typed them. The guide ticks off "Get your ideas down". |
| Click **+ Add area** at the bottom left, type two names with **Enter** after each, then **Esc**. | Two areas appear as rows. The guide moves on. |
| Drag an idea into an area. | While you drag, the card says "→ *Area*, no component". Step 3 ticks off. |
| Click **Sizing**, and drag a card into **M**. Then click **Sequence**. | The cards glide to their new places each time. Back in Sequence, the card is still in its area. |
| Hold one card over another until it highlights, and let go. | "Put … inside …", and "That's the board". Click **Done**. |
| **3.** **File › Load sample plan**. | It opens on **Roadmap**: quarters across, areas down. Click **Sequence**, then **Roadmap**, and watch the cards travel. |
| **4.** Drag a box from empty space over the first three cards in Identity's **No quarter** lane. Drag one of them onto Q1. | All three land in Q1, and a notice says "Moved 3 cards". Its **Undo** puts them back. |
| **5.** Double-click **Q1 2027** in the header, rename it, and press **Enter**. Click **+ Add quarter** under "No quarter", and name one. | The header renames in place, and the new quarter appears. **⌘Z** undoes each. |
| **6.** Drag *OIDC provider support* over a cell in Billing. | The card reads "→ Q3 2027 · Billing", with "Alt adds instead". Press **Esc**. |
| Right-click any card. | Its actions, each with its key. Hover a card to see its **⋯**, which opens the same menu. |
| **7.** Look at the toolbar and the view bar. | Groups **Expand** and **Collapse**. Only bands **Fold** and **Unfold**, beside the axis pickers. |
| **8.** Narrow the window to 1280 wide. | The toolbar stays on one row. |

An automated test runs all eight on every build (`e2e/exit-criteria-7.spec.ts`).

## Known gaps

- **Cards can pass over the board's edges.** While cards glide to a new view, they can pass over the pinned headers and holding lanes for a third of a second.
- **No auto-scroll while box-selecting.** A box can't scroll the board, so select what's on screen, or ⇧-drag a second box.
- **Order within a cell can't be changed by hand.** Cells keep sequence order, then the order cards were made in (Q46's MVP). Reordering by hand is Q46 (c), a sprint 8 candidate.
- **Sequence and time are still separate axes** (Q56). The session asks whether bucketing with box select is enough.
- **Some of the board is still unexplained or crowded.** The area color on each card isn't explained, the sample still shows many ⚠ markers, and holding lanes still take a lot of the screen. These wait for the conflicts panel (Q23).
- **No command palette yet** (Q54 b). The card menu shows every action's key instead.
