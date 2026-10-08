# 0017: Sync through a relay that reads nothing

Status: Accepted (sprint 9; M2's plan approved by the PM, 2026-10-08). Built in sprint 11, slice 1 (`relay/`); see the amendment below. Shaped by the spike in `spikes/relay/` and `spikes/sync-client/`. The evidence is in `docs/research/collaboration/relay-and-sync.md`.

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
- per-room quotas and rate limits, configurable for a public relay (Q64);
- the relay's own receive time beside each sequence number. It's metadata the relay already has, and history uses it to correct wrongly set clocks (ADR 0020).

**Self-hosting:** one Go binary serves the app's single HTML file and the relay, and keeps each room as a log and a snapshot under one data directory. A container image is that binary, the HTML file and a volume. The same binary on one person's laptop is a pilot, before a company commits to hosting it (Q64).

## Amendment (Q64, 2026-10-08): without a hosted relay

Requirement 37 covers companies that can't use a hosted relay.

- **A pilot on a laptop.** The relay binary runs as is on one person's computer. It prints the address colleagues on the same network can open, and keeps its data directory next to it. Nothing about it differs from a self-hosted relay, so a pilot that works becomes the install.
- **Changes by file** (built as ADR 0022).
  - "Send changes" writes the plan's whole Yjs state, encrypted with the plan's key, to one file.
  - "Merge changes" applies a file to the board. Yjs merges any state, in any order, any number of times, so a file can be sent around freely, and receiving an old one changes nothing.
  - A whole state, not a diff since a cursor, keeps it simple: a few hundred cards is tens of kilobytes. A file holds no key. It belongs to a plan whose link the person already has.
  - The same history document (ADR 0020) travels in the file, so "since you were away" works for it too.

## Alternatives

- **A Yjs server holding a readable document,** such as y-sweet or Hocuspocus. It breaks the encryption rule.
- **The relay merging updates.** It can't read them.
- **Peer-to-peer over WebRTC.** There's no stored snapshot (requirement 30), it still needs a signaling server, and corporate networks often block it. The PM ruled it out as a fallback too (Q64).

## Consequences

- **Measured on the 151-card sample:**
  - about 50 bytes per edit;
  - opening a link takes 0.17 s from an 855-update log, and 0.02 s from a snapshot;
  - reconnecting after offline work sends one update;
  - a relay restart lost nothing.
- **A client-made snapshot is trusted.** The relay keeps compacted log segments for 30 days, so a bad snapshot can be replaced by a full replay.
- **The relay still sees metadata:** room IDs, addresses, timing and sizes.
- **The client has to manage more than one board per browser:** a database per plan. The UI for that is Q58.

## Amendment (sprint 11, slice 1): the relay as built

The relay is `relay/`, a Go module (Go 1.26, built with 1.27), grown from the spike. What it does beyond the spike, and the choices it made:

- **A versioned binary protocol,** in [`relay/PROTOCOL.md`](../../relay/PROTOCOL.md). `hello` carries the protocol version, the write token and the cursor; a mismatched version is refused with words for a person ("this relay is out of date"). Presence and `left` are defined now, so sprint 12 needs no new version. New frames and trailing fields can be added within a version.
- **Rooms are made explicitly,** by a `hello` that asks to create one with a write token. The relay keeps the token's SHA-256, compares it in constant time, and never makes a directory for a room nobody created. Creating again with the same token is harmless, so a client that crashed mid-share retries; another token can't take the room.
- **Without the token, a connection reads but can't write.** It gets updates and snapshots like anyone, and its writes are refused, one by one, with the reason.
- **An epoch,** 16 random bytes made with the room and sent in `synced`. A client that sees a new epoch, or a relay behind its cursor, knows the room was replaced or restored from a backup, and starts again from what it has.
- **Receive times:** the relay's clock beside each sequence number and snapshot, for history (ADR 0020).
- **Replaced updates are kept 30 days** as segments, outside the room's quota, and a `hello` can ask for all of them instead of the snapshot.
- **Limits, each a flag,** generous for a relay a company or a pilot runs for itself: 4 MB per message, 200 MB per room, 2 GB in all, 1,000 rooms, and rates for updates per connection, and for connections and new rooms per address. The public relay (sprint 14) sets its own.
- **The origin check** compares hosts, so a TLS proxy in front doesn't break it. It allows the relay's own pages (or `-public-url`), the app opened from disk (`Origin: null`) and `zjs.github.io`, and `-allow-origin` adds others. It isn't a security boundary: writes need the token, and a program that isn't a browser sends any origin it likes. It keeps other websites from using a visitor's browser to fill the relay.
- **It serves the app,** embedded at build time, never cached, and `/config`, which tells the app the address to put in share links: the computer's network address rather than `localhost`, or `-public-url`.
- **On a laptop** it listens on `:8787`, keeps its data next to the program, and prints the addresses colleagues can open.
- **Releases:** after CI passes on `main`, the downloads for Mac, Linux and Windows go to the rolling `relay-latest` release, and a multi-arch image to `ghcr.io/zjs/planning-board` (Q69). Pages deploys only after CI passes too.

**The threat model, stated plainly.** The relay can't read what it stores. When it also serves the app, whoever runs it could serve an altered app that reads the key from the link, which is the trust any website asks for. Over plain `http`, someone on the network could do the same. So a relay protects what's stored, not the network or the operator. Run it yourself, or have the company run it. For sprint 14's public relay, links can name the app and the relay separately (ADR 0018), so the relay never serves the code.
