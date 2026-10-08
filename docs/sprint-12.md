# Sprint 12

## Goal

A live session feels like a whiteboard, and collisions are rare and recoverable (`docs/plans/m2-plan.md`, sprint 12). People on a shared plan see each other, not just each other's edits.

- **Presence** (ADR 0019, requirement 32): avatars, and each person's pointer, selection and drag, anchored to cards so they show in any view. A cursor setting quiets pointers in a big session.
- **Collisions** (Q60, requirement 31): a card someone is dragging says so on everyone's board. When two people move one card, the later drop wins, and both are told, with a way back.
- **New links** (Q62, requirement 33): Make new links cuts off the old ones. People who had them keep what they already saw.
- **Where no hosted relay is allowed** (requirement 37): hosting docs for a server or a pilot's laptop, and changes by file through email or a shared drive, with no relay at all.

The PM's answers (2026-10-08):
- **The driver is claimed by clicking "I'm driving",** one at a time; a new claim takes over (Q71).
- **A changes file carries no key.** Share by file gives a short Can edit link, sent once another way (Q72).

The engineering plan is `docs/plans/sprint-12-plan.md`.

## Deliverables

### 1. Presence (ADR 0019, Q61, Q71)

- [x] Avatars beside the connection pill: one per person, however many tabs they have open.
- [x] Each person's pointer and selection, in their color, on the same cards in your own view.
- [x] I'm driving, and a cursor setting: Everyone, Driver only, or None.

### 2. Drag intent and collisions (Q60)

- [ ] A card being dragged says "Ada is moving this → Q3 · Billing" on everyone's board, and a second person's drag is warned.
- [ ] When two people move one card, both are told who won, each with a way back.

### 3. New links, and hosting (Q62, Q64 e)

- [ ] Make new links: old links turn read-only and say why; people who had them keep what they saw.
- [ ] Hosting docs: a server behind HTTPS, upgrades, backup and restore, and a pilot on a laptop.

### 4. Changes by file (Q64 f, Q72)

- [ ] Share by file, Send changes and Merge changes: a shared plan travels as an encrypted file, with no relay.

### 5. Tester-ready

- [ ] A demo note and session script (`docs/demos/sprint-12.md`), exit-criteria tests, the cheat sheet, the README, and the release pass.

## Deferred (don't build)

- **History,** and who changed what: sprint 13.
- **Since you were away,** and the hosted demo relay: sprint 14.
- **Following another person's view** (Q61 said no).

## Exit criteria

Sprint 12 is done when the PM can do all of the following with the latest `main`, on a relay with three browser profiles:

1. See an avatar for each person. Point at a card: the others see the pointer on that card, even in a different view.
2. Select cards: the others see them outlined in your color.
3. Click I'm driving: everyone sees who's driving. Set Driver only: only the driver's pointer shows.
4. Drag a card: the others see who's moving it and where. Two people drop the same card: both are told, and each has a way back.
5. Make new links: someone on an old link sees it was replaced, and keeps the plan; the new link opens it as it is now.
6. Share a plan by file, send changes, and merge them in another browser, with no relay running. A file without its link can't be opened.
7. Run the relay on a server from `docs/hosting.md`.
