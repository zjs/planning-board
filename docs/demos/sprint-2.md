# Sprint 2 demo

What sprint 2 set out to test: can a PM take a Jira export and, in a few minutes, get a board they recognize as their own plan? Can they then pivot it by their own properties, such as team, and tidy the taxonomy on the board?

## Get the build

The app is one HTML file, with nothing to install and no server.

- **Latest `main`:** repo → Actions → the newest **CI** run on `main` → Artifacts → `planning-board-<commit>`. Unzip it and open `index.html`.
- **For testers:** send them the unzipped `index.html` directly. The artifact download needs a GitHub login.
- **The sample export:** `docs/samples/jira-export.csv` in the repo (open it on GitHub, then **Download raw file**). It's synthetic: 53 issues across three fictional projects, in Jira's CSV format. `npm run sample:jira` regenerates it.

Your board is saved in the browser you open it in. **File › Reset board** clears it.

## Exit criteria walkthrough (about 10 minutes)

| Do this | You should see |
|---|---|
| **1.** Load the sample plan. Choose **File › Save plan to file**, then **File › Reset board**, then **Open plan file…** on the empty board, and pick the file you saved. | The same plan comes back, and a notice says "Opened …". Saving again gives an identical file. |
| **2.** Choose **File › Import CSV…** and pick `jira-export.csv`. | The columns are already mapped: Summary → Card title, Component/s (×3) → Components, Fix Version/s → Release, story points → Size, Parent → groups, Blocks links → dependencies, Labels and Team → custom properties. Status, Priority, Assignee and Sprint are left out (Q29). The summary says 53 cards, 9 groups and 12 dependencies. |
| Click **Next: values →**. | Every component is in an area named after its Jira project, the versions are "Not dated", and story points use the default sizes (Q27, Q28). |
| Type `Customer Experience` as the area for Admin Console, Notifications and Checkout. Give 2027.1–2027.4 the next four quarters in order. Click **Import 53 cards**. | The board switches to Time × System (Q30), with rows Identity Platform, Customer Experience, Payments and Data Platform. *Enterprise SSO self-service* is a group of 4, with IDN-1 and an XL badge. |
| **3.** Set **Rows → Team**. Drag *Custom roles* from Growth to Platform. | Rows are Platform, Growth, Core Payments and Data Infra. The card moves. |
| **4.** Set **Columns → Time (release)**. Open **Properties › System**, click **Roles** and rename it `Roles & Permissions`. Hover over it and choose **Move to… › Customer Experience**. | Badges show the new name, and its cards move to the Customer Experience row. |
| Open **Time**, type `2027.1 hotfix` under the first quarter, and press Enter. Then hover over **2027.1** and click ✕. | A new release column appears. Deleting 2027.1 says "… cards moved to <quarter>" (Q4). By quarter, those cards are still there. |
| Press **Undo** four times. | Each step undoes separately, back to the imported names. |
| **5.** Under **New property**, add `Customer`, then the values `Acme Bank` and `Globex`. Click **Show as rows**, and drag a card from "No customer" into Acme Bank. | The property is a choice of rows as soon as it exists, and the drag gives the card that value. |
| **6.** Reload. | Nothing is lost. The undo history starts fresh after a reload (Q17). |
| **7.** Import your own export (Jira: a filter's **Export › CSV (all fields)**, _recalled_). | This is the real test. Note any column that wasn't recognized, and anything the board got wrong. |

An automated test runs steps 1–6 on every build (`e2e/exit-criteria-2.spec.ts`).

## Known gaps

- **An import replaces the board.** There's no merging into the current board, and no updating from a fresh export yet, even though every card keeps its Jira key (Q26).
- **Imported cards have no sequence position** (Q30). The board opens in Time × System after an import.
- **Dependencies are imported but not drawn.** Drawing and order highlights are sprint 3, and linking is select two cards and press L (Q24).
- **Descriptions are imported and saved, but not shown.**
- **Custom properties are flat** (Q25). Values are moved with a menu, not by dragging them in the Properties panel.
- **The quarters offered in the import** are this quarter and the next seven.
- **Browsers:** automated tests run in Chromium only. Firefox and Safari still need the manual check from sprint 1.
- **Input:** mouse or trackpad only. The value tools in the Properties panel appear on hover.

## Open product questions

Each has a working default in this build (see [`docs/questions.md`](../questions.md)):

- **Q27:** components go in an area named after the project; versions start undated.
- **Q28:** story points 1 → XS, 2–3 → S, 5 → M, 8 → L, 13+ → XL.
- **Q29:** Status, Priority, Sprint and Assignee are off unless mapped.
- **Q30:** imported cards have no sequence position, and the board opens in Time × System.
- Still open from sprint 1: Q21, Q22, Q23.

See [the session script](sprint-2-session.md).
