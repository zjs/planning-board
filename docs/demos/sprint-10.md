# Sprint 10 demo

Sprint 10 lays M2's foundations while the board is still single-user (`docs/plans/m2-plan.md`):

- **Several plans per browser.** A scratch plan can sit beside the real one. Opening a file, importing, starting a blank plan and loading the sample each make a new plan, so nothing you're on is overwritten (Q58, Q66, Q67).
- **Two tabs of one plan stay in step.** It's the first collaboration anyone sees, with no server.
- **A document that merges well** (ADR 0016). Nothing looks different, and that's the point: every board saved by an earlier build opens as it was.

## Get the build

- **Latest `main`:** https://zjs.github.io/planning-board/. Each CI run also attaches the same file as `planning-board-<commit>.html`.
- **Use the browser you've tested with before,** if you can, so step 1 shows your existing board carrying over.

## Exit criteria walkthrough (about 10 minutes)

| Do this | You should see |
|---|---|
| **1.** Open the build in a browser that used an earlier one. | Your board, as you left it. The toolbar's top left now says **My plan**. |
| **File › Open plan file…** with a file an earlier build saved. | It opens as a new plan, named for the file, with everything in it. **File** lists it under *Your plans*, with My plan below it. |
| **2.** Select a group with stories inside and press **Delete**. Then **Undo**, **Redo**, **Undo**, and reload. | The group and its stories go, come back, go, and come back, exactly as they were. After the reload, nothing is missing. |
| **3.** **File › Load sample plan**. | The sample opens on Roadmap, as **Sample plan**. My plan is still in **File**. Click it, then the sample, to switch. |
| **4.** Double-click **Sample plan** in the toolbar, type a new name, and press Enter. Reload. | The new name, in the toolbar, the browser tab and **File**. A reload opens the plan you used last. |
| **5.** **File › New blank plan**, and type two ideas, pressing Enter after each. Then **File › Delete plan**. | Your previous plan opens, with "Deleted “Untitled plan”" and **Undo** at the bottom. |
| Click **Undo**. | The blank plan comes back with its ideas. Without Undo, it's gone for good after about 8 seconds. |
| **6.** Copy the address, with its `#plan=…`, into a second tab. Put the tabs side by side, and drag a card in one. | It moves in the other tab too. |
| Press **Undo** in the second tab. | Nothing happens to that drag: undo only reverses the tab's own edits. Rename or delete the plan in one tab, and the other follows. |

An automated test runs all six on every build (`e2e/exit-criteria-10.spec.ts`).

## What else changed

- **Each plan remembers its own view,** folded bands, expanded groups and collapsed holding lanes.
- **Saving names the file for the plan,** such as `q3-roadmap-2026-10-08.json`, and the file carries the name. Older builds ignore it.
- **Reset board is gone.** Delete plan replaces it.
- **An untouched empty plan is replaced, not kept.** A first visit that goes straight to the sample, or to a blank plan, leaves one plan, not two.

## Known gaps

- **Opening a file or importing is no longer an undo step.** The plan you were on is still in **File**. To get rid of the new one, delete it.
- **The guided start waits in its own plan.** If you open another plan partway through, it picks up again when you switch back.
- **Plans with the same name aren't told apart** in the list, other than by order (last opened first).
- **No search, folders or sorting** in the list of plans, until someone has enough plans to need them.
- **Two tabs show each other's edits, not each other.** Pointers, selections and names come with presence in sprint 12.
- **A browser's plans live in its storage.** Clearing site data clears them, as it always cleared the board. Saving to a file is still the backup.
