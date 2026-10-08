# Spike: merge scenarios

What does the board show after two people edit it at once, or one of them works offline and reconnects? See `docs/sprint-9.md`, deliverable 2.

```
npx vitest run --config spikes/merge-scenarios/vitest.config.ts
```

This writes two generated files into `docs/research/collaboration/`:

- `merge-results.md`: every scenario in `scenarios.ts`, each run twice with the two people's Yjs client IDs swapped, plus the random edits in `fuzz.ts`.
- `merge-encodings.md`: the candidate fixes in `encodings.test.ts`, tried on bare Yjs.

The reading of both is `docs/research/collaboration/merge-scenarios.md`.

**How it works.** `harness.ts` gives two people, Alice and Bob, their own Yjs documents, started from the same ten-card board. They edit through the app's real commands (`src/commands/store.ts`), and `sync` exchanges what each is missing, as a relay would. Client IDs are fixed, so every run gives the same files.

This is a spike. It isn't linted, typechecked or run in CI. When collaboration is built, its scenarios become unit tests of the store.
