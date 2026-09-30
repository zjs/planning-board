# 0010: CSV import

Status: Accepted (sprint 2, slice 4). Slice 5 adds the value table.

## Context

Requirement 28 asks for importing items from CSV with a column-mapping step, using Jira's CSV export as the reference. The sprint 2 goal is that a PM turns their own export into a board they recognize within minutes. Jira exports have quirks _(recalled)_:

- Repeated columns for multi-valued fields (`Component/s`, `Labels`, `Sprint`, issue links).
- `Custom field (…)` headers.
- Parents given by issue ID in newer exports (`Parent`), or by key in older ones (`Custom field (Epic Link)`).
- Multi-line quoted descriptions.
- Links to issues that aren't in the export.

Your decisions (questions.md Q25, Q26): columns can become custom properties; an import replaces the board, undoably, and keeps Jira keys.

## Decision

- **A small CSV reader of our own** (`src/domain/csv.ts`). It handles quoted fields, doubled quotes, line breaks inside quotes, CRLF, a byte-order mark, and comma, semicolon, or tab delimiters (detected from the header line). It adds no runtime dependency. The format is small and well defined, and a dependency would still need the Jira-specific handling around it.
- **Two pure steps** in `src/domain/csvImport.ts`, both unit-tested against a Jira-shaped fixture:
  1. **Rows and a column mapping give a draft**: one entry per row with a title, and its raw text per field. Columns that share a header are read together, so repeated `Component/s` columns become one list. Rows without a title are skipped and counted.
  2. **The draft and a value table give a `Plan`** with fresh random IDs:
     - Components go into areas.
     - Versions go into quarters as releases.
     - Story points become sizes.
     - Mapped columns become flat custom properties.
     - Parent links become groups, with a loop broken where it closes.
     - "Blocks" links become dependencies: the blocker comes first.

     Anything left out is reported in plain words: undated versions, parents or links outside the file, skipped rows, and duplicate keys.
- **Mapping is guessed from headers and always editable.** The guesses cover Jira's usual headers, in both company-managed and team-managed spellings _(recalled)_. Each field is used once, except parents (Parent and Epic Link can both be present) and custom properties. Status, Priority, Sprint, and Assignee aren't imported unless someone maps them (Q29).
- **The value table's defaults** (Q27, Q28):
  - Each component goes in an area named after its project (the Project name column, else the key's prefix).
  - Versions have no quarter until someone picks one.
  - Story points: 1 → XS, 2–3 → S, 5 → M, 8 → L, 13 and up → XL.

  The quarters offered are this one and the next seven.
- **One undo step.** `importPlan` builds the plan and writes it with `loadPlan`, the same path as opening a plan file.
- **Cells aren't split.** A multi-valued field is read from repeated columns, the way Jira writes them, not by splitting a cell on commas. Splitting would break values that contain commas, such as "Billing, EU".

## Alternatives

- **A CSV library** (Papa Parse or similar). It's well tested, but it would be a runtime dependency for about 60 lines of parsing, and it doesn't know about repeated headers.
- **Importing into the current board.** Rejected in Q26 for now: merging needs matching rules (by key, by title) and a way to review conflicts. Keeping each card's key leaves room for it later.
- **Using the Jira API.** Out of scope for v1 (requirements.md), and it would need credentials and a server.

## Consequences

- A PM's own export is the real test (sprint 2 exit criterion 7). When a header isn't recognized, the mapping step is the fix, and it gets added to the detection list.
- Imported values have random IDs, so a second import of the same file makes new values rather than matching the first. Matching comes with re-import, which is deferred.
- Descriptions are imported and saved in plan files, but not shown until card details exist.
