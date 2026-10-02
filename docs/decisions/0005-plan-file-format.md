# 0005: Plan file format

Status: Accepted (sprint 0, slice 1). Brought forward from slice 4, because the seed data needs a format now. Amended in sprint 2, slice 1: the writer, `externalKey`, and when a version bump is needed. Amended in sprint 4, slice 2: built-in properties added later. Amended in sprint 5, slice 1: the compatibility gate.

## Context

Requirement 29: save a plan to a file and open it again, including scenarios. Sprint 0 also needs a seed plan the PM can swap for sanitized real data by editing JSON. Files outlive app versions, so the format carries a version.

## Decision

A **JSON file**, readable and hand-editable, read by `parsePlanJson` in `src/domain/planJson.ts`:

```json
{
  "format": "planning-board",
  "version": 1,
  "properties": [
    { "id": "system", "name": "System", "levels": ["Area", "Component"], "multi": true,
      "values": [{ "id": "billing", "label": "Billing",
                   "children": [{ "id": "billing/tax", "label": "Tax Engine" }] }] }
  ],
  "items": [
    { "id": "vat-oss-reporting", "title": "VAT OSS reporting", "parent": null,
      "sequence": 4, "values": { "system": ["billing/tax"], "time": "q2", "size": "m" } }
  ],
  "dependencies": [["tax-engine-vendor-migration", "vat-oss-reporting"]]
}
```

- `format` and `version` are required. Readers accept every older version and upgrade it in memory; writers always write the newest.
- Value hierarchies are nested `children`; array order is display order.
- Item values may sit at any level (`"billing"` or `"billing/tax"`). A single value can be a string instead of a one-element array.
- `sequence` is either a number (hand-written files; equal numbers share a column) or an order key string (what the app writes). A file uses one or the other throughout.
- `dependencies` are `[prerequisite, dependent]` pairs.
- `description` and `externalKey` are optional strings on an item. `externalKey` is the item's key in the tool it was imported from, such as a Jira issue key (`"PAY-123"`), so a later import can match cards instead of duplicating them (questions.md Q26).
- Invalid files are rejected with every problem listed at once, so a hand edit can be fixed in one pass.
- **Version 2** (with the scenario UI) wraps this in `{ "scenarios": [{ "id", "name", "forkedFrom", "plan": … }] }`. Version 1 files open as a single scenario.

## Writing (sprint 2)

`planToJson` in the same module is the exact inverse of `parsePlanJson`: reading what it writes gives back the same plan, and a test checks this on the sample plan and through a Yjs round trip. Its output is deterministic, so saving an unchanged plan twice gives an identical file:

- Values are written as nested `children` in display order. Their order keys aren't written; the reader regenerates them from array order.
- Items are written depth-first through the group tree, so a group's children follow it. Siblings go in sequence order, then by title.
- Sequence positions are written as order keys, never numbers.
- Single-valued properties are written as a string, multi-valued ones as an array. Empty values, `parent: null`, and empty descriptions are left out.
- Dependencies are sorted.

The writer never produces a file the reader would reject. Anything a valid file can't hold is dropped: a value ID that no longer exists, or a parent that's gone (that item is written at the top level). Neither can happen in single-user editing; they're guards for M2's concurrent edits.

Opening a file goes through `readPlanFile`, which explains a rejected file in one plain sentence (not JSON, not a plan file, from a newer version, or "N problems"), and keeps the full list of problems for anyone fixing the file by hand.

## Alternatives

- **Yjs binary state.** Exact, keeps history, but opaque: the PM can't swap in real data by editing it, and history is the wrong thing to hand to someone else.
- **CSV.** Can't hold hierarchies, groups, or dependencies cleanly. It stays an import source (requirement 28).

## Consequences

- Opening a file replaces the board's content in one Yjs transaction, so one undo brings the previous board back. The file is for exchange and backup, not sync; M2's relay syncs Yjs updates.
- Item IDs round-trip, so a file saved from one scenario and reopened still compares against its siblings.
- A new field that older readers can safely ignore, like `externalKey`, doesn't need a version bump: the reader already ignores fields it doesn't know. A change older readers would misread, such as a new value shape or wrapping the plan in scenarios, means a version bump plus an upgrade step in the reader, with a test.
- A built-in property added after a file was saved, such as Level (Q32), is filled in when the file is opened (`withBuiltIns` in `src/domain/builtins.ts`), with no values on any card. That needs no version bump either: the file is still read exactly as it was written. Boards saved in the browser get the same treatment when they're opened (`ensureBuiltIns`), outside the undo history.

## Compatibility (sprint 5)

The repo is public, so plans saved by any released build must keep opening in every later one. A break is a CI failure, not a release note.

- **Fixtures.** `src/domain/__fixtures__/compat/` holds what each released version saved, written by that version's own code (`npm run compat:fixtures`, which checks each one out into a temporary worktree):
  - `<version>.plan.json`: its sample plan saved through its own writer. Sprints 0 and 1 had no writer, so theirs is the hand-written sample file they shipped.
  - `<version>.board.yjs`: the board as that build kept it in the browser, an encoded Yjs update.
  - `<version>.import.plan.json`, from sprint 2 on: the synthetic Jira export imported and saved, which covers Jira keys, descriptions and custom properties.
- **Tests.** `src/domain/compat.test.ts` opens every plan file and checks that it keeps every card, value, group and link, and that saving and reopening gives the same plan. `src/commands/compat.test.ts` opens every stored board through the store and `ensureBuiltIns`, checks it against the plan file the same version saved, and edits and saves it. Both run in `npm run check`.
- **Policy.**
  - Fixtures are never regenerated or edited. A test that fails on an old fixture means the reader has to change, not the fixture.
  - Each released sprint adds its last commit to `VERSIONS` in `scripts/generate-compat-fixtures.ts`, and the script writes only the new version's files.
  - A change to the file format or the Yjs schema also adds a fixture straight away, written from the commit before the change. It doesn't wait for the sprint's release.
