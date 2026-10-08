# Collaboration: what sprint 9 found

Sprint 9 asked whether this board can be edited by several people at once, through a relay that never reads the plan, without anyone losing trust in what's on it. That covers live sessions and people who drop off the VPN for an hour.

**Short answer:** yes. The sync is the easy part. A Go relay that reads nothing synced the real board between two browsers. It costs about 50 bytes per edit, and a reconnect after offline work converged in tens of milliseconds. The hard part is what merges *mean*:
- in a harness of 26 two-person scenarios, every merge converged, but 17 didn't come out the way a person would expect;
- four small schema changes fix most of them;
- the rest need the board to show people what happened, not to stop them.

## What's recommended

1. **Change the document schema before writing any sync code** (ADR 0016):
   - single values stored as one value, not a set;
   - flat value keys;
   - deleting by marking, so it can be undone and restored;
   - values stored as maps.

   Today two people dropping one card in different quarters leaves it holding both, and the board picks one by ID. An hour-long offline session can lose someone's work to a deleted group without a word.
2. **Never block, always show.**
   - **No locks:** a card someone is dragging says so on everyone's board, and a lost race comes with a way back.
   - **Offline is always allowed:** on reconnecting, "Since you were away" marks what others changed on the board, and lists your changes that didn't stick, with "Use mine" or "Restore". Every shipped tool merges automatically, and the research project that tried reviewing before merging moved away from it.
3. **Anchor presence to cards, not to the screen** (ADR 0019). People can be in different pivots, so a cursor's position means nothing on someone else's board, but "pointing at *Invoice redesign*" does. Following someone means taking their view.
4. **A relay that numbers and stores ciphertext** (ADR 0017), with keys and write tokens from the link (ADR 0018):
   - edit and view-only links;
   - "make new links" to revoke, which says honestly that old links keep what they saw;
   - one container to self-host.
5. **History in its own encrypted document,** and one plan diff (ADR 0020) shared by history, "since you were away" and scenario compare.

**The cost** is four sprints (sprints 10–13, [`m2-plan.md`](../../plans/m2-plan.md)). Sprint 10 is still single-user and worth having on its own: the schema, more than one plan per browser, and two tabs syncing.

## Decisions for the PM

Each is in `questions.md`, with options and a recommendation:

- **Q58:** On a shared plan, should Open, Import and New blank plan make a new plan instead of replacing the shared one?
- **Q59:** Merge automatically after offline work, and show what happened, rather than review it first or block it?
- **Q60:** No locks: show drag intent, let the later drop win, tell both people?
- **Q61:** Card-anchored pointers and selections, a cursor setting, and following?
- **Q62:** Edit and view-only links, with new links to revoke?
- **Q63:** History in Activity and the inspector, kept for 90 days?
- **Q64:** A public demo relay: tabs in one browser first, a hosted relay later?
- **Q65:** Add these to M2's requirements, and approve the four-sprint plan?

## Risks worth knowing

- **Attribution is a courtesy, not an audit trail.** With no accounts, names are self-chosen, and anyone with an edit link can write anything.
- **Revoking access can't take back what someone already downloaded.** No end-to-end encrypted tool can.
- **Presence across different pivots is new.** No tool found does it, so it needs a session with real people.
- **The schema migration touches every saved board.** The compatibility gate is there for it.

## The research, by question

| Document | What it answers |
|---|---|
| [`prior-art.md`](prior-art.md) | How Figma, Excalidraw, tldraw, Linear, Notion, Google Docs, Jira, Actual and Ink & Switch handle collisions, offline work, presence, history and encryption |
| [`merge-scenarios.md`](merge-scenarios.md) | What our board shows after two people edit at once, and the schema fixes. Generated: [`merge-results.md`](merge-results.md), [`merge-encodings.md`](merge-encodings.md) |
| [`relay-and-sync.md`](relay-and-sync.md) | The relay, encrypted sync, self-hosting and the public demo. Generated: [`relay-measurements.md`](relay-measurements.md) |
| [`presence-and-history.md`](presence-and-history.md) | Card-anchored presence, three ways to record who changed what, and "since you were away" |
| [`ux.md`](ux.md) | The experience, with **[eight mockups](https://claude.ai/artifact/NQAtzJV6Mz7V3pFiR1N17x)** |

The spikes that produced the evidence are in [`spikes/`](../../../spikes/README.md). They're throwaway, and none of them ships.
