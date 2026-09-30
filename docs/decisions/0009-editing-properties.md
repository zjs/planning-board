# 0009: Editing properties and their values

Status: Accepted (sprint 2, slice 2). Slice 3 adds the value edits marked below.

## Context

Requirements 25–27. People add their own properties, such as Team, and fix the taxonomy on the board: rename a component, move it to another area, add a release, delete one. The built-in properties carry logic (contention on System, time order on Time, size mismatches on Size), and that logic has to keep working through every edit. Imported plans (slices 4–5) make these edits common, because an import creates values people will want to fix straight away.

## Decision

- **IDs are stable, labels are display text.** Custom properties get random IDs (`p…`), and new values get random IDs (`v…`), like items (ADR 0003). IDs are never reused. Renaming changes only the label, so cards keep their values and nothing else needs rewriting.
- **Built-in properties can be renamed but not deleted** (requirement 25). Their logic keys on their IDs (`sequence`, `system`, `size`, `time`), not their names.
- **Custom properties are flat for now** (questions.md Q25): one level, named after the property, and renaming the property renames the level. Each holds one value per card or several, chosen when the property is created.
- **Names can't collide.** Property names are unique across the plan and value labels are unique among their siblings, ignoring case, so the axis picker and lane headers never show two identical choices.
- **Deleting a property removes its values from every card** in the same transaction, so one undo restores both.
- **Axis options come from the plan.** The axis picker offers one option per level of every property. Built-ins come first, then custom properties by name. An option's ID is the property ID at the top level and `property:level` below that. Sprint 1's `component` and `release` are read as `system:1` and `time:1`. A remembered view whose property or level no longer exists falls back when it's shown, first to the default view, then to any property the other axis isn't using. The remembered choice itself is kept, so undoing a delete brings the view back.
- **Slice 3: moving, reordering, and deleting values.** Moving a value changes its parent and keeps its ID, so a component moved to another area keeps its cards. Reordering assigns a new fractional order key between the new neighbours. Deleting a value moves its cards to its parent value, or clears it if it has none (Q4). This happens in the same transaction, along with deleting the value's descendants.

In the Yjs document, a property's values stay a map from value ID to `{label, parent, order}`, and an edit replaces the entry (ADR 0006). In M2, two people renaming and moving the same value at once will see the last write win for that value. That's acceptable for rare taxonomy edits, and it never loses a card's value, because cards hold IDs.

## Alternatives

- **Labels as IDs.** The sample plan's hand-written IDs, such as `identity/sso`, read well. But a rename would then mean rewriting every card that holds the value, and two people renaming at once could split the value in two.
- **Hierarchical custom properties now.** Requirement 26 allows any depth. Nothing in the sprint 2 exit criteria needs it, and the import value table (Q27) already covers the common two-level cases through System and Time.
- **Blocking a value delete while cards use it** (Q4's second option). It never loses information, but it forces people to clear cards by hand before a tidy-up. Moving the cards to the parent keeps the coarser information and needs no extra steps.

## Consequences

- An import's values can be renamed and moved without touching any card.
- The mismatch markers, conflict rules, and card badges read the new labels immediately, because everything derives from snapshots.
- Plan files keep human-readable IDs when a person writes them. The app's own IDs are opaque but stable.
