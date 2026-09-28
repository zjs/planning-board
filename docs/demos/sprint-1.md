# Sprint 1 demo

What sprint 1 set out to test: can people break an item down into parts and regroup parts under a new item, directly on the board? And does zooming, into a group or into one area or quarter, keep a 150-item plan readable without losing their place?

## Get the build

The app is one HTML file, with nothing to install and no server.

- **Latest `main`:** repo → Actions → the newest **CI** run on `main` → Artifacts → `planning-board-<commit>`. Unzip it and open `index.html`.
- **For testers:** send them the unzipped `index.html` directly. The artifact download needs a GitHub login.

Your board is saved in the browser you open it in. Click **Reset** and then **Load sample plan** to start fresh. The sample plan now has three cards tagged Identity with no component, for step 4.

## Exit criteria walkthrough (about 10 minutes)

| Do this | You should see |
|---|---|
| **1.** In Sequence × System, click *Custom roles*. ⇧-click *Least-privilege default role* and *Role templates for new workspaces*. Press **⌘G** (Ctrl+G). | The three cards become one group card, with a title field open. Type a name and press Enter. The group gets the values its cards share (*Roles & Permissions*) and waits in Identity's "No position" lane, because one of the cards has no position. |
| **2.** Double-click the group. | The board shows only its three cards. A bar under the toolbar shows **Plan › your group** and the group's own values. |
| Double-click empty space in a cell, type a title, and press Enter. | A new card appears inside the group. |
| Double-click a card inside the group. | It opens for renaming. |
| Drag a card onto **Plan** in the breadcrumb. | It moves out of the group, keeping its values. A notice says where it went. |
| **3.** Press **Esc** twice. The first clears the selection; the second zooms out and selects the group. Then press **⇧⌘G** (Ctrl+Shift+G). | The group card disappears, and its cards are back on the board. |
| **4.** Switch to **Time (quarter) × System (area)** and click the **Identity & Access** row header. | The rows become Identity's components, and a "System: Identity & Access" chip appears. *Session management overhaul*, tagged only Identity, waits in "No component" under Q2. |
| Drag it onto the SSO row, in the Q2 column. | It's now tagged Identity › SSO, which replaces plain Identity. Click the chip's ✕ to zoom back out. |
| **6.** Look at Billing, Q2. | A faded *EU data residency* card, marked "via cards inside": one of the group's cards is in Billing. You can click it or double-click it (zooms in), but not drag it. |
| **5.** Set **Columns → Time (release)**. | The columns are releases: 27.1, 27.2, and so on. |
| **7.** Find *EU data residency* and hover over its **⚠ 4**. | A list of the 4 mismatches inside it. Double-click the group: *Region-pinned directory sync* has its own ⚠, dated 27.6 against the group's 27.3, and in Identity where the group is Data Platform. |
| **8.** Press **⌘Z** repeatedly, then reload. | Each step undoes separately. Nothing is lost on reload. The undo history starts fresh after a reload; that's accepted (Q17). |

An automated test walks through exactly these steps on every build (`e2e/exit-criteria.spec.ts`).

## Known gaps

- **Browsers:** automated tests run in Chromium only, and only Chromium is available where engineering works. **Firefox and Safari have not been checked.** Please open the file in your testers' browsers before the session.
- **Mismatch noise:** 17 of the sample plan's 23 grouped cards carry a ⚠ (Q23). That's a lot, and the session should tell us which markers people would act on.
- **Double-click does three jobs.** In empty space it creates a card, on a card it renames it, and on a group it zooms in. Double-clicking just beside a card renames that card, where you may have meant to create one.
- **Zooming into a plain card** uses ⌘↓ or the **Zoom in** button. Double-clicking a plain card renames it.
- **In sequence views**, a group's faded copy only appears in columns that exist at the current level.
- **The toolbar wraps onto two rows** at 1440px wide (the width the screenshots were checked at) and narrower.
- **Not built (by design):** dependency lines, contention, the conflicts panel, scenarios, custom properties, editing property values, CSV import, plan files, filters, saved views, and card descriptions.
- **Input:** mouse or trackpad only.

## Open product questions

Each has a working default in this build (see [`docs/questions.md`](../questions.md)):

- **Q21:** ungrouping moves a group's dependencies onto each of its cards.
- **Q22:** inside a lane zoom, "No component" puts a card back to the plain area.
- **Q23:** are the mismatch markers too noisy?

The session is the best place to settle these; see [the session script](sprint-1-session.md).
