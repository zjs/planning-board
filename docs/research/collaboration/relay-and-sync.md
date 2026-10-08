# A relay that reads nothing: relay and sync

Sprint 9, slices 3 and 4. Can the board sync through a relay that never sees plan content, and what does that cost? The spike says yes, cheaply, with three things to design that the encryption makes ours rather than the relay's.

The evidence comes from three places:
- **A Go relay,** in [`spikes/relay/`](../../../spikes/relay/), with Go tests.
- **An encrypted Yjs provider,** in [`spikes/sync-client/`](../../../spikes/sync-client/), that the real app uses. A spike build swaps one module, `src/store/persistence.ts`, and changes no other line of the app.
- **Two kinds of run:**
  - an automated browser run: two people on one link, editing live, one going offline and coming back, with a check that the relay's storage holds no plan text;
  - a Node benchmark against the real relay, on the sample plan: [`relay-measurements.md`](relay-measurements.md).

## Try it

```
npx vite build --config spikes/sync-client/vite.config.ts
cd spikes/relay && go run . -static ../sync-client/dist
```

1. Open http://localhost:8787, choose **Load sample plan**, then **Share this plan (spike)**, at the bottom left.
2. Copy the link to another browser, or to a private window.
3. Edit in both:
   - drag cards, rename them, select some;
   - each person sees the other's pointer, selection and drags, in their own color;
   - each person can be in a different view.
4. Press **Go offline** in one window and edit in both. Press **Go online**: both boards converge, and the one that was away gets a "Since you were away" list.
5. Look in `spikes/relay/relay-data/`. It holds base64 ciphertext and sequence numbers, and nothing else.

The automated version: `npx playwright test --config spikes/sync-client/playwright.config.ts`.

## How it works

**The relay can't run Yjs's own sync, so it numbers what it's given.** Yjs syncs by having each side send its state vector and the other reply with what it's missing. That reply means reading the document, which an end-to-end encrypted relay can't do (`prior-art.md`, §6). So the relay:
- gives every encrypted update the room's next sequence number, appends it to the room's log on disk, acknowledges it, and forwards it to everyone else in the room;
- answers "hello, I've seen up to 812" with the latest snapshot, if the client is behind it, then everything after.

**The client keeps a "shadow" of what the relay holds.** The shadow is a second Yjs document built only from updates received from the relay, and from the client's own updates once acknowledged. After any time offline, what the relay is missing from this client is exactly the difference between the board and the shadow. That's one update, however many edits it holds. No queue of pending edits has to survive a crash or a reload.

**Snapshots are made by clients.** Once the log is 200 updates past the last snapshot, a client that's caught up encrypts the shadow and uploads it, with the sequence number it covers. The relay swaps it in atomically and drops the log entries it covers.

**Presence goes through the same pipe, encrypted, and is never stored.** It covers pointers, selections and drags, and when a connection drops, the relay tells the room.

**The key never leaves the browser.** The link is `#room=…&key=…`, and the fragment after `#` is never sent to a server.
- The cipher is AES-GCM with a 256-bit key and a fresh random IV per message.
- The room ID is bound in as additional data, so the relay can't move a message from one room to another.
- A shared board lives in its own browser database, named for the room, beside your own board.

The whole relay is about 350 lines of Go with one dependency (`github.com/coder/websocket`). It has no Yjs code and no keys.

## What the measurements say

From [`relay-measurements.md`](relay-measurements.md). Timings are on one machine, so they show proportions, not network latency.

| Question | Answer |
|---|---|
| How big is a plan? | The 151-card sample is **42 KB** as one Yjs update. After 1,000 edits it's 60 KB stored, and 70 KB while a session's undo history is alive. |
| How big is one edit? | **52 bytes** of Yjs update, and 143 bytes on the wire, since the spike sends base64 inside JSON. Binary frames would roughly halve that. Either is trivial. |
| Does the relay keep up? | 1,000 edits in a row were all acknowledged within 0.25 s of the last, with the relay writing each one to disk before acknowledging it. A live session makes a few edits a second. |
| How long does opening a link take? | Replaying an 855-update log took **0.17 s and 174 KB**. Starting from a snapshot took **0.02 s and 81 KB**. Snapshots matter for load time and storage, not correctness. |
| What does coming back from offline cost? | After 33 updates by others and 20 edits of one's own: **37 ms** to converge, 34 messages in, and **one** update out. |
| What if the relay restarts mid-edit? | Both clients reconnected on their own and converged with nothing lost. The relay writes to disk before acknowledging, and anything unacknowledged is in the shadow difference. |
| Can the relay read anything? | **No.** None of the 150 card titles appear in its storage, raw or base64-decoded. |
| What about someone with the wrong key? | They read nothing: every message fails to decrypt. **But the relay accepted their update,** because it can't tell. Everyone else dropped it as unreadable, and their boards were unaffected. |

