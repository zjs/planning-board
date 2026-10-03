# Sprint 6: engineering plan

Status: **approved 2026-10-03.** **Complete 2026-10-03.** Slices 1 and 2 were built together (#41), and slice 3 followed. Scope is in `docs/sprint-6.md`. This doc covers how engineering delivers it. The review process is unchanged from sprint 0 (`docs/plans/sprint-0-plan.md`, "Quality and review process").

## What this sprint has to prove

On a plan the size of a real import, can someone get from "where's the SSO work?" to those cards selected, in a couple of keystrokes, without the board rearranging under them?

## Research behind it

Engineering's survey on 2026-10-03, so the choices can be revisited with the same facts:

- **/ to search.** Gmail, GitHub, Linear and Jira all focus search with /. It probably comes from vi and `less` (recalled). On a Mac, ⌘⇧/ opens Help-menu search, which is a different feature.
- **Filter vs. search.** Trello keeps them apart. **F** filters cards in place on their lists and **X** clears the filter, while **/** searches across boards in a results window.
- **Whiteboards dim.** Miro's ⌘F highlights matches, dims everything else, and lists the results to jump to. FigJam is similar (recalled).
- **Structured filter bars.** GitHub Projects' `label:` and Jira's JQL suit list tools more than a whiteboard.
- **Slash commands.** In Notion and Slack, / opens a command menu, not search (recalled).

## Slices

| # | Slice | You can do this afterwards |
|---|---|---|
| 1 | **Find and dim** | Press /, type, and see matches bright, the count, and "N inside" on folded groups. Esc stops. |
| 2 | **Act on matches** | Enter selects every match, expanding as needed. ↓ and ↑ step through them. The find survives pivots. |
| 3 | **Tester-ready, and the release pass** | Use the demo note and the session row. Run an exit-criteria e2e. README, backlog and questions tidied, and compatibility fixtures for sprint 5's last commit. |

## Engineering defaults (my call; flag anything you'd veto)

- **A bar, not a toolbar field.** At 1440px, the default view's toolbar had 58px to spare, and the field needed about 150. So **/** opens a bar under the toolbar, like the pending-link bar. A magnifier button beside **?** opens it too. The bar has room for the count and the key hints. The board moves down by the bar's height when it opens; typing moves nothing.
- **Start of a word, every word.** "sso" finds *SSO session timeout policy* but not *Second payment processor*, where it falls in the middle of a word. Every word typed must match, so typing narrows.
- **⌘F stays with the browser.** It already finds the titles you can see.
- **Enter expands, but there's no undo for it.** Expanding is viewer state, as it is with E and "Show it on the board", so it's outside undo. ⇧E folds back.
- **A press on a card takes the keyboard out of the bar,** so E, L and Delete act on the board. With words typed, the bar stays open.
- **Not saved.** The words typed survive pivots, folds and expands, but not a reload.

## Risks I'm tracking

- **Dimming on a busy board.** About 150 cards at 28% opacity is still a lot of texture. The screenshots look fine in light and dark. The session will tell.
- **A matching group that Enter expands** leaves the board, and only its children are selected. Their chips still name it (ADR 0014).

## What I need from you

1. The combined session, now sprints 3–6, on your own import if you can.
2. The Firefox and Safari check, still open. Firefox claims / for its quick find; the board takes it while it has focus (recalled; worth a look).
