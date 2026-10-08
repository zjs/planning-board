# Prior art: how other tools handle collaboration

Sprint 9, slice 1. This covers how comparable tools and research projects handle seven things: two people changing the same thing, offline work, presence, history, sharing, encryption and infrastructure. For each it notes what that implies for this board. It stops at what changes a decision.

Provenance tags: _(confirmed)_ = checked against the linked source on 2026-10-08; _(recalled)_ = from memory, unverified; _(priors)_ = reasoned guess. Sources are listed at the end.

## The short version

1. **Structured tools settle conflicts per property, by last write.** For a tree of objects with properties, Figma, Excalidraw and (reportedly) Linear don't merge clever values. A conflict only exists when two people change the same property of the same object, and then one value wins. People accept this because, in a live session, they see it happen. Our board is structured, so this is the model to start from.
2. **Server-authoritative tools lean on the server for the hard cases, and we can't.** Figma's server rejects a reparenting that would make a cycle, and tldraw's server rebases clients. Our relay can't read the plan, so every rule has to be deterministic on each client, the way Excalidraw's peer model and pure CRDTs work. ADR 0004's repair-on-read is the right shape. It's unbuilt.
3. **The field moved away from reviewing before merging.** Ink & Switch's Upwelling required drafts that were reviewed before merging, but their later prototype has people edit directly, then makes it easy to see what changed and revert it. Notion moved from last-writer-wins to a CRDT because offline mode made lost edits common. Both point to the same answer for offline work: merge automatically, then show what changed and make reverting it easy.
4. **"Who changed what" isn't free in a CRDT.** Yjs doesn't record authors. Its attribution helper is experimental, its client IDs change every session, and its operations carry no wall-clock time. Anything like "Dana moved this to Q3 on Tuesday" needs metadata of our own.
5. **End-to-end encryption shapes the relay.** The relay can't run the Yjs sync handshake, because that means computing diffs from document state. It has to serve an opaque log by sequence number, with snapshots made and encrypted by clients (the secsync design). The popular Yjs servers (y-websocket, y-sweet, Hocuspocus, Liveblocks) all hold a readable document on the server, so none fits as is.
6. **Presence has settled conventions:** avatars, named cursors, following someone with an opt-out, and "bring everyone to me". People ask for ways to quiet cursors in big sessions.

## Side by side

| | Who decides | Two edits to one value | Offline | History and attribution | Encryption |
|---|---|---|---|---|---|
| **Figma** | Server | The last to reach the server wins, per property _(confirmed)_ | Edit for any length of time. On reconnect, it downloads a fresh copy and reapplies the offline edits _(confirmed)_ | Version history _(recalled)_ | None |
| **Excalidraw** | Peers, through a relay that does no coordination _(confirmed)_ | Higher element version wins; a random nonce breaks ties _(confirmed)_ | Not designed for it _(priors)_ | None _(recalled)_ | AES-GCM in the browser, key in the URL fragment _(confirmed)_ |
| **tldraw sync** | Server, which holds the authoritative copy _(confirmed)_ | Server rebases clients (secondary source) | Reconnect gets the changes since the client's last server clock (secondary source) | Not covered | None |
| **Linear** | Server, which gives every transaction a global order (reverse-engineered) | Per-field last writer wins (secondary source, unconfirmed) | Queues transactions, resends them on reconnect | Activity feed per issue _(recalled)_ | None |
| **Notion** | Server, plus a CRDT for text since its offline mode (2025) _(confirmed)_ | Text merges by CRDT; other properties not described | Offline mode per page, in the desktop and mobile apps | Page history _(recalled)_ | None |
| **Google Docs** | Server, using operational transformation _(recalled)_ | Characters merge | Offline edits merge on reconnect; real-time collaboration needs a connection | Version history and named versions; suggesting mode | None |
| **Jira** | Server | The last save wins, historically with no warning _(confirmed: 2011 thread, still-open feature request)_ | No | An issue's history lists every field change _(recalled)_ | None |
| **Actual Budget** | Clients; the server stores messages and moves them around _(confirmed)_ | Messages ordered by hybrid logical clock _(confirmed)_; per-cell last write wins _(priors)_ | Local-first: fully offline | Not covered | Optional, with a password-derived key. A forgotten password means no recovery _(confirmed)_ |
| **Upwelling** (Ink & Switch) | Clients (Automerge) | Drafts kept apart until merged _(confirmed)_ | Drafts | Reviewed before merging | No |
| **Patchwork "edit groups"** (Ink & Switch) | Clients (Automerge) | Direct edits _(confirmed)_ | Local-first | A diff view, edits grouped with a rationale, and easy revert _(confirmed)_ | No |
| **secsync** | Clients; the server relays and stores ciphertext | Yjs or Automerge rules | Snapshots plus updates that reference them _(confirmed)_ | Not covered | End-to-end, including presence ("ephemeral messages") _(confirmed)_. Beta, an early research demo |
| **Keyhive** (Ink & Switch) | Clients | Automerge rules | Local-first | Signed capabilities | End-to-end, with a group key agreement that tolerates concurrent changes (BeeKEM) _(confirmed)_ |

