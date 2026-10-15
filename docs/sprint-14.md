# Sprint 14

## Goal

Make the relay safe to host for strangers, and show it (Q79, the backlog's theme N; `docs/plans/m2-plan.md`, sprint 14).

- **A threat model** with the relay's operator as the attacker: what they can and can't do, in plain words, and each claim tied to how it's established.
- **Formal checks, run in CI:**
  - a protocol proof that the operator can't read or forge a plan's content;
  - TLA+ specs of sync and of loop repair, covering offline work;
  - randomized schedules against the real code.
- **Keeping the operator out of the app's code** (Q80, answered after the threat model).
- **A hosted demo relay** (Q64 a), so a stranger can share from the public build with no setup.

The PM's answers (2026-10-15, in planning):
- **Security first.** "Since you were away" moves to sprint 15.
- **Q80 waits for the threat model.** The PM answers it before slice 5.
- **Yes to a hosted demo relay.** The PM creates the host account and runs the first deploy from written steps.
- **The formal work also covers collaboration**, including offline work, not only the operator: the sync protocol, loop repair, and the real code under random schedules.
- **"Since you were away" will be a quiet offer** (sprint 15, Q59): markers and a notice with **Show**. The panel opens by itself only when one of your own changes didn't stick.

The engineering plan is `docs/plans/sprint-14-plan.md`.

## Deliverables

### 0. Setup, and a small fix

- [ ] The maintenance pass recorded, and Dependabot's #93 merged.
- [x] Opening a share link with no name set asks for one (backlog D).

### 1. The threat model (Q79)

- [x] `docs/security/threat-model.md`: the attacker, what's protected and where it lives, each claim and how it's established, and findings, each one fixed, queued or accepted.
- [x] ADR 0024: which formal tools, and how CI runs them.
- [x] Q80 rewritten from the findings, for the PM.

### 2. The protocol proof

- [x] Secrecy of a plan's content and keys against the operator, and that a client accepts only messages sealed for that room and kind. The known limit (an operator holding a view link can write) is stated as an expected attack.

### 3. Sync, offline included (TLA+)

- [ ] The relay and its clients: offline work, crashes, reloads, restarts, restores and new links. Checked: everyone who reconnects converges, no offline edit is lost, nothing acknowledged is lost, and retired rooms and view links can't write.
- [ ] A cursor with no epoch starts again from nothing (the threat model's F10), with a test.

### 4. Loop repair, and the real code

- [ ] Concurrent nesting never leaves a cycle and converges (requirement 14).
- [ ] Random offline and online schedules through the real app and relay, checked for the same properties, with failing seeds replayable.

### 5. Keeping the operator out of the app (Q80)

- [ ] Links keep the sharer's page for an https relay, whatever `/config` says (F1).
- [ ] A relay mode that serves no app.
- [ ] The app's HTML is checksummed and attested, and the docs say how to check it.
- [ ] Whatever else Q80's answer adds.

### 6. The hosted demo relay (Q64 a)

- [ ] Idle plans expire after 30 days, with public limits and a privacy note.
- [ ] Deploy steps for the PM.
- [ ] Share on the public build offers the demo relay by default.

### 7. Tester-ready

- [ ] A demo note (`docs/demos/sprint-14.md`), exit-criteria tests, the user-facing docs, and the release pass (v0.14.0).

## Deferred (don't build)

- **Since you were away:** sprint 15.
- **Signing updates (Ed25519),** unless the threat model finds the demo needs it.
- **Hiding metadata** from the operator: an accepted limit (Q79).

## Exit criteria

Sprint 14 is done when the PM can do all of the following with the latest `main`:

1. Read the threat model and find, in plain words, what an operator can see, what they can't, and why.
2. Open a CI run and see the protocol proof, both TLA+ specs and the randomized schedules pass.
3. Open a share link in a profile with no name, and be asked for one.
4. Start a relay that serves no app, and use it from the release's HTML file, after checking that file against its published checksum.
5. From https://zjs.github.io/planning-board/, share a plan on the demo relay with no setup, and open it from a second profile. The relay's own address serves no app, and its privacy note says what it can see.
