# 0014: Find dims, it doesn't filter

Status: Accepted (sprint 6, slices 1–2).

## Context

During a demo (2026-10-03), a viewer asked to press **/** and type to narrow the board. The PM chose to have non-matching cards dim rather than hide, to match card text only (title, Jira key, description), and to ship this before the sprint 3–5 tester session (questions.md Q50).

Requirement 9 (filters) is still deferred. A filter hides cards, which changes the layout. That raises questions this board hasn't answered: lanes that empty out, links to hidden cards, and a board that reshuffles as you type. Spatial memory is already a named risk ("Pivoting erases spatial memory" in `requirements.md`).

## Decision

**Find is a viewer-state overlay on the layout, never a change to it.** `layoutView` is untouched. `findOnBoard(plan, layout, words)` in `src/domain/finding.ts` reads the finished layout and returns three things:

- `shown`: the matches with a copy on the board, including cards framed by a group's faded copy.
- `inside`: the matches folded into a group, keyed by the card on the board they're folded into.
- `matches`: every match in board order, each folded match right after the card it's in. This is the order ↓ and ↑ step through.

An expanded group isn't on the board, because its children take its place, so it can't match there.

**Matching.** Every word typed must start a word in the card's title, Jira key or description. Case and accents are ignored (NFD, then marks stripped). A word is a run of letters and digits, so "PAY-12" is the words "pay" and "12". Matching the start of a word, rather than anywhere in it, keeps "sso" from finding "proce**sso**r". That was the first false match in the sample plan.

**On the board.**

- A card dims when it isn't in `shown` and has nothing in `inside`. A card with folded matches stays bright, with an "N inside" pill.
- Red lines dim when neither end is bright.
- Focus lines and copy lines don't dim, because they only appear for the card you're pointing at or have selected.
- Hovering a dimmed card brings it forward.
- Dimmed cards drag, select and edit as usual.

**Acting on matches.** Both reuse paths that already exist, so there's nothing new to undo:

- **Enter** expands every group that hides a match, the way "Show it on the board" does, selects the matches, and gives the keyboard back to the board, so E, L and I act on them.
- **↓/↑** call the same reveal (`revealCard`): expand, select, flash, and scroll into view.

**Where it lives.** **/** opens a bar under the toolbar, like the pending-link bar. A magnifier button beside **?** does the same for anyone who doesn't know **/**. A field in the toolbar didn't fit: at 1440px the default view's toolbar had 58px to spare. The query survives pivots, folds and expands, and isn't saved. A press on a card takes the keyboard out of the field: the drag stops the browser moving focus, and E or L would otherwise be typed into the field.

## Alternatives

- **Hide non-matches.** This is requirement 9's filter, and it changes the layout. Left for when filters are scheduled. They could build on `findOnBoard` by passing the matches to `layoutView`.
- **Claim ⌘F.** Miro and FigJam do. The browser's own find already works on titles you can see, so ⌘F stays with the browser until the tester session shows whether people reach for it.
- **Match anywhere in a word.** This is closer to the browser's find, but noisy on short queries such as "sso" and "api".
- **Values and syntax** (`team:Payments`). ⇧-click on a badge (Q47) already selects by value. Syntax isn't discoverable for this audience.

## Consequences

- No change to the plan file or the Yjs document, so there's no compatibility fixture.
- When Enter expands a group that itself matches, the group leaves the board and only its children are selected. Their chips still name it.
- Filters (requirement 9), when they come, can reuse the matching and the bar, and add a "hide the rest" toggle.
