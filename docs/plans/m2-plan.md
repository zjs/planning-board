# M2: the build plan

Status: **approved in outline 2026-10-08** (Q65). Each sprint still starts in plan mode, and its slices are sketched here only to show the order and the size. Sprint 9 produced the plan. The research behind it is in [`docs/research/collaboration/`](../research/collaboration/README.md).

M2 is requirements 30–36, as sprint 9 reshaped them. The PM's answers (2026-10-08):
- **Q58:** on a shared plan, Open, Import and New make a new plan;
- **Q59:** offline is always allowed, and merges automatically;
- **Q60:** no locks: show drag intent, and tell both people when two move one card;
- **Q61:** card-anchored presence and a cursor setting, and **no following**;
- **Q62:** edit and view-only links, and new links to revoke;
- **Q63:** history kept forever, with times normalized to each viewer's time zone;
- **Q65:** history and "since you were away" as sprints of their own.

**Still open:** Q64, the public demo relay and fallbacks for companies that block it.

It's five sprints. Each ends in something the PM can use, and the first two are worth shipping even if M2 stopped there.

## Sprint 10: foundations, still single-user

What it proves: the board is ready to be shared, and nothing a single user does changes.

| # | Slice | You can do this afterwards |
|---|---|---|
| 1 | **Schema 2** (ADR 0016): flat value keys, single values as one value, tombstones, values as maps; a migration from version 1, with compatibility fixtures first | Open any old board or plan file, and see nothing different. Undoing a delete restores the group instantly. |
| 2 | **Several plans per browser** (Q58, requirement 34): the File menu lists your plans; Open, Import and New blank plan make a new plan | Keep a scratch plan beside the real one, and switch between them. |
| 3 | **The plan diff in `src/domain/`** (ADR 0020), tested with the merge harness's scenarios | Nothing visible yet. It's the shared piece for sprints 13 and 14, and for scenario compare. |
| 4 | **Two tabs, one plan:** the provider over BroadcastChannel, with no server | Open a plan in two tabs, edit in one, and watch the other follow. This is the first taste of collaboration, and the public demo's first step (Q64 d). |

## Sprint 11: the relay

What it proves: two people on two computers share a plan, end to end encrypted, and either can go offline and come back.

| # | Slice | You can do this afterwards |
|---|---|---|
| 1 | **The relay, for real** (ADR 0017): it moves from `spikes/` to `relay/`, with binary frames, write tokens, quotas, an origin check and relay receive times, Go tests in CI, and a container image | Run one container on a company machine, or on your own laptop for a pilot (Q64 e). |
| 2 | **Share and join** (ADR 0018, Q62, requirement 33): the Share dialog, edit and view-only links, your name on the board | Share a plan, and open it on another computer. |
| 3 | **The connection pill, and offline** (Q59, requirement 35): live, reconnecting, offline with a count, view-only | Go off the VPN, keep working, come back, and converge. |
| 4 | **Loop repair** (ADR 0004) and the merge harness's scenarios as store tests | Two people nesting cards inside each other's at once leaves one nest, not two loose cards. |

## Sprint 12: seeing each other

What it proves: a live session feels like a whiteboard, and collisions are rare and recoverable.

| # | Slice | You can do this afterwards |
|---|---|---|
| 1 | **Presence** (ADR 0019, Q61, requirement 32): avatars, card-anchored pointers, selections, and the cursor setting (Everyone, Driver only, None) | See who's here and what they're pointing at, in your own view. Quiet the cursors in a big session. |
| 2 | **Drag intent, and collision notices** (Q60, requirement 31) | See "Ada is moving this". Reach for the same card and be warned. Lose a race and get a way back. |
| 3 | **New links, and self-hosting docs** (Q62) | Revoke a link. Run the relay from the README. |

Then a tester session with three people live, and one working offline.

## Sprint 13: history

What it proves: anyone can find out who changed what, and when, in their own time zone.

| # | Slice | You can do this afterwards |
|---|---|---|
| 1 | **The history document** (ADR 0020, Q63, requirement 36): its own encrypted document, entries in UTC with the relay's receive time, loaded after the board | Nothing visible yet, but every change from here on is recorded. |
| 2 | **Activity:** a feed for the whole plan, by day, filterable by person, with Restore on deletions | See what happened this week, and restore a deleted group. |
| 3 | **A card's history** in the inspector, and "last changed by" | See who moved this card to Q3, and when. |

## Sprint 14: since you were away

What it proves: coming back to a shared plan, you know what happened, and nothing of yours is lost without a way back.

| # | Slice | You can do this afterwards |
|---|---|---|
| 1 | **Change markers on the board,** built so that scenario compare (requirement 23) can reuse them | See which cards changed, and where a moved card was. |
| 2 | **The panel** (Q59, requirement 35): others' changes, and yours that didn't stick, with "Use mine" and "Restore", and stepping through them on the board | Come back after a day, and step through what changed. |
| 3 | **The public demo,** as Q64 decides | Depends on Q64. |

## Risks

- **The schema migration is the riskiest step,** since it touches every saved board. The compatibility gate (ADR 0005) exists for this, and the migration ships alone in sprint 10, slice 1.
- **Presence across pivots is new.** No other tool does it, so the sprint 12 session matters more than usual.
- **Testing needs more than one person.** The automated two-browser test from the spike carries over, but feel needs people.
- **History kept forever grows forever.** It's about 6 MB after 100,000 changes _(priors)_, loaded after the board, so opening a plan stays fast. If it becomes a problem, older history can move to its own snapshot without losing anything.
- **Contention and the conflicts panel wait five sprints.** They're independent of M2, and could be slotted in between sprints if the PM prefers.
