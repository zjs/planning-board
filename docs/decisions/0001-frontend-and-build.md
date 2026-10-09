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

## Amendment (2026-10-09): third-party notices travel inside the file

The packages bundled into the file are MIT, apart from one CC0, and MIT asks for its copyright and permission notice to be kept with every copy. The minified build dropped the comments that carried them. So a small Vite plugin (`scripts/notices.ts`) lists every package the build actually bundles, read from the bundle's own module ids rather than from `package.json`, so a dependency that isn't bundled isn't listed and one that is can't be missed. It puts each package's license text into the page as a plain-text `<script type="text/plain" id="third-party-notices">`, which isn't run. The cheat sheet shows it under **Open-source licenses**, and the relay prints it with `-licenses` (ADR 0017, amended).

- A bundled package with no license file fails the build, so a new dependency can't arrive without its notice.
- It costs about 16 KB, which is under 3% of the file.
- The dev server has no bundle, so the cheat sheet says the licenses are in the built app.
- Alternatives: `rollup-plugin-license` does the same, but it's a new dependency for about 60 lines of code. A separate `NOTICES` file beside the page wouldn't travel with the single file someone emails or saves.
