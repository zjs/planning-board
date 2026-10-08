# Sprint 11

## Goal

Two people on two computers share a plan, end-to-end encrypted, and either can go offline and come back (`docs/plans/m2-plan.md`, sprint 11). The relay never reads a plan.

- **The relay, for real** (ADR 0017): one Go program that serves the app and passes encrypted changes between people, run by a company or on one person's laptop for a pilot (requirement 37).
- **Loop repair** (ADR 0004, requirement 14), first, so every build that can share agrees on how to settle two people nesting cards inside each other's.
- **Share and join** (ADR 0018, requirements 30 and 33): Can edit and Can view links.
- **The connection pill** (Q59, requirement 35): live, reconnecting, or offline with what hasn't been shared yet.

The PM's answers (2026-10-08):
- **Share turns the plan you're on into the shared plan,** marked as shared in File › Your plans (Q68).
- **The relay comes as downloads for Mac, Linux and Windows, and as a container** (Q69).
- **A build the relay doesn't serve asks for a relay address** when you share, and remembers it (Q70).

The engineering plan is `docs/plans/sprint-11-plan.md`.

## Deliverables

### 1. The relay, for real (ADR 0017)

- [x] `relay/`: rooms are created explicitly, and only someone with the edit link's write token can change one. A view link reads and can't write.
- [x] A versioned binary protocol, receive times, compacted log kept for 30 days, an origin check, and limits on size, rooms and rates.
- [x] It serves the app, and on a laptop prints the address colleagues can open.
- [x] Go tests in CI. Downloads for Mac, Linux and Windows, and a container image, published after CI passes on `main`.

### 2. Loop repair (ADR 0004)

- [x] Two people nesting cards inside each other's at once leaves one nest, and every computer agrees which. The card that loses goes back where it was.

### 3. Share and join (ADR 0018)

- [x] Share asks your name once, and a relay address when the app wasn't opened from one, then gives a Can edit and a Can view link.
- [x] Opening a link adds the plan to File › Your plans, or opens it if it's already there. The key leaves the address bar once it's saved.
- [x] A view link shows the plan and its changes, and nothing on the board can change it.
- [x] Replace this shared plan from a file, as a separate, warned choice (Q58).

### 4. The connection pill, and offline (Q59)

- [x] On a shared plan: Live, Reconnecting…, Offline · N changes not shared yet, View only, and Can't reach the relay.
- [x] Offline is always allowed, and both sides converge when it reconnects.

### 5. Tester-ready

- [x] A demo note (`docs/demos/sprint-11.md`), an exit-criteria test with a real relay, the README's "Run your own relay", the cheat sheet, and the release pass.

## Deferred (don't build)

- **"Make new links" to revoke, and the hosting docs:** sprint 12.
- **Presence, drag intent and collision notices:** sprint 12.
- **History:** sprint 13. **Since you were away, and the hosted demo relay:** sprint 14.

## Exit criteria

Sprint 11 is done when the PM can do all of the following with the latest `main`:

1. Download the relay for their computer, run it, and open the address it prints: the board appears.
2. Share a plan from it: give a name, and get a Can edit and a Can view link.
3. Open the Can edit link in another browser or on another computer: the plan appears. Drag a card on one, and it moves on the other.
4. Open the Can view link: the plan shows, says View only, and nothing on it can be changed.
5. Go offline on one side and keep editing: the pill counts what hasn't been shared. Reconnect, and both boards match.
6. On the public build, Share asks for the relay's address.
7. Look in the relay's data folder: no card titles.