## 1. Two people, one card, the same seconds

**What others do.**
- **Figma** stores the document as object → property → value. Edits to different properties, or to the same property on different objects, never conflict. When two people change the same property of the same object, the last value to reach the server wins, with no timestamps, because the server defines the order _(confirmed)_.
- **Figma, and pending edits.** A client applies its own edits at once. It ignores incoming changes that conflict with its own edits the server hasn't acknowledged yet, so the screen doesn't flicker back and forth _(confirmed)_.
- **Excalidraw** started with whole-scene replacement, and then hit, in order:
  - lost additions, fixed by merging the union of element IDs;
  - deleted shapes coming back, fixed with tombstones;
  - lost concurrent edits, fixed with per-element version numbers;
  - ties, broken by a random nonce, so every peer picks the same winner.

  Two separate implementations hit the same bugs _(confirmed)_. Their merge also skips the element someone is dragging or resizing at that moment, so a remote update can't yank a shape from under your pointer (seen in a fork's diff, not upstream).
- **Notion's** lesson from text applies to short values like card titles. Even when nothing is lost, "each collaborator's intent is not always preserved perfectly" in a short sentence edited by two people _(confirmed)_. A character-merged title can read as nonsense.
- **Jira,** where these plans end up, has historically let the second save overwrite the first without a word _(confirmed, as of the sources found)_. The bar users bring from Jira is low.

**What it means here.**
- **Our model already looks like Figma's.** An item is a map of fields, a multi-value property is a set, and commands write only what changed (ADR 0006). Two people editing different fields or different values of one card don't conflict.
- **Our single-value rule isn't last writer wins.** After two concurrent drops to different quarters, `readPlan` shows the value with the **lowest ID**, and the set keeps both until someone edits it again. Figma's and Excalidraw's tie rules are just as arbitrary, but each resolves to one value. Slice 2 measures whether ours reads as a bug.
- **Don't yank the card being dragged.** Excalidraw's rule, holding a remote update to the element someone is dragging, is worth copying. The local drag should finish against what the person saw.
- **Titles stay whole-string last writer wins.** Notion's result says merging characters in a five-word title isn't worth it. ADR 0006's note about `Y.Text` titles can be dropped.

## 2. Who changed what

