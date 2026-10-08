# Sprint 11 demo

Sprint 11 is the relay (`docs/plans/m2-plan.md`): two people on two computers share a plan, end-to-end encrypted, and either can go offline and come back.

- **The relay** is one program, with the app inside. Run it on your laptop for a pilot, or on a server in a container (Q64, Q69).
- **Share** turns the plan you're on into a shared plan (Q68). It gives a **Can edit** and a **Can view** link (Q62).
- **The connection pill** says how the plan stands: Live, Offline with what isn't shared yet, or View only (Q59).
- **Two people nesting cards into each other's at once** leave one nest, not a loop (requirement 14, ADR 0004). There's nothing to see unless it happens.

## Get the relay

From the [`relay-latest` release](https://github.com/zjs/planning-board/releases/tag/relay-latest), download the archive for your computer, unpack it, and run `planning-board-relay`. On a Mac, macOS refuses an unsigned program, so in Terminal, in the folder you unpacked:

```
xattr -d com.apple.quarantine planning-board-relay
./planning-board-relay
```

It prints two addresses. The second, "On your network", is the one colleagues can open.

You need a second browser for the person you're sharing with: another computer on the same network, or a second browser profile on this one (Chrome's profile menu, top right). Each profile keeps its own plans, as another person's computer would.

## Exit criteria walkthrough (about 15 minutes)

| Do this | You should see |
|---|---|
| **1.** Run the relay, and open the "On your network" address. | The board, served by your relay. |
| **2.** **Load sample plan**, then **Share** in the toolbar. Give your name, then **Share**. | A **Can edit** and a **Can view** link, each with **Copy**. The toolbar says **Live**, with your name beside it. |
| **3.** In the second browser, open the Can edit link. | The sample, named **Sample plan**, in a moment. It's in **File › Your plans** there too. |
| Drag a card on one board. | It moves on the other. Try it the other way round. |
| Rename the plan on one. | The other follows. |
| **4.** In a third browser (or a private window), open the **Can view** link. | The plan, with **View only** and a note saying why. Dragging does nothing, and Undo, Group and Link are off. Changes from the others still arrive. |
| **5.** In the second browser, go offline: turn off Wi-Fi, or in Chrome's DevTools › Network choose **Offline**. Drag two cards. | The pill says **Offline · 2 changes not shared yet**. The board keeps working. |
| Meanwhile, drag a card on the first board. Then go back online. | Within a few seconds the pill says **Live**, and both boards match. |
| **6.** Open the public build, https://zjs.github.io/planning-board/, and **Share**. | It asks for the relay's address, and says that from an https page the relay must be https, or on this computer (`localhost`). On the computer running the relay, `http://localhost:8787` should work, though the browser may first ask to let the page reach devices on your network. |
| **7.** Look in `planning-board-data`, next to the relay. | A folder per shared plan, holding numbers and scrambled bytes: no card titles, and no plan names. |

An automated test runs steps 2 to 5 and 7 against a real relay on every build (`e2e/relay/share.spec.ts`).

## What else changed

- **File › Share…** does what the toolbar's Share does. On a shared plan it's **Share links…**, and the pill opens the links too.
- **File › Replace this shared plan from a file…** puts a saved file's plan in place of the shared one, for everyone, after a warning (Q58). One Undo puts it back. **Open plan file…** still makes a new plan and changes nothing shared.
- **Deleting a shared plan** removes it from this browser only. Others keep it, and opening its link again brings it back.
- **A plan written by a newer version of the app** opens view-only, saying why, rather than being changed by a build that doesn't understand it.
- **A plan the relay no longer has,** such as after its data folder was lost, says **Not on the relay**, with **Put it back**, which shares your copy again under the same links. A relay restored from an older backup needs nothing: each board notices and sends what the relay is missing.

## Known gaps

- **No one is visible yet.** You see each other's edits, not each other: names, pointers and selections come with presence in sprint 12.
- **There's no way to cut off a link.** "Make new links" comes in sprint 12.
- **Two people dragging one card at the same moment:** the later drop wins, silently. The notices and the "Ada is moving this" marker come in sprint 12 (Q60).
- **The Mac download isn't signed,** hence the Terminal step above.
- **A browser whose first visit is a share link** also lists an empty "My plan".
- **Plans live per address.** A plan made on the public build isn't there when you open the app from your relay. Save it to a file, then open the file there, as Share's "Or open the app from your relay" says.
