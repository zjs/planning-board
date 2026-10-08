# 0017: Sync through a relay that reads nothing

Status: Proposed (sprint 9). Shaped by the spike in `spikes/relay/` and `spikes/sync-client/`. The evidence is in `docs/research/collaboration/relay-and-sync.md`.

## Context

Requirements 30–31, and the architecture rule that the relay only ever sees end-to-end encrypted payloads. Yjs's own sync handshake, and every Yjs server found (y-websocket, y-sweet, Hocuspocus, Liveblocks), needs to read the document (`prior-art.md`, §6).

## Decision

**The relay (Go) numbers, stores and forwards ciphertext.**
- Each room has an append-only log of encrypted updates, each given the next sequence number, written to disk, acknowledged, and forwarded to the room.
- A client reconnecting asks for everything after the last number it saw, and gets the latest snapshot first if it's behind it.
- Presence is forwarded and never stored.

**Clients do everything that needs reading:**
- **A shadow document:** each client keeps a Yjs document of what the relay is known to hold. After any time offline, what the relay is missing is `encodeStateAsUpdate(doc, stateVector(shadow))`, as one update.
- **Snapshots:** once the log is 200 updates past the last snapshot, a caught-up client encrypts the shadow and uploads it, and the relay drops the log behind it.
- **The cursor is saved only with the shadow it belongs to,** so a reload never skips an update.

**Writes need a token.** A secret in the link yields a write token. The relay keeps a hash of it, registered when the room is made, and accepts updates only from connections that present the token.

**On the wire:**
- binary frames;
- a size limit per message;
- an origin check;
- per-room quotas and rate limits, configurable for a public relay (Q64).

**Self-hosting:** one Go binary serves the app's single HTML file and the relay, and keeps each room as a log and a snapshot under one data directory. A container image is that binary, the HTML file and a volume.

## Alternatives

- **A Yjs server holding a readable document,** such as y-sweet or Hocuspocus. It breaks the encryption rule.
- **The relay merging updates.** It can't read them.
- **Peer-to-peer over WebRTC.** There's no stored snapshot (requirement 30), it still needs a signaling server, and corporate networks often block it.

## Consequences

- **Measured on the 151-card sample:**
  - about 50 bytes per edit;
  - opening a link takes 0.17 s from an 855-update log, and 0.02 s from a snapshot;
  - reconnecting after offline work sends one update;
  - a relay restart lost nothing.
- **A client-made snapshot is trusted.** The relay keeps compacted log segments for 30 days, so a bad snapshot can be replaced by a full replay.
- **The relay still sees metadata:** room IDs, addresses, timing and sizes.
- **The client has to manage more than one board per browser:** a database per plan. The UI for that is Q58.