**What others do.**
- **Yjs records no authors.** `PermanentUserData` maps client IDs to user names, but it's experimental and lightly documented. Client IDs change with every session, so old changes can show as "Unknown user". Deletions aren't tied to client IDs at all _(confirmed: Yjs forum, maintainer replies)_. Yjs v14 adds attribution data, as shown in BlockNote's versioning example, but its API couldn't be verified.
- **CRDT operations carry no wall-clock time,** so "what changed on Tuesday" needs timestamps stored separately (secondary source; true of Yjs's design _(recalled)_).
- **Liveblocks** offers version history over Yjs, with each snapshot recording when it was made and who contributed _(confirmed)_.
- **Patchwork** found that a diff view, with edits grouped and a rationale added afterwards, made changes easy to understand and revert. Its authors call reverting "a form of undo that's not limited to the time order that edits happened" _(confirmed)_.
- **Jira's** issue history lists each field change with who and when _(recalled)_, which is the form these users already know.

**What it means here.**
- **We'll need our own history.** Yjs's helper is experimental and loses identities across sessions. Two forms are realistic:
  - a log of our own, one entry per command (who, when, which card, what changed), stored in the same encrypted document;
  - snapshots taken at points in time and diffed.

  Slice 4 compares them, along with `PermanentUserData`, on cost.
- **One diff serves three features.** The pure plan diff that scenario compare needs (requirement 23, ADR 0003) also serves "since you were away" and a version history.
- **Who means a self-chosen name.** There are no accounts, and the server can't vouch for anyone. Attribution is a courtesy among people who share a link, not an audit trail. A malicious holder of the link can claim any name. Signed changes (Keyhive's direction) would fix that, at a cost far beyond M2.

## 3. Offline, and coming back

**What others do.**
- **Figma** lets you edit offline for any length of time. On reconnect, it downloads a fresh copy and reapplies your offline edits on top _(confirmed)_. Since the last value to reach the server wins, your stale offline edits beat what others did in the meantime.
- **Linear** queues offline transactions and resends them in order (reverse-engineered).
- **Notion** built offline mode in 2025. Last writer wins would have "completely lost" one person's edits, and offline mode would have made that common, so text moved to a CRDT _(confirmed)_. Its offline mode is per page and limited (database rows are capped at first).
- **Google Docs** merges offline edits on reconnect. Real-time collaboration needs a connection, and edits that never synced can't be recovered from version history (secondary sources).
- **Upwelling** made every edit happen in a draft, which its authors reviewed and merged when ready. Ink & Switch's next prototype dropped that: "No branches or drafts, no suggested changes." The reason: drafts and suggesting modes force a formal choice up front. Their phrase for the alternative is "formality on demand" _(confirmed)_.
- **Actual Budget** orders changes with hybrid logical clocks, so a merge after offline work follows wall-clock time, roughly _(confirmed: HLCs; priors: how ties go)_.

**What it means here.**
- **Merging is automatic everywhere.** Not one shipped tool asks for review before an offline merge. The research tool that tried it moved away. That argues against option (b), a review step, for the board's default.
- **Showing what happened is the gap.** Figma silently lets your offline edits win, and Google Docs silently merges. Neither tells you what moved while you were away. A board is spatial, so changes are easy to miss after a pivot. "Since you were away", built from the diff, is where this board can do better.
- **Scenarios are our "formality on demand".** For someone who wants to work offline on purpose, "keep this as a scenario" (ADR 0003) is the draft that Upwelling made everyone use. It's opt-in, and scenario compare is already planned.
- **Which edit wins after an hour offline is a product choice.** The options:
  - **Arrival order (Figma):** the edits that reached the relay last win, which favors the person who was offline;
  - **Wall-clock time (Actual):** whoever edited later in real time wins;
  - **Plain Yjs:** concurrent edits resolve by client ID, which is arbitrary but consistent.

  Slice 2 makes these concrete, and it'll be a question for the PM.

## 4. Presence

**What others do.**
- **FigJam:**
  - avatars show who's on the board, and clicking one follows that person's view;
  - "Spotlight me" asks everyone to follow you, and each person has a few seconds to say "Not now" _(confirmed)_;
  - cursor chat: press /, type, and the text shows by your cursor for a few seconds and isn't logged _(confirmed)_.
- **Miro:**
  - "Bring everyone to me";
  - "Stop following" for the people brought along, added after complaints that people felt stuck _(confirmed)_;
  - "Hide collaborators' cursors", which also hides the board owner's.

  Requests that recur: show only the presenter's cursor, and a laser pointer for facilitators _(confirmed: forum requests, not shipped as far as found)_.
- **Excalidraw's** first step to multiplayer was separating what's shared (the elements) from what's personal (selection, the canvas) _(confirmed)_.

