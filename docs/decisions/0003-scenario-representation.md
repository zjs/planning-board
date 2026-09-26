# 0003: Scenario representation

Status: Accepted (sprint 0, slice 1; scenario UI comes later)

## Context

Requirements 22–24: fork the plan into named scenarios, compare two in any view (moved, added, removed, changed, decomposed items), list conflicts present in one but not the other. Merging between scenarios is out of scope for v1 but should stay possible. M2 syncs plans through a relay that only sees encrypted Yjs updates.

## Decision

**One Yjs document per scenario**, plus a small **plan index** document listing scenarios (ID, name, which scenario it was forked from, when).

- **Fork** = create a new document and apply the source document's full state to it. The fork starts with the same items, the same IDs, and the same history.
- **Compare** = take a plain snapshot of each scenario (the same `Plan` type everything else uses) and diff them by item ID in `src/domain/`. The diff is a pure function, so it's unit-testable and view-independent: the compare view is just the normal view query run on both snapshots, plus markers.
- Item IDs are random, globally unique, and never reused, so "same ID" always means "same item".

## Alternatives

- **All scenarios in one document** (a map of scenario → items). Simple to save as one file, but every edit to any scenario syncs to everyone viewing any scenario, and the document only grows.
- **Yjs snapshots/versions** as scenarios. Snapshots are read-only views of the past; a scenario must be edited independently.
- **Copy items with new IDs per scenario.** Makes comparison a fuzzy matching problem. Rejected outright.

## Consequences

- Each scenario is its own sync room in M2 and its own encrypted snapshot. Opening a plan loads only the scenarios you look at.
- Because forks share history, a later "merge scenario" feature can apply one document's updates to another. That merge is deliberately out of scope, and naive merging would combine both scenarios' edits, so it will need its own design.
- A plan file bundles all scenarios (see 0005).
