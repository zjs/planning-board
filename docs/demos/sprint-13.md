# Sprint 13 demo

Sprint 13 is history (`docs/plans/m2-plan.md`): anyone on a plan can find out who changed what, and when, in their own time zone (requirement 36, Q63).

- **Activity:** every change to the plan, by day, newest first. You can filter it by person. One person's changes close together are one row that opens (Q74), and anything deleted can be restored.
- **A card's history:** in the inspector, with "Last changed by" under the title and in the card's tooltip.
- **Where history goes:** history is kept forever, in an encrypted document of its own beside the plan. It travels through the relay and in changes files, never in plan files.
- **Before sharing:** a shared plan's history starts at the share. The drafting before it stays on your computer (Q73).

## Set up

Run the relay as in the sprint 11 demo, and open its "On your network" address. Use **two browser profiles**, Ada and Bo.

To see time zones at work, put Bo's profile in another zone: Chrome's DevTools › **⋮ › More tools › Sensors**, then **Location** › a city such as New York, which overrides the time zone too. Keep DevTools open while you use that tab, or use a second computer in another time zone.

## Exit criteria walkthrough (about 15 minutes)

| Do this | You should see |
|---|---|
| **1.** As Ada, **Load sample plan**, rename a card, drag another to a new quarter, then delete *Passwordless login*. | The board changes as usual. |
| Open **Activity** in the toolbar. | **Today**, with one row, "You made … changes", and its time. Click it to open each change. Clicking a change shows its card on the board. |
| **2.** **Share** the plan, open the Can edit link as Bo, and make a change or two as Bo. | Bo's Activity starts with "Ada shared the plan", and nothing from before. Ada's Activity still shows her drafting, under **Before sharing · only on this computer**. |
| As Ada, make two more changes, then open Activity as Bo. | "Ada made 2 changes", with times in Bo's time zone. **Show** › Ada lists only hers. |
| **3.** As Ada, delete a group. As Bo, open Activity, open Ada's row, and click **Restore** on the deletion. | The group is back on both boards, with everything inside it. Activity says "Bo restored …". One Undo, as Bo, deletes it again. |
| **4.** As Bo, select a card Ada changed, and **Inspect**. | "Last changed by Ada, 10:42" under the title, and **History** below the links, listing each change to that card. Pointing at the card on the board says who changed it last, in its tooltip. |
| **5.** Make a new plan, change a few cards, and open Activity. | Your own changes, with "You". It works the same on a plan that isn't shared. |
| **6.** **Share by file** (stop the relay first, as in the sprint 12 demo). Send changes to Bo, and have Bo send changes back. | After merging, each person's Activity shows the other's changes, by name. |

Automated tests run steps 1 to 6 on every build: `e2e/relay/history.spec.ts` with two people on a relay, and `e2e/history.spec.ts` and `e2e/changes-file.spec.ts` with no relay.

## What else changed

- **Restore** brings back exactly what was deleted: each card, where it was, with its links.
- **Clocks:** each change the relay acknowledges tells your browser how far the relay's clock is from yours. When it's more than a minute out, your entries are shown corrected.
- **The relay** now holds two rooms for each shared plan, one for the board and one for its history. A self-hosted relay's `-max-rooms` counts both (`docs/hosting.md`).

## Known gaps

- **Changes made by builds before this one** aren't in anyone's history. Plans shared before this build start their shared history the first time someone with the edit link opens them.
- **Attribution is a courtesy, not an audit trail:** names are the ones people chose (the footnote in Activity says so).
- **History is larger than estimated:** about 190 bytes per change, not 60, partly because the sample's card ids are long. Kept forever, that's about 19 MB after 100,000 changes. It loads after the board, so it can't slow opening a plan (Q63).
- **Restore is for deletions only.** Putting back other changes comes with "Since you were away" in sprint 14.
