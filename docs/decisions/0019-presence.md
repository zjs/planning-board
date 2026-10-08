# 0019: Presence anchored to cards

Status: Proposed (sprint 9). The product side is Q61. Tried in `spikes/sync-client/presence.ts`.

## Context

Requirement 32 asks for who's present and where their cursors are. Every other tool shares screen or canvas coordinates, which works because everyone looks at one canvas. Here each person can be in a different pivot, with different bands folded and groups expanded.

## Decision

**What a client shares, encrypted, through the relay's presence channel, never stored:**
- **Name and color.**
- **Pointer:** the card under it, and where on that card, as fractions. When it isn't over a card, nothing is shared.
- **Selection:** the IDs of the selected cards.
- **Drag:** the card being dragged, and the lane under the pointer, by key and label.
- **View:** the axes, folded bands and expanded groups, for following.

**How it travels:**
- At most 20 messages a second per person while something changes, plus a heartbeat every 3 seconds.
- A person who's silent for 10 seconds disappears, and the relay announces disconnects.

**How it's drawn:** each receiver draws presence on its own board, wherever those cards are in its view.
- **Pointer:** on the first copy on screen.
- **Selection:** outlines on every copy.
- **Drag:** a dashed outline, and "… is moving this → lane".

A card that isn't on your board, because it's inside a collapsed group or scrolled away, draws nothing for now.

## Alternatives

- **Screen coordinates.** Meaningless across pivots.
- **Yjs's awareness protocol, as is.** Its format is fine, but our relay forwards opaque messages anyway, and card-relative fields are ours to define.

## Consequences

- Following someone means applying their view. It isn't a scroll position.
- Large sessions need the cursor setting (Everyone, Driver only, None), since presence fans out to everyone.
