# 0019: Presence anchored to cards

Status: Accepted (sprint 9). The product side is Q61, answered on 2026-10-08: presence and a cursor setting, and no following. Tried in `spikes/sync-client/presence.ts`.

## Context

Requirement 32 asks for who's present and where their cursors are. Every other tool shares screen or canvas coordinates, which works because everyone looks at one canvas. Here each person can be in a different pivot, with different bands folded and groups expanded.

## Decision

**What a client shares, encrypted, through the relay's presence channel, never stored:**
- **Name and color.**
- **Pointer:** the card under it, and where on that card, as fractions. When it isn't over a card, nothing is shared.
- **Selection:** the IDs of the selected cards.
- **Drag:** the card being dragged, and the lane under the pointer, by key and label.

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

- Large sessions need the cursor setting (Everyone, Driver only, None), since presence fans out to everyone.
- There's no following (Q61). If it comes back, following means applying someone's view, not their scroll position, and presence would add the view: axes, folded bands and expanded groups.

## Amendment: as built in sprint 12, slice 1

**The message** (`src/domain/presence.ts`, `PeerState` version 1) is JSON, sealed with the plan's key as kind `presence` (ADR 0018). It holds:
- `id`: random, kept per browser, so one person's tabs and reconnections show as one avatar. The relay's own connection numbers change on every reconnect.
- `name` and `color`.
- `pointer`: `{item, fx, fy}`.
- `selection`: up to 200 card IDs.
- `drag`: `{item, label}`.
- `drive`: a claim to drive.
- `dropped`: a card just dropped, for collision notices (slice 2).

Anything out of shape, or of another version, is ignored rather than drawn.

**Timing** follows the spike:
- sends throttled to one every 50 ms;
- a heartbeat every 3 seconds;
- someone silent for 10 seconds dropped, and anyone the relay says has left dropped at once;
- losing the connection drops everyone until their heartbeats bring them back.

**The relay** counts presence apart from changes (30 a second, `-presence-rate`), so a pointer moving never slows anyone's edits. Over that rate, or over 4 KiB, presence is dropped without an error. A view link may send presence.

**The driver (Q71).** "I'm driving" claims the lead with a Lamport number, one higher than any claim seen. Every browser picks the highest claim, ties broken by ID, so all agree with no server deciding. A claim someone else has overtaken is given up, so when the new driver stops, nobody drives. Leaving gives it up too. A claim reaches everyone within one heartbeat.

**Drawing** (`src/ui/PresenceLayer.tsx`) is an SVG over the board, sized, clipped and redrawn the same way as the dependency lines:
- a selection outlines every copy, in the person's color;
- a pointer, an arrow with a name, goes on the first copy on screen;
- a card that isn't on this board draws nothing.

The pointer is tracked over the whole page, since a plan opened from a link has no board until its first sync.

**Avatars** sit beside the connection pill, yours first, with a ring around the driver's. The row opens a menu to drive, to change your name, and to choose whose pointers show:
- the choices are Everyone, Driver only, and None;
- the setting is kept per browser, and quiets pointers only;
- avatars and selections always show.

The menu keeps the toolbar to one row at 1280 wide.

**Colors** are eight named colors, picked from the person's ID. They're darker than the area colors, and drawn only as outlines and pointers, never as a card's edge.
