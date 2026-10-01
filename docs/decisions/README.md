# Decision records

Short ADRs: context, decision, alternatives, consequences. Each one should make sense without opening the code. Supersede an ADR with a new one instead of rewriting history; mark the old one "Superseded by NNNN".

| # | Decision | Status |
|---|---|---|
| [0001](0001-frontend-and-build.md) | React + Vite, one self-contained HTML file | Accepted |
| [0002](0002-rendering.md) | DOM with CSS grid; SVG overlay for lines later | Accepted |
| [0003](0003-scenario-representation.md) | One Yjs document per scenario, diffed by item ID | Accepted |
| [0004](0004-group-tree.md) | Parent pointers, with deterministic cycle repair for M2 | Accepted |
| [0005](0005-plan-file-format.md) | Versioned, human-editable JSON plan files | Accepted |
| [0006](0006-crdt.md) | Yjs, y-indexeddb, and the document layout | Accepted |
| [0007](0007-drag-and-drop.md) | Custom pointer-event drag, rules in a pure function | Accepted |
| [0008](0008-view-scope-and-zoom.md) | Zoom is part of the view spec; one layout for every level; several roots, expansion and frames (Q33) | Accepted |
| [0009](0009-editing-properties.md) | Stable value IDs; built-ins can't be deleted; axis options come from the plan | Accepted |
| [0010](0010-csv-import.md) | Own CSV reader; import as two pure steps (draft, then plan); one undo step | Accepted |
| [0011](0011-dependency-display.md) | Dependency lines: one SVG overlay measured from the page; focus and problem lines; hidden ends drawn to their group | Accepted |
| [0012](0012-nested-axes.md) | Nested axes: parent bands, a lane per parent keyed by its value, collapse as viewer state | Accepted |
