# 0001: Frontend framework and build tooling

Status: Accepted (sprint 0, slice 1)

## Context

Browser-only app, TypeScript strict, built and maintained mostly by an AI engineer for an open-source audience. The PM (and testers) receive each build as a file, not a URL, until hosting exists (questions.md Q5), so the build must work when opened straight from disk. The core interaction is drag-and-drop on a board of up to a few hundred cards.

## Decision

- **React 19** for UI. Plain components and hooks; UI state stays local, plan state comes from snapshots (see CLAUDE.md storage rule).
- **Vite 8** to build, with **vite-plugin-singlefile** so `dist/index.html` inlines all JS and CSS. No external requests, works over `file://`.
- **TypeScript 6.0**, strict plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Not 7.x yet: typescript-eslint supports up to 6.0.
- **Vitest** for unit tests, **Playwright** (Chromium) for end-to-end tests run against the built file over `file://`, **ESLint** with typescript-eslint's strict type-checked rules. A lint rule enforces that `src/domain/` imports no UI or Yjs code.

Runtime dependencies introduced: `react`, `react-dom`, `fractional-indexing` (order keys for sequence and value order; ~1 kB, no dependencies).

## Alternatives

- **Svelte / Solid / Preact.** Smaller and faster, but 150 cards is nowhere near React's limits, and React is what most would-be contributors already know. Preact would shrink the file (~250 kB now) but adds compat edge cases for no user-visible gain.
- **No framework.** Fine for a read-only board; gets expensive once drag previews, undo, and inline editing arrive.
- **Multi-file build.** Standard, but it needs a web server; a file opened from disk can't load ES modules from sibling files in most browsers.

## Consequences

- One HTML file is the whole app: easy to attach to a PR, email to a tester, or host later on Pages unchanged.
- The file grows with every dependency. Watch it; above ~1 MB, revisit.
- When typescript-eslint supports TS 7, upgrade (faster typecheck, same code).
