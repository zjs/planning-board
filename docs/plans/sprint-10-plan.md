# Sprint 10: engineering plan

Status: **approved 2026-10-08; built 2026-10-08.** Sprint 10's compatibility fixtures follow in the next PR. Scope is in `docs/sprint-10.md`. This doc covers how engineering delivers it. The review process is unchanged from sprint 0 (`docs/plans/sprint-0-plan.md`, "Quality and review process").

## Context

Sprint 9 designed collaboration, and the PM approved the M2 plan (`docs/plans/m2-plan.md`, requirements 30–37). Sprint 10 is its first sprint: everything collaboration needs underneath, built and shipped while the board is still single-user, so each piece can be tested and accepted on its own.

- **Schema 2 (ADR 0016).** The merge harness showed the current Yjs layout converges to the wrong thing: single values held as sets, a card's first value racing, deletes discarding concurrent edits, and value objects written whole. Once boards are shared the schema is on many computers, so it changes now, alone, behind the compatibility gate.
- **Several plans per browser (Q58, requirement 34).** Shared plans need it, and it's useful today: a scratch plan beside the real one.
- **Two tabs of one plan stay in sync.** Today two tabs of the same board silently diverge until a reload. Fixing it is the first visible collaboration, and the public build's first demo of it (Q64 d).

**The PM's answers (2026-10-08, this planning session):**
- **On any plan, shared or not,** Open plan file, Import CSV, New blank plan and Load sample plan each make a new plan. Nothing is overwritten by accident. "Reset board" becomes "Delete plan", with Undo. This changes Q26 and Q51's replace-after-asking.
- **The plan list lives in the File menu,** and the toolbar shows the current plan's name, which you click to rename. The app opens the plan used last, so a first-time visitor sees no new step.

**A change from the M2 plan:** the plan diff moves from sprint 10 to sprint 13, where history first uses it. Built here, it would be a slice with nothing to demo, and thin vertical slices are the working agreement. The merge harness's scenarios still become store tests, in slice 1, where they prove schema 2.

## Slices

| # | Slice | You can do this afterwards |
|---|---|---|
| 0 | **Setup:** merge #65; the maintenance pass's fixes (below); `docs/sprint-10.md` and this plan; the PM's two answers recorded (Q66, Q67) | Read the sprint doc. CI and Pages run on current actions. |
| 1 | **Schema 2** (ADR 0016) | Open any board or plan file from any earlier build and see nothing different. Delete a group, undo, redo, reload: instant and exact. |
| 2 | **Several plans** (Q58, Q66, Q67, requirement 34) | Keep a scratch plan beside the sample. Switch from the File menu, rename from the toolbar, open a file as a new plan, delete a plan and undo it. |
| 3 | **Two tabs, one plan** | Open the same plan in two tabs. Drag a card in one, and it moves in the other. |
| 4 | **Tester-ready, and the release pass** | Run the demo note. Sprint 10's compatibility fixtures follow in the next PR. |

## How each slice is built

### 0. Setup, and the maintenance pass

The pass ran read-only in the background, and its fixes land in this slice.

**What it found:**
- **No npm updates to take.** Every dependency is on its latest release within range.
- **TypeScript 7 is still blocked:** typescript-eslint 8.71.1 still requires TypeScript below 6.1.
- **`braces` still has no patched release.**
- **No open GitHub issues.**
- **The relay spike's WebSocket library is current.**
- **Three CI actions are a major version behind,** which the 2026-10-07 and 2026-10-08 passes recorded wrongly as current:
  - `deploy-pages` v4 → v5 matters most, since v4 runs on a retired Node 20 Actions runtime;
  - `checkout` v6 → v7;
  - `setup-node` v6 → v7.

  Both v7s run on Node 24, and the inputs we use are unchanged.

**The fix:** bump all three in `ci.yml` and `pages.yml`, which only a CI run proves. Correct the backlog's Housekeeping entries to match, and record this pass under Done.

### 1. Schema 2

**Fixture first:** add the current `main` commit to `VERSIONS` in `scripts/generate-compat-fixtures.ts` as `before-schema-2`, per ADR 0005's policy.

**`src/store/schema.ts` gets version 2,** with `SCHEMA_VERSION = 2`. The version 1 reader moves to `src/store/schemaV1.ts`, kept only for migration.

**The item map:**
- `title`, `description`, `parent`, `sequence`, `rank` and `externalKey` stay as they are.
- `deleted: true` marks a tombstone.
- Values become flat keys:
  - a multi-valued property is `"v:<property>:<value>": true`;
  - a single-valued property is `"v:<property>": "<value>"`.

  `multi` is fixed when a property is made (`createProperty`), so the encoding never has to change.

**Each value is a `Y.Map`** of `label`, `parent` and `order`, edited key by key.

**`readPlan`:**
- skips deleted cards, any card under a deleted group, and deleted values;
- drops links to anything it skips, which it already does for missing cards.

**Commands (`src/commands/store.ts`):**
- `writeValues` becomes key differences on the item map.
- `deleteItems` marks the deleted roots: their children hide by the ancestor rule, and undo flips the marks.
- `deleteValue` marks values deleted.
- The value commands (`renameValue`, `reorderValue`, `moveValue`) set single keys.
- `writePlan`, `itemToY` and `propertyToY` write version 2.
- `deleteProperty` keeps removing the property. It's rare, and orphaned keys are ignored on read.

