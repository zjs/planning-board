# 0018: Keys, links and access

Status: Accepted (sprint 9). The product side is Q62, answered (a) on 2026-10-08.

## Context

Requirement 30 says a plan is shared by link. Plans are confidential, the relay may never read them, and there are no accounts.

## Decision

- **A link carries a room ID and a secret in its fragment** (`#room=…&key=…`). Browsers never send the fragment to a server (Excalidraw's model).
- **The browser derives two things from the secret with HKDF:**
  - an AES-GCM encryption key, 256-bit;
  - a write token for the relay (ADR 0017).
- **Every message is encrypted with a fresh random IV,** and the room ID is bound in as additional data.
- **A view-only link** carries the encryption key, but not the secret the write token comes from. It can read and can't write, and the relay enforces that without reading anything.
- **Revoking access means new links:**
  1. a new room with a new secret is made from the current board;
  2. the old room is marked retired, and the relay refuses writes to it;
  3. the people who should keep access get the new links.

  People with an old link keep what they had already downloaded, and the interface says so.

## Alternatives

- **Password-derived keys,** as Actual Budget uses. It's another secret to pass around, and a forgotten password loses the plan.
- **Real group membership with key agreement** (Keyhive, MLS). It's research-grade, and it needs identities, which v1 doesn't have.

## Consequences

- Access is exactly "who has which link". That's simple, and as strong as the way links are shared.
- No one can be removed from what they've already seen. No end-to-end encrypted tool can do that.

## Amendment: as built in sprint 11, slice 3

**Encryption is XChaCha20-Poly1305, not AES-GCM.** AES-GCM's random 96-bit IVs are safe for about 2³² messages under one key _(recalled)_, and a room's key lives as long as the room, with presence traffic on top from sprint 12. XChaCha20's 192-bit nonces can be random for the life of any room.

**Pure JavaScript, not WebCrypto.** A relay on a laptop is opened over plain `http://192.168.x.x`, which isn't a secure context, and browsers offer no WebCrypto there _(recalled)_. Two new runtime dependencies, both audited and dependency-free: `@noble/ciphers` (XChaCha20-Poly1305) and `@noble/hashes` (HKDF-SHA256). `crypto.getRandomValues` works everywhere.

**Keys** (`src/store/keys.ts`):
- The secret `S` is 32 random bytes. HKDF-SHA256, with the salt `planning-board`, derives the encryption key `K` (info `planning-board 1 enc`) and the write token `T` (info `planning-board 1 write`). A view link carries `K`, from which nothing derives `T`.
- A sealed message is a version byte (1), a 24-byte random nonce, then the ciphertext and tag.
- The additional data is `planning-board|1|<room>|<kind>|<upto>`, where kind is `update`, `snapshot` or `presence`, and `upto` is a snapshot's reach. So the relay can't pass presence off as an update, an update from another room as one of this room's, or an old snapshot as a newer one.

**Links:**
- edit: `<app>/#v=1&room=<id>&key=<S>`;
- view: `<app>/#v=1&room=<id>&view=<K>`;
- `&relay=<address>` is added when the relay isn't where the app is opened from.

`v` is the link format. A build that meets a newer one says so, rather than guessing. Links name the relay's address as others reach it, which the relay reports at `/config`, never `localhost` when it has a network address. They send people to the relay's own copy of the app, unless this page and the relay are both https, when they keep this page.

**Where keys are kept.** A shared plan's entry in the plan list (localStorage) holds its relay, room, `S` (if this browser has the edit link) and `K`. That's the same computer, and the same trust, as the plan itself, which IndexedDB already holds unencrypted. Every page opened from a file shares one localStorage, and so does every site under `zjs.github.io`; a self-hosted relay serving the app has its own. A key leaves the address bar as soon as it's saved, and stays only where the browser can't keep the plan list.

**Opening a link:** plans match on relay and room together. A view link where the edit link is held changes nothing. An edit link upgrades a plan held for viewing, after checking that its `K` comes from its `S`. Keys that don't match the plan held are refused, never overwritten.

**Read-only.** A view link, or a plan a newer build has written (`meta.writer`), opens read-only, and every write path checks one flag (`PlanStore.readOnly`): commands, undo and redo, built-ins, loop repairs, names and snapshots.

**Trust, stated plainly:**
- **Write enforcement trusts the relay.** It sees `T` on every connection, so an operator who also held a view link could write. Signing updates (Ed25519) would close that, and stays possible behind the version byte, if a public relay needs it.
- **Replaying old updates is harmless:** Yjs applies each change once.
- **Withholding updates** only stops sync, which the connection pill will show (slice 4).
- **A relay that serves the app over plain http** protects what it stores, not the network or its operator, who could serve altered code (ADR 0017). That's why links can name the app and the relay separately.
