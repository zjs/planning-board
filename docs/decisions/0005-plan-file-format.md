# 0005: Plan file format

Status: Accepted (sprint 0, slice 1). Brought forward from slice 4, because the seed data needs a format now.

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
- Invalid files are rejected with every problem listed at once, so a hand edit can be fixed in one pass.
- **Version 2** (with the scenario UI) wraps this in `{ "scenarios": [{ "id", "name", "forkedFrom", "plan": … }] }`. Version 1 files open as a single scenario.

## Alternatives

- **Yjs binary state.** Exact, keeps history, but opaque: the PM can't swap in real data by editing it, and history is the wrong thing to hand to someone else.
- **CSV.** Can't hold hierarchies, groups, or dependencies cleanly. It stays an import source (requirement 28).

## Consequences

- Opening a file creates fresh Yjs documents from it. The file is for exchange and backup, not sync; M2's relay syncs Yjs updates.
- Item IDs round-trip, so a file saved from one scenario and reopened still compares against its siblings.
- Adding a property field later means a version bump plus an upgrade step in the reader, with a test.
