# Sprint 10

## Goal

Lay M2's foundations while the board is still single-user (`docs/plans/m2-plan.md`, sprint 10). Each piece ships and gets accepted on its own, before anyone shares a plan.

- **A document schema that merges well** (ADR 0016). Sprint 9's merge harness found four places where today's layout converges to the wrong thing. Once plans are shared, the schema lives on many computers, so it changes now.
- **Several plans per browser** (Q58, requirement 34): a scratch plan beside the real one.
- **Two tabs of one plan stay in sync.** Today they silently diverge until a reload. This is the first collaboration anyone sees.

The PM's answers (2026-10-08):
- **On any plan,** Open plan file, Import CSV, New blank plan and Load sample plan each make a new plan, and "Reset board" becomes "Delete plan", with Undo (Q66).
- **The plan list lives in the File menu,** and the toolbar shows the plan's name, which you can rename (Q67).

Scope: single user, browser only, no server.

## Deliverables

### 1. Schema 2 (ADR 0016)

- [ ] A single-valued property holds one value, and values are flat keys on the card, so concurrent drops leave exactly one value, and a card's first value is no different from later ones.
- [ ] Deleting marks cards and values as deleted, rather than removing them. Undo restores them exactly, and anything inside a deleted group hides with it.
- [ ] A value's name, parent and position are separate keys.
- [ ] Every board saved by an earlier build opens through a one-time migration, with nothing lost. The compatibility gate covers every released version.
- [ ] The merge harness's scenarios are store tests, with schema 2's outcomes.

### 2. Several plans (Q58, Q66, Q67)

- [ ] The toolbar shows the plan's name. Double-click it to rename.
- [ ] The File menu lists your plans, last opened first, and switches between them. The app opens the plan used last, and the link names it (`#plan=…`).
- [ ] New blank plan, Open plan file, Import CSV and Load sample plan each make a new plan. An untouched empty plan is reused, not kept.
- [ ] Delete plan replaces Reset board, with Undo.
- [ ] The view, folded bands, expanded groups and collapsed holding lanes are remembered per plan.
- [ ] Today's board becomes the first plan, "My plan".

### 3. Two tabs, one plan

- [ ] The same plan open in two tabs stays in sync as you edit. Undo in one tab reverses only that tab's edits.
- [ ] Renaming or deleting a plan shows in other tabs.

### 4. Tester-ready

- [ ] A demo note (`docs/demos/sprint-10.md`), an exit-criteria e2e, the cheat sheet, the README, and the release pass.

## Deferred (don't build)

- **The relay, share links, presence, history and "since you were away":** sprints 11–14 of the M2 plan.
- **The plan diff:** moved to sprint 13, where history first uses it.
- **Contention, the conflicts panel, and what the combined session decides:** later candidates in `docs/backlog.md`.

## Exit criteria

Sprint 10 is done when the PM can open the latest `main` build and do all of the following:

1. Open a browser that used an earlier build, and find the board as it was, now called "My plan". Open a plan file from sprint 8, and get everything back.
2. Delete a group with stories inside, undo, redo, undo again, and reload: the group and its stories are exactly as they were.
3. Choose File › Load sample plan: it opens as a new plan, and "My plan" is still in the File menu. Switch between them.
4. Rename the sample from the toolbar, reload, and see the new name.
5. Choose New blank plan, type a few ideas, then Delete plan, and Undo.
6. Open the sample in two tabs. Drag a card in one, and see it move in the other. Undo in the other tab does nothing to that drag.
