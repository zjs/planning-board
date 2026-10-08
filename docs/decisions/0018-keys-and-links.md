# 0018: Keys, links and access

Status: Proposed (sprint 9). The product side is Q62.

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
