# 0021: Several plans per browser

Status: Accepted (sprint 10, slice 2). The product side is Q58, Q66 and Q67, answered on 2026-10-08.

## Context

Requirement 34 and Q58: once plans are shared, a browser holds several of them, shared ones and ones only on that computer, and opening a file, importing or starting a blank plan must never replace a shared plan for everyone. Q66 made that the rule on every plan, shared or not: nothing replaces a board any more. Until now a browser kept one board, in one IndexedDB database, with its view and folding in localStorage.

## Decision

- **The list of plans is in localStorage,** `planning-board:plans`: each plan's id, name, when it was made and last opened, whether a person chose its name, and, briefly, when it was deleted. localStorage is read synchronously and shared by every tab, so a change shows everywhere at once (slice 3 listens for it).
- **Each plan has its own database,** `planning-board:v2:plan:<id>`. The board a browser had before becomes the first plan, "My plan", and keeps its database (`planning-board:v2:default`, ADR 0016) and its viewer-state keys, so nothing moves.
- **The plan's name is also in its document,** in the `meta` map, outside undo. It's the one that will travel with a shared plan, so on opening it wins over the list.
- **Viewer state is per plan:** the view, folded bands, expanded groups and collapsed holding lanes. Their keys gain `:<id>`, except the first plan's. Chips or cards in holding lanes, and the hints seen, stay per browser. The guided start (Q53) remembers which plan it's running in, and waits there while another is open.
- **The link names the plan,** `#plan=<id>`. With no link, or a link to a plan this browser doesn't have, the app opens the plan used last.
- **New, Open, Import and Load sample each make a new plan,** filled outside undo: there's nothing to undo back to but deleting it. An untouched empty plan (empty, with a name nobody chose) is replaced rather than kept, so a first visit and the guided start leave no litter.
- **Delete plan** hides the plan from the list and opens the one used last, or a new empty plan. A notice offers Undo for 8 seconds, then the database is dropped. A page closed during those seconds leaves the plan marked; the next start drops any plan marked more than a minute ago.
- **The board is a `Workspace` per plan,** keyed by its id, so selection, panels and undo never carry over from one plan to another. Plans are opened through `openPlanStore(id)`, cached per page, and closed when another plan is shown.

## Alternatives

- **The list in IndexedDB.** It's asynchronous, and a list of a few dozen entries doesn't need it.
- **Every plan in one Yjs document.** Every plan would load to show one, and sharing one would mean splitting it out later.
- **Replace after asking, as before (Q26, Q51).** It's one wrong click from losing a shared plan for everyone (O2 and O3 in sprint 9's merge harness), and the PM chose a new plan every time (Q66).

## Consequences

- **Undo no longer reaches across an open or import.** The plan you were on is still there, in the File menu.
- **Plans with the same name are allowed,** since the id is the identity. The list shows them last opened first.
- **No folders, search or sorting yet,** until someone has enough plans to need them.
- **A browser's plans live in its storage.** Clearing site data clears them, as it always cleared the board; saving to a file is still the backup.
