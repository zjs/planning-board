# Spike: encrypted sync, presence and history on the real board

The browser side of the relay spike (`docs/sprint-9.md`, deliverables 3 and 4). The real app is built with one module swapped: `vite.config.ts` aliases `src/store/persistence.ts` to `persistence.ts` here, and no other line of the app changes. The reading is in `docs/research/collaboration/relay-and-sync.md` and `presence-and-history.md`.

| File | What it is |
|---|---|
| `crypto.ts` | AES-GCM with the key in the link's fragment |
| `provider.ts` | The Yjs provider: sequence numbers, a shadow of what the relay holds, client-made snapshots, encrypted presence. Runs in browsers and in Node |
| `persistence.ts` | The swapped-in module: a shared room per link, in its own IndexedDB database, and a "Share this plan" button |
| `presence.ts` | Card-relative presence, the connection panel, history and "since you were away", drawn over the board |
| `history.ts`, `diff.ts` | Who changed what: a plan diff in words, recorded after each command |
| `bench.ts` | Measurements against the real relay: `node spikes/sync-client/bench.ts` |
| `collab.spec.ts` | Two browsers on one link, through the relay |

```
npx vite build --config spikes/sync-client/vite.config.ts
npx playwright test --config spikes/sync-client/playwright.config.ts
node spikes/sync-client/bench.ts
```

This is a spike. It isn't linted, or run in CI. `npx tsc -p spikes` typechecks it.
