# M2: the build plan

Status: **proposed 2026-10-08,** for the PM's approval with Q58–Q65. Sprint 9 produced it. The research behind it is in [`docs/research/collaboration/`](../research/collaboration/README.md).

M2 is requirements 30–32 (share links, live editing, presence), plus what Q65 proposes adding: view-only links, "since you were away", history, following, and more than one plan per browser.

It's four sprints. Each ends in something the PM can use, and the first two are worth shipping even if M2 stopped there. Each sprint starts in plan mode as usual, and its slices are sketched here only to show the order and the size.

## Sprint 10: foundations, still single-user

What it proves: the board is ready to be shared, and nothing a single user does changes.

| # | Slice | You can do this afterwards |
|---|---|---|
| 1 | **Schema 2** (ADR 0016): flat value keys, single values as one value, tombstones, values as maps; a migration from version 1, with compatibility fixtures first | Open any old board or plan file, and see nothing different. Undoing a delete restores the group instantly. |
| 2 | **More than one plan per browser** (Q58): the File menu lists your plans; Open, Import and New blank plan make a new plan | Keep a scratch plan beside the real one, and switch between them. |
| 3 | **The plan diff in `src/domain/`** (ADR 0020), tested with the merge harness's scenarios | Nothing visible yet. It's the shared piece for slices in sprints 12 and 13, and for scenario compare. |
| 4 | **Two tabs, one plan:** the provider over BroadcastChannel, with no server | Open a plan in two tabs, edit in one, and watch the other follow. This is the first taste of collaboration, and the public demo's first step (Q64 d). |

## Sprint 11: the relay

What it proves: two people on two computers share a plan, end to end encrypted, and either can go offline and come back.

| # | Slice | You can do this afterwards |
|---|---|---|
| 1 | **The relay, for real** (ADR 0017): it moves from `spikes/` to `relay/`, with binary frames, write tokens, quotas and an origin check, Go tests in CI, and a container image | Run one container on a company machine. |
| 2 | **Share and join** (ADR 0018, Q62): the Share dialog, edit and view-only links, your name on the board | Share a plan, and open it on another computer. |
| 3 | **The connection pill, and offline** (Q59): live, reconnecting, offline with a count, view-only | Go off the VPN, keep working, come back, and converge. |
| 4 | **Loop repair** (ADR 0004) and the merge harness's scenarios as store tests | Two people nesting cards inside each other's at once leaves one nest, not two loose cards. |

## Sprint 12: seeing each other

What it proves: a live session feels like a whiteboard, and collisions are rare and recoverable.

| # | Slice | You can do this afterwards |
|---|---|---|
| 1 | **Presence** (ADR 0019, Q61): avatars, card-anchored pointers, selections, the cursor setting | See who's here and what they're pointing at, in your own view. |
| 2 | **Drag intent, and collision notices** (Q60) | See "Ada is moving this". Reach for the same card and be warned. Lose a race and get a way back. |
| 3 | **Following** (Q61) | Ask everyone to follow you, and drive a session from your own laptop. |

Then a tester session with three people live, and one working offline.

## Sprint 13: who changed what

What it proves: coming back to a shared plan, you know what happened, and nothing of yours is lost without a way back.

| # | Slice | You can do this afterwards |
|---|---|---|
| 1 | **History** (ADR 0020, Q63): its own document, Activity, and the inspector's History tab, with Restore | See who moved a card and when, and restore a deleted group. |
| 2 | **Since you were away** (Q59): markers on the board, the panel, "Use mine" and "Restore" | Come back after a day, and step through what changed. |
| 3 | **New links,** self-hosting docs, and the public demo relay if the PM chooses it (Q64) | Revoke a link. Run the relay from the README. |

## Risks

- **The schema migration is the riskiest step,** since it touches every saved board. The compatibility gate (ADR 0005) exists for this, and the migration ships alone in sprint 10, slice 1.
- **Presence across pivots is new.** No other tool does it, so the sprint 12 session matters more than usual.
- **Testing needs more than one person.** The automated two-browser test from the spike carries over, but feel needs people.
- **Contention and the conflicts panel wait four sprints.** They're independent of M2 and could be slotted in between sprints 11 and 12 if the PM prefers.
