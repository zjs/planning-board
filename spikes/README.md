# Spikes

Throwaway experiments for sprint 9 (`docs/sprint-9.md`), which designs collaboration before any of it is built. Each spike answers a feasibility question with evidence, and its findings go into `docs/research/collaboration/`.

Nothing here ships:
- the app never imports from `spikes/`;
- lint, typecheck, the unit tests and the build all skip it;
- it isn't deployed to Pages.

A spike can import the app's real code (`src/commands/`, `src/domain/`), so its evidence is about our schema, not a toy one. If the app changes and a spike breaks, the spike is out of date, not the app.

| Spike | Question | Run |
|---|---|---|
| [`merge-scenarios/`](merge-scenarios/) | What does the board show after two people edit it at once, or one of them edits offline? | `npx vitest run --config spikes/merge-scenarios/vitest.config.ts` |
| [`relay/`](relay/) | Can a Go relay sync the board while seeing only ciphertext? | See its README |
| [`sync-client/`](sync-client/) | The browser side of the relay spike: encrypted Yjs sync, presence and history | See its README |