**What it means here.**
- **Our state is already split.** Selection, expanded groups, folded bands and the current view are per-viewer state, not stored in the document (ADRs 0012, 0013 and 0015). Presence can broadcast them without touching the plan.
- **Following should be opt-out, not a lock.** FigJam's follow-with-"Not now" fits the shared-screen session that M1 assumes ("one person drives while others watch").
- **Following has a design problem other tools don't.** Our viewers can be in different pivots. Following someone means taking on their view (the axes, folding and expansion), not just their scroll position. Other tools follow a viewport over one shared canvas.
- **Plan for quieter cursors from the start.** A setting to show only the driver's cursor, or nobody's, keeps big sessions calm.

## 5. Sharing, keys and revoking access

**What others do.**
- **Excalidraw** generates a random AES-GCM key in the browser and puts it after the `#` in the link, which browsers never send to a server. The server stores only the encrypted blob _(confirmed)_. Anyone with the link can read the scene, and there's nothing to revoke.
- **Actual Budget** derives the key from a password. Changing the key means a sync reset, and a forgotten password loses the data _(confirmed)_.
- **Keyhive** treats real group access control (adding and removing people, with forward secrecy) as a research project. It needs a group key agreement built for concurrency (BeeKEM), because MLS's TreeKEM assumes a server that orders operations _(confirmed)_.

**What it means here.**
- **The link is the key.** With no accounts and a relay that can't read anything, it's the realistic model for M2.
- **Revoking access means changing the key.** You make a new room with a new key, copy the plan into it, share the new link with the people who should keep access, and retire the old room. Anyone who had the old link keeps what they already downloaded. That's the price of the fixed encryption constraint, and the UX has to say so honestly.
- **Real membership is a later milestone, if ever.** Keyhive shows how deep that goes.

## 6. Relays and infrastructure

**What others do.**
- **The Yjs sync handshake** has a client send its state vector and the other side reply with what it's missing _(confirmed)_. Building that reply means reading the document.
- **The reference y-websocket server** keeps documents in memory. Scaling it means y-redis _(confirmed)_.
- **y-sweet** (Rust, persists to S3 or a file system) and **Hocuspocus** (Node, persistence through hooks and extensions) both hold a live Yjs document on the server _(confirmed)_. So does Liveblocks _(recalled)_.
- **secsync** stores a snapshot per document, updates that each point at a snapshot, and short-lived encrypted messages for presence _(confirmed)_. Its stated reason is load time: start from a snapshot, then apply only the updates after it.
- **tldraw** requires exactly one live room per document, globally, or users "will overwrite others' changes", and enforces it with one Cloudflare Durable Object per room _(confirmed)_.

**What it means here.**
- **No off-the-shelf Yjs server fits.** Each one needs to read the document, so we build the relay, as the requirements already say (in Go).
- **The protocol is the secsync shape.**
  - The relay gives each encrypted update a sequence number, appends it to a log, and forwards it to the room.
  - A client catches up by asking for everything after the last number it saw.
  - Now and then a client uploads an encrypted snapshot covering the log up to some number, and the relay can drop what it covers.

  The relay never needs Yjs.
- **Our relay is safer than tldraw's by design.** A relay that only appends and forwards can't overwrite anyone's changes, since merging happens in the clients. It doesn't need tldraw's one-room rule to stay correct, only to stay fast.
- **Self-hosting stays one small binary.** A Go relay with an append-only log on local disk fits the "one container" requirement with no database.

## What we're not taking

- **Operational transformation (Google Docs).** It needs a server that reads and transforms operations.
- **A server that rejects invalid edits (Figma).** The relay can't read edits.
- **Drafts for everyone (Upwelling).** The authors moved away from it themselves.
- **Real group membership (Keyhive).** It's research-grade and Rust/Wasm, and the link-as-key model covers M2.
- **A movable-tree CRDT (Kleppmann et al., Loro).** Kleppmann's "undo, do, redo" algorithm is correct in general, but it needs a log of moves replayed in timestamp order. ADR 0004 already rejected it for repair on read, and the merge harness will show whether that repair is enough. Loro has a native movable tree, but switching CRDT libraries isn't on the table (ADR 0006).

