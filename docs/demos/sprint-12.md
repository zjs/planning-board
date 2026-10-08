# Sprint 12 demo

Sprint 12 is "seeing each other" (`docs/plans/m2-plan.md`): a live session on a shared plan should feel like a whiteboard, and collisions should be rare and recoverable.

- **Presence:** an avatar per person, and their pointers and selections, on the same cards in your own view (requirement 32, Q61).
- **Driving:** anyone can claim it, and pointers can be quieted to the driver's, or nobody's (Q71).
- **Two people, one card:** a drag says who's moving the card and where. When two people drop it, the later drop wins, and both are told, each with a way back (Q60).
- **Make new links:** old links stop working, and the people who had them keep what they saw (Q62).
- **Where no relay is allowed:** run one on a laptop (`docs/hosting.md`), or share by file (Q64, Q72, ADR 0022).

## Set up

Run the relay from the [`relay-latest` release](https://github.com/zjs/planning-board/releases/tag/relay-latest), as in the sprint 11 demo, and open its "On your network" address. You need **three browser profiles**, for Ada, Bo and Cy: Chrome's profile menu, top right, or other computers on the same network. Each profile keeps its own plans and name, as another person's computer would.

## Exit criteria walkthrough (about 20 minutes)

| Do this | You should see |
|---|---|
| **1.** As Ada, **Load sample plan**, **Share**, give your name, and **Share**. Open the Can edit link as Bo and as Cy, each giving a name when asked. | Three avatars beside the pill on every board, yours first. Pointing at them shows each name and color. |
| As Bo, pick **Sizing**. As Ada, on **Roadmap**, point at a card. | On Bo's board, Ada's pointer, in her color, sits on the same card, though it's somewhere else on his board. Off the cards, it goes. |
| **2.** As Ada, select two cards. | They're outlined in Ada's color on Bo's and Cy's boards, on every copy. |
| **3.** As Cy, click the avatars, then **I'm driving**. | Every board's menu says **Cy is driving**, and Cy's avatar has a ring. |
| As Bo, click **I'm driving**. | Bo takes over, on every board. |
| As Ada, click the avatars, then **Driver only**. Have Bo and Cy point at cards. | Ada sees Bo's pointer, not Cy's. When Bo stops driving, Ada sees no pointers until someone drives. **None** hides them all. Avatars and selections always show. |
| **4.** As Ada, start dragging a card, and hold it over another cell. | Bo and Cy see the card outlined, with **Ada is moving this → Q3 · Billing**. |
| While Ada holds it, Bo drags the same card. | Bo's drag says **Ada is moving this too**. |
| Ada drops, then Bo drops somewhere else. | The card ends where Bo dropped it. Ada's notice: **Bo moved … after you**, with **Put it back**. Bo's: **Ada moved … just before you. Yours stuck.**, with **Undo**. |
| Ada clicks **Put it back**. | The card goes back where Ada dropped it, on every board. |
| Two people drag one card from an area into two different areas at the same moment. | It's in both areas, and the notice offers **Keep only mine**. This is the least certain design in the sprint: tell us if it reads wrong. |
| **5.** As Ada, open the links (click the pill), **Make new links…**, read the warning, and **Make new links**. | New links in the dialog. Bo and Cy, on the old link, see **Link replaced**, and a banner saying to ask for the new link. Their boards stay as they were, and can't be changed. |
| Open the new Can edit link in a fresh profile, or in a private window. | The plan as it is now, **Live**. |
| **6.** Stop the relay. As Ada, open the public build, **Load sample plan**, then **Share › No relay allowed? Share by file › Share by file**. | One Can edit link. The pill says **Shared by file**. |
| Copy the link to Bo, by chat say. Then **Send changes** in the dialog or the File menu, and email Bo the file it downloads. | A `.pbchanges` file. Opening it in a text editor shows no card titles. |
| As Bo, open the link. | An empty board, **Waiting for changes**. **Merge changes…** with Ada's file shows the plan. |
| Bo renames a card, **File › Send changes**, and sends it back. Ada merges it. | **Merged: 1 card changed.** Merging the same file again says nothing is new. |
| As Cy, who never had the link, **File › Merge changes…** with the same file. | It's refused: the plan isn't in Cy's browser, and the file can't be read without the link. |
| **7.** Follow `docs/hosting.md` on a server you can use, behind Caddy or nginx. | `/healthz` says `ok`, and sharing from its address says **Live**. |

Automated tests run steps 1 to 6 on every build: `e2e/relay/presence.spec.ts`, `e2e/relay/collisions.spec.ts`, `e2e/relay/renew.spec.ts` against a real relay, and `e2e/changes-file.spec.ts` with none.

## Session script: three people live, one offline (about 30 minutes)

For a tester session after the PM's acceptance. Three testers on one relay, each in their own profile or computer, and a facilitator.

1. **Find each other (5 min).** The facilitator shares the sample. Each tester opens the link, names themselves, and says aloud whose pointer they can see, and on which card. *Watch:* do they understand a pointer that isn't where it is on their own screen? Do they find the avatar menu?
2. **Present (5 min).** One tester drives a walk-through of the Roadmap, while the others set **Driver only**. Then hand over driving. *Ask:* was the driver's pointer enough to follow along, without following their view?
3. **Rearrange together (10 min).** All three re-plan Q3 at once, by dragging. The facilitator asks two of them to grab the same card on a count of three. *Watch:* do they notice the "moving this" marker before reaching? After a collision, do they understand which drop won, and do they use **Put it back**, or just drag again?
4. **One goes offline (5 min).** One tester turns off Wi-Fi and keeps re-planning for a few minutes, while the others carry on. Then they reconnect. *Ask:* did anything they did disappear, or come back somewhere unexpected? ("Since you were away" is sprint 14; for now, this measures how much it's needed.)
5. **Cut someone off (5 min).** The facilitator makes new links, and sends them to two of the three. *Ask the third:* is it clear what happened, and what to do?

Feedback goes into `docs/backlog.md`, under theme M.

## What else changed

- **The relay** gives presence its own rate limit, so pointers never slow down changes. It takes `-restored` after a restore from backup, which makes every board send whatever the backup is missing. Sprint 11's demo said a restore needed nothing; that wasn't quite true for a board that had seen updates after the backup was taken.
- **The toolbar** stays one row at 1280 wide with avatars in it. The name you share under is in the avatar menu, where it replaced the chip beside the pill.
- **Running a relay for a team** is now written up: `docs/hosting.md`.

## Known gaps

- **No history yet.** Who changed what comes in sprint 13. Changes files have room for it, and carry none yet.
- **"Since you were away"** comes in sprint 14. Coming back from offline merges, as in sprint 11, without a summary.
- **Plans shared by file have no view link.** Without a relay, nothing can stop someone who can read a file from writing one (ADR 0022).
- **A changes file always holds the whole plan,** so each is as large as the plan: tens of kilobytes for a few hundred cards.
- **Presence draws only on cards on screen.** A pointer on a card scrolled away, or inside a collapsed group, shows nothing, by design (ADR 0019).
- **The Mac relay isn't signed,** as in sprint 11.