**Migration (`src/store/persistence.ts`):**
- `persist` opens `planning-board:v2:…`.
- When that database is empty and the version 1 database holds a board, it reads the board with the version 1 reader and writes it once with `writePlan`. This is outside undo, the same way `ensureBuiltIns` works.
- The version 1 database is left as it was, so an older build opened from disk still sees its last board. That consequence goes in ADR 0016.

**Tests:**
- **Compatibility:** `src/commands/compat.test.ts` opens every version 1 fixture through the migration, and new version 2 fixtures directly.
- **Unit tests:** the existing ones, updated where they read the raw document.
- **The merge harness's scenarios, as store tests** (`src/commands/merge.test.ts`): two `createPlanStore`s with fixed client IDs, plus a `sync` helper, asserting the fixed outcomes:
  - L1 and O1: one value;
  - L18: both areas;
  - L9, L11 and O4: hidden with the group, restored with it;
  - L16: both edits stick;
  - U2: undo doesn't override a later move;
  - L12: links come back.

  Plus a property test: random edits converge, and never leave a single-valued property holding two values.

**ADR 0016** gets the implementation notes.

### 2. Several plans

**The plan index:**
- `src/store/plans.ts` keeps the list of plans in localStorage (`planning-board:plans`): id, name, created and last opened.
- The name also lives in each plan's document, in a `meta` map, so it will travel with a shared plan.
- Each plan has its own IndexedDB database, `planning-board:v2:plan:<id>`.
- The plan in use is in the URL as `#plan=<id>`. With no hash, the app opens the plan used last.
- **The board as it stands today** becomes the first plan, "My plan". The default database migrates in slice 1.

**Commands:**
- `openPlanStore(planId)` replaces the single store.
- `App` holds the current plan and swaps the `Workspace` when the plan changes.

**Viewer state goes per plan:** the view, foldings, expanded groups and collapsed holding lanes. Their localStorage keys gain the plan's ID, and today's values move to the first plan.

**The File menu:**
- **Making plans:**
  - **New blank plan**, **Open plan file…**, **Import CSV…** and **Load sample plan** each make a new plan and switch to it, with no confirm.
  - An untouched empty plan is reused, not kept beside, so first visits and the guided start leave no litter.
- **Deleting:** **Delete plan** replaces Reset board. A notice offers Undo for 8 seconds, then the plan's database is dropped.
- **Your plans:** a section listing them, current first.

**`Menu` (`src/ui/Menu.tsx`)** gains a heading entry, plus a way to show the current plan.

**The toolbar:** the "Planning Board" title becomes the plan's name, and double-clicking it renames the plan in place, like headers do (Q55).

**Plan files:**
- an optional `name` field;
- a new plan from a file takes its name, or the file's name.

ADR 0005 is amended: an optional field, so no version bump.

**Guided start (Q53):** Start a blank plan makes a new plan and starts the tour, as today.

**Tests:**
- unit tests for the plan index and for migrating viewer state;
- e2e:
  - `files`, `import`, `blank-plan` and `guide` specs updated, since nothing replaces now;
  - a new `plans.spec.ts`: make, switch, rename, delete, undo the delete, reload.

**Records:** an ADR (0021, plans per browser), and amendments to Q26 and Q51 ("Superseded by Q66").

### 3. Two tabs, one plan

**`src/store/tabs.ts`:** a `BroadcastChannel` per plan ID.
- Local updates go out, and remote ones are applied with the channel as their origin, so undo never tracks them.
- A new tab says hello with its state vector, and any open tab replies with what it's missing.
- The plan index listens for `storage` events, so a rename or delete in one tab shows in the other.

**Tests:**
- unit tests with an in-memory channel pair;
- e2e with two pages in one browser context, over `file://`.

**Risk:** whether BroadcastChannel works between `file://` pages in Chromium _(priors: yes, since file pages share one origin for storage)_. The first commit checks it. If it doesn't work, the fallback is a "This plan changed in another tab: reload" notice.

### 4. Tester-ready

- `docs/demos/sprint-10.md`;
- an exit-criteria e2e;
- README ("several plans per browser");
- the cheat sheet (Legend);
- the release pass (`docs/housekeeping.md`).

## Engineering defaults (flag anything you'd veto)

- **Plan names:** a new blank plan is "Untitled plan", and the sample is "Sample plan". A name can repeat, since the ID is the identity.
- **The list's order:** last opened first.
- **No folders, search or sorting** in the plan list until someone has enough plans to need them.
- **Deleting a plan** asks nothing, and offers Undo, like deleting cards.
- **The schema 2 migration is one-way.** An older build, opened from disk afterwards, sees the board as it was before the migration. It can't see later changes.

## Risks

- **The migration touches every saved board.** The compatibility gate covers every released version, and slice 1 ships alone.
- **Slice 2 changes flows that many e2e tests use.** Load sample and New blank plan no longer replace the board. The tests change in the same PR, and the shared helper `openApp` (`e2e/app.ts`) absorbs most of it.
- **BroadcastChannel on `file://`.** It's checked first, and there's a fallback (slice 3).

## Verification

- `npm run check` and `npm run e2e` pass on every PR.
- The compatibility gate opens every earlier version's board through the migration.
- The merge-scenario store tests pass with schema 2's outcomes.
- The merge harness in `spikes/` is rerun against schema 2 for comparison, and its results are noted in slice 1's PR.
- **Manual walkthrough, from each slice's demo note:**
  - an old board survives the migration;
  - make, switch, rename, delete and undo plans;
  - two tabs follow each other.

