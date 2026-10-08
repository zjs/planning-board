# Sprint 9 demo: designing collaboration

Sprint 9 changed no app code. What's here is research, evidence and a plan. Start with the one-page summary, `docs/research/collaboration/README.md`, then try these.

## 1. Read what merges do today (5 minutes)

```
npm install
npx vitest run --config spikes/merge-scenarios/vitest.config.ts
```

Open `docs/research/collaboration/merge-results.md`. It holds 26 scenarios, each with what Alice and Bob did, what they'd expect, and what the board shows.

Look at:
- **L1:** two drops leave a card in two quarters;
- **O3:** an offline "New blank plan" wipes the shared board;
- **O4:** an hour of offline work lost to a deleted group.

Then read `merge-scenarios.md` for the fixes.

## 2. Share a board between two browsers (10 minutes, needs Go)

```
npx vite build --config spikes/sync-client/vite.config.ts
cd spikes/relay && go run . -static ../sync-client/dist
```

1. Open http://localhost:8787, choose **Load sample plan**, then **Share this plan (spike)**.
2. Copy the link into a private window.
3. In both windows:
   - drag a card, and watch it move in the other;
   - point at a card, and select one, and see your color on the other board, even in a different view.
4. In one window, press **Go offline**, then rename a card in each window.
5. Press **Go online**. Both boards have both changes, and the one that was away lists what happened.
6. Look in `spikes/relay/relay-data/`. It holds ciphertext only.

**Known gaps (it's a spike):**
- presence is drawn over the board, not built into it;
- one board per link is held in its own browser database, and there's no list of them;
- following someone isn't built.

## 3. Click through the experience (10 minutes)

Open the **[collaboration mockups](https://claude.ai/artifact/NQAtzJV6Mz7V3pFiR1N17x)**. Press Play on:
- **artboard 2,** two people reaching for one card: step through the four stages;
- **artboard 5,** since you were away: try "Use mine", "Restore", and "Mark all as seen".

The reasoning for each artboard is in `docs/research/collaboration/ux.md`.

## 4. Decide

Q58–Q65 in `docs/questions.md`. Q65 asks you to approve the four-sprint build plan in `docs/plans/m2-plan.md`.
