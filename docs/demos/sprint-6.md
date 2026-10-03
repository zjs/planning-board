# Sprint 6 demo

On an imported plan of about 150 cards, finding one card meant scanning lanes. Press **/** and type: the cards that match stay bright, the rest fade back, and nothing on the board moves. Press **Enter** and they're all selected, ready for E, L or the inspector.

This is *find*, not a filter: no card is hidden (Q50, ADR 0014). Filters that hide cards are still requirement 9, deferred.

## Get the build

- **Latest `main`:** https://zjs.github.io/planning-board/. Each CI run also attaches the same file as `planning-board-<commit>.html`.
- **For testers:** send them the link, or the downloaded file.

Start from **File › Reset board**, then **Load the sample plan**, so the steps below match.

## Exit criteria walkthrough (about 5 minutes)

| Do this | You should see |
|---|---|
| **1.** Press **/** and type `sso`. | A bar under the toolbar says "3 cards". The three SSO cards are bright and everything else is faded. *Second payment processor* stays faded: a typed word has to start a word on the card, and "sso" is in the middle of "processor". Point at a faded card and it comes forward. |
| Press **Esc**. | The bar closes and the board is back to normal. |
| **2.** Set **Columns → Time**, press **/**, and type `webauthn`. | *Passwordless login* stays bright with a blue **1 inside**: the match is inside it, collapsed. Hover the pill to see which card. |
| Press **Enter**. | The group expands, *WebAuthn enrollment* is selected, and a notice says what happened. The keyboard is back on the board, so **⇧E** collapses the group again. |
| **3.** Press **/**, type `sso`, then press **↓** a few times, and **↑**. | Each SSO card in turn is selected, flashed and scrolled into view. |
| **4.** Set **Rows → Time**. | The bar keeps "sso", and the same three cards stay bright. |
| **5.** Click one of the bright cards and press **L**. | A link starts: shortcuts work while finding. Press **Esc** three times: it cancels the link, clears the selection, and then closes the bar. |
| **6.** Press **/** and type `el i`. | It's all in the bar. No link starts and the inspector doesn't open. |

The magnifier beside **?** opens and closes the bar too, for anyone who doesn't know **/**.

An automated test runs all six on every build (`e2e/exit-criteria-6.spec.ts`).

## Known gaps

- **Matching a group and its contents.** If Enter expands a group that matches too, the group leaves the board, and only the cards inside are selected. Their chips still name the group.
- **Enter's expanding isn't undoable,** the same as E. **⇧E** collapses it.
- **Words only.** Values such as "Identity" or "Initiative" aren't matched; ⇧-click a badge for those (Q47).
- **⌘F** is still the browser's own find. It finds titles you can see, not descriptions or cards inside collapsed groups.
- **Browsers:** automated tests run in Chromium only. Firefox uses / for its own quick find; the board takes it while the board has focus, but that needs a manual check.

## Open product questions

- **Q50 (answered):** dim rather than hide, card text only. The session watches whether people press **/**, **⌘F**, or neither, and whether anyone wants the faded cards gone.