## What the encryption makes ours to design

### 1. Who can write

A relay that can't read can't tell a real update from junk. Anyone who learns a room ID can append to its log: unreadable, so harmless to the board, but it fills the relay's disk. Anyone with an old key, after a rotation, can do the same.

**The fix needs nothing the relay can read.**
- The link carries one secret, and the browser derives two keys from it: an **encryption key**, and a **write token**, which the browser hashes.
- The room's creator registers the hash. The relay accepts updates only from connections that present the token.
- The relay checks a token. It still learns nothing about the plan.

**View-only links come almost free.** A link with the encryption key but not the write token can read and can't write. Requirement 30 doesn't ask for view-only links, but it's the one access control end-to-end encryption allows cheaply, so it goes to the PM as a question.

### 2. Revoking access

The link is the key. To revoke someone:
1. make a new room with a new secret, from the current board;
2. share the new link with the people who should keep access;
3. the old room is retired, and the relay refuses its writes.

What the removed person already downloaded, they keep. No end-to-end encrypted tool can take that back (Keyhive treats real membership as research; `prior-art.md`, §5). The experience design should say so plainly, at the moment someone rotates.

### 3. Trusting a snapshot

A snapshot replaces history for everyone who joins after it. A buggy or malicious client could upload one that leaves things out:
- people already in the room keep the missing content, but never resend it, since their shadow says the relay has it;
- newcomers never see it;
- the room quietly diverges.

It's no worse than any holder of the link deleting cards on purpose, but it's harder to notice. Two mitigations, both cheap:
- **The relay keeps compacted log segments for 30 days, instead of deleting them.** A client that suspects a bad snapshot can ask for a full replay.
- **A client checks a new snapshot against its own shadow before trusting it.** One that's missing structs the client already holds is reported, not applied.

The second needs some care, and it's a build-time decision, not an M2 blocker.

### Also worth knowing

- **What the relay does see:** room IDs, IP addresses, when people connect, how many there are, and the size and timing of messages. Behind a company VPN that's acceptable. A hosted public relay should say so in its privacy note.
- **History times are each client's own clock.** A badly set clock puts its changes at the wrong time in "since you were away". The relay could stamp its own receive time beside each sequence number to cross-check.
- **One board per browser has to go.** The spike gives each shared room its own IndexedDB database. The real build needs the same, plus a way to list your boards. That's also the fix for O2 and O3 in `merge-scenarios.md`.
- **Spike shortcuts to undo before shipping:**
  - it accepts WebSocket connections from any origin;
  - it has no quotas or rate limits;
  - it sends JSON text frames, not binary;
  - it has no TLS of its own, which belongs to a reverse proxy anyway;
  - it keeps each room's whole log in memory until compaction.

## Self-hosting

The requirement is one container, serving the static app, the relay, and snapshot storage on local disk. The spike already is that, minus packaging. The single Go binary, about 9 MB:
- serves the app's single HTML file at `/`;
- runs the relay at `/rooms/{id}`;
- stores each room as one append-only log and one snapshot file under a data directory.

A container image is that binary, the HTML file and a volume for the data directory. It needs no database, nothing behind it, and no secrets. TLS comes from the company's usual reverse proxy. WebSockets over 443 pass most corporate proxies _(recalled)_. Backing up is copying a directory, which is safe at any moment, since logs only append and snapshots are swapped in atomically.

## The public demo (the PM's open question)

Strangers find the board from a public link (Q52, Q53), and GitHub Pages can't run a relay. The options:

| Option | What a stranger gets | Cost and risk |
|---|---|---|
| **A. A hosted demo relay** | Share a link and collaborate for real, from the Pages build | A small always-on server. It needs room quotas (say 5 MB), expiry after 30 idle days, rate limits and a privacy note. Abuse is limited to unreadable blobs, since content is encrypted. Someone has to keep it running. |
| **B. Peer-to-peer (WebRTC)** | Live collaboration only while both people are online | It still needs a public signaling server, and there's no stored snapshot, so it fails requirement 30. Corporate networks often block it _(recalled)_. |
| **C. Self-host only** | "Sharing needs a relay: here's how to run one" | Nothing to operate. Strangers can't try the headline M2 feature. |
| **D. C, plus tabs in one browser** | Two tabs of one browser sync live, with no server | A demo of the feel only. Cheap: the same provider, with BroadcastChannel in place of the WebSocket, which the build plan has as M2's first slice anyway. |

**Recommendation: D at first, then A once M2 is solid.** The PM asked about falling back to WebRTC where a company's policy blocks a hosted relay. Engineering's answer, in Q64, is two fallbacks that fit better: the relay hosted from a pilot user's laptop, and changes passed as encrypted files through approved channels. The recommendation, so a stranger's first experience of sharing works rather than half-works. A is cheap to run, but it's an operational commitment, so it's the PM's call. It goes into `questions.md`.
