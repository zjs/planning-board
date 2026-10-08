# Sprint 9

## Goal

Design collaboration (M2, requirements 30–32) before building any of it.

Every edit so far has come from one person, so nobody has seen how this board behaves when two people change it at once. The trouble spots are:

- two people dragging the same card;
- someone working off the VPN for an hour and then reconnecting;
- a group deleted while someone else edits a card inside it.

The board is only useful if everyone trusts what's on it, so a merge that surprises people costs more here than in most tools. This sprint finds out what would surprise them, what's feasible inside end-to-end encryption, and what the experience should be. It ends with a build plan for M2.

The PM chose this sprint over contention and the conflicts panel (2026-10-08). The PM's answers:

- **Output:** research documents plus throwaway spikes, which produce evidence and never ship.
- **Encryption:** the relay never reads plan content. This is fixed. The research writes down what it costs.
- **A relay for the public demo:** decided after the research.
- **Go deepest on:** live-session collisions, knowing who changed what, and offline divergence.

Scope: research, spikes and documents. The app doesn't change.

## Deliverables

Research documents go in `docs/research/collaboration/`, and spikes in `spikes/`.

### 1. Prior art

- [x] How about a dozen tools and research projects handle merging, offline work, presence, history and encryption, side by side, and what each choice cost them (`prior-art.md`).

### 2. Merges on our own schema

- [x] A harness that runs about 25 two-person scenarios through the app's real commands, syncs them, and records what the board shows afterwards (`spikes/merge-scenarios/`).
- [x] For each surprise, a reading and the smallest fix (`merge-scenarios.md`).

### 3. A relay and encrypted sync

- [ ] A Go relay that forwards and stores only ciphertext, plus a browser client that encrypts Yjs updates with the key in the link (`spikes/relay/`, `spikes/sync-client/`).
- [ ] An automated run with two browsers that edit, go offline, reconnect and converge, which checks that the relay's storage holds no plan text.
- [ ] Measurements of the cost of each catch-up after a disconnect, and of encryption, plus what self-hosting and a public demo would take (`relay-and-sync.md`).

### 4. Presence and who changed what

- [ ] In the spike, both people see each other's cursors, selections and in-progress drags.
- [ ] A comparison of three ways to record who changed what, with their cost.
- [ ] A prototype "since you were away" summary built on a plan diff (`presence-and-history.md`).

### 5. The experience

- [ ] Designs for each of these, each tied to the question it answers (`ux.md`, plus a clickable mockup):
  - presence;
  - collisions;
  - connection states;
  - reconnecting;
  - history;
  - sharing;
  - following a driver.

### 6. Decisions and the build plan

- [ ] New questions for the PM, each with a recommendation, starting at Q58.
- [ ] Draft ADRs, marked Proposed.
- [ ] M2 split into thin build slices over sprints 10 and later.
- [ ] A one-page summary (`docs/research/collaboration/README.md`).

## Deferred (don't build)

- **Collaboration in the app itself.** It's built from the plan this sprint produces, starting in sprint 10.
- **To sprint 10's candidates:**
  - component contention, the conflicts panel and reviewed conflicts (requirements 17–20);
  - what the combined session decides (Q56, Q46 c, the palette, Q23).
- **Out of scope as before:** scenarios, filters and saved views.

## Exit criteria

Sprint 9 is done when the PM can do all of the following:

1. Read the summary and know what's recommended, what it costs, and which decisions are theirs.
2. Run the merge harness with one command, and read which two-person edits would surprise someone.
3. Start the relay, open two browsers on one encrypted link, edit in both, take one offline, and see them converge on reconnecting. The relay's storage holds no plan text.
4. Click through the mockups for presence, collisions, offline work and history.
5. Answer the new questions, and approve or amend the M2 build plan.

The combined cold-start session (sprints 3–8) can run during this sprint, since the app doesn't change.