## Sources

- Figma, [How Figma's multiplayer technology works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) and [Making multiplayer more reliable](https://www.figma.com/blog/making-multiplayer-more-reliable/)
- Excalidraw, [End-to-end encryption in the browser](https://plus.excalidraw.com/blog/end-to-end-encryption) and [Building Excalidraw's P2P collaboration feature](https://plus.excalidraw.com/blog/building-excalidraw-p2p-collaboration-feature)
- tldraw, [tldraw sync](https://tldraw.dev/docs/sync) and [Collaboration](https://tldraw.dev/sdk-features/collaboration); Grida's secondary write-up, [tldraw sync architecture](https://grida.co/docs/wg/research/crdt/tldraw)
- Linear, reverse-engineered: [reverse-linear-sync-engine](https://docsearch.algolia.com/mcp/docs/repo/wzhudev/reverse-linear-sync-engine)
- Notion, [How Notion handles concurrent editing with CRDTs](https://www.notion.com/blog/how-notion-handles-concurrent-editing-with-crdts); AlternativeTo, [Notion rolls out Offline Mode](https://alternativeto.net/news/2025/8/notion-rolls-out-offline-mode-edit-pages-without-an-internet-connection)
- Jira: [JRACLOUD-37142](https://jira.atlassian.com/browse/JRACLOUD-37142) and [How to avoid issue edit conflicts in JIRA?](https://community.atlassian.com/forums/Jira-questions/How-to-avoid-issue-edit-conflicts-in-JIRA/qaq-p/224773)
- Actual Budget, [Sync](https://actualbudget.org/docs/getting-started/sync/), and James Long, [Actual: using CRDTs in the wild](https://jlongster.com/using-crdts-in-the-wild)
- Ink & Switch, [Upwelling](https://inkandswitch.com/upwelling/), Kleppmann's [Upwelling: version control for writers](https://kleppmann.com/2023/03/09/upwelling-version-control-for-writers.html), [Patchwork notebook: edit groups](https://www.inkandswitch.com/patchwork/notebook/2024-version-control/05/) and [Keyhive](https://www.inkandswitch.com/project/keyhive/)
- secsync / Serenity: [naisho (secsync's predecessor)](https://github.com/SerenityNotes/naisho) and [NLnet project page](https://nlnet.nl/project/Naisho/)
- Yjs: [y-websocket](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket); forum threads on [PermanentUserData](https://discuss.yjs.dev/t/how-to-use-y-permanentuserdata/154), [capturing who authored a change](https://discuss.yjs.dev/t/capturing-who-authored-last-change/837) and [end-to-end encryption](https://discuss.yjs.dev/t/implementing-end-to-end-encryption/308); [BlockNote's Yjs 14 versioning example](https://www.blocknotejs.org/examples/collaboration/versioning-yjs14); [Liveblocks version history](https://liveblocks.io/docs/products/sync/version-history.md)
- Servers: [How y-sweet works](https://docs.jamsocket.com/y-sweet/concepts/how-ysweet-works) and [Hocuspocus persistence](https://tiptap.dev/docs/hocuspocus/guides/persistence.md)
- Presence: Figma Help on [Spotlight](https://figma-signup.helpjuice.com/facilitate-meetings-with-spotlight) and [cursor chat](https://figma-signup.helpjuice.com/send-messages-with-cursor-chat) (mirrors of help.figma.com); Miro community on [Stop following](https://community.miro.com/ideas/stop-people-from-following-you-after-you-brought-them-to-you-3801) and [presenter-only cursors](https://community.miro.com/ideas/only-view-cursor-of-person-i-am-following-1377)
- Trees: Kleppmann et al., [A highly-available move operation for replicated trees](https://martin.kleppmann.com/papers/move-op.pdf) ([blog post](https://kleppmann.com/2021/10/07/crdt-tree-move-operation.html)), and [Loro's movable tree](https://loro.dev/blog/movable-tree), which couldn't be fetched (HTTP 403)
