# 0022: Changes by file

Status: Accepted (sprint 12, slice 4). The product side is Q64 (f) and Q72, answered on 2026-10-08.

## Context

Requirement 37: where a company allows neither a hosted relay nor one on a laptop, a shared plan still has to travel. Q64 settled on encrypted "changes files" sent through channels the company already approves, such as email or a shared drive. Q72 settled how the key gets there: a Can edit link sent once by a second channel, with no key in any file.

A Yjs document merges any updates, in any order, and applying one twice changes nothing. So a file holding a whole board can be merged into any copy of the plan, at any time, with no server and no record of who has what.

## Decision

**A plan shared by file** is a shared plan with no relay. `SharedPlan.relay` becomes optional. Such a plan has a room ID and a secret like any other (ADR 0018), and its link says `file=1` in place of a relay: `#v=1&room=…&key=…&file=1`.
- Opening the link makes an empty plan, which says it's waiting for changes and offers **Merge changes…**.
- There's only a Can edit link. Without a relay, nothing can enforce view-only: anyone with the encryption key can seal a file. View links stay a relay feature.
- From a page opened from disk, the link points at the public build, since a `file://` address means nothing on another computer.

**The file,** `<plan>-changes-<date>.pbchanges`, is binary:

| Part | What it is |
|---|---|
| magic | the bytes `PBCH` |
| version | a varint, 1 |
| room | bytes: the room ID, so a file finds its plan |
| board | bytes: the whole board as one Yjs update, sealed with the plan's key, kind `file` |
| history | bytes: empty, kept for sprint 13's history document (ADR 0020) |

No plan name and no key are in clear text. The plan's name travels inside the board, as it does through a relay. The room ID is random, and says nothing about the plan.

**Sending** always writes the whole board: no record of what each person has, so no file can be "the wrong one". A board of a few hundred cards is tens of kilobytes _(priors)_, which any email allows.

**Merging** (**File › Merge changes…**):
- The file's room finds the plan in this browser's list; the plan opens if it isn't the one on screen.
- The file is opened with the plan's key, and applied outside undo, as changes from the relay are. Undoing a merge would delete other people's work at the next send.
- The notice says what changed, counted as `planChanges` counts it ("Merged: 4 cards changed"), or "Nothing new".
- Refused, with a reason: a file that isn't one, a newer format, a room this browser doesn't have, a key that doesn't open it, or a plan only viewed.

**Relay-shared plans** can send and merge files too. A merged file's changes then go on to the relay like any other change, which lets someone who was away from the network catch up from an email.

**Making new links** on a plan shared by file gives it a new room and key. Files made with the old key no longer merge, and the people who had the old link can't read new files. No relay needs telling.

## Alternatives

- **Only the changes since the last send.** Smaller files, but a lost or skipped file would leave a gap no later file fills. Whole boards are simpler, and small enough.
- **A key in the first file** (Q72 b): one email is enough, but a forwarded or misfiled attachment could be read.
- **WebRTC** (Q64 b): needs signaling and often TURN, both servers, and doesn't work asynchronously.

## Consequences

- The file format is versioned, and has fixtures from the release that adds it (ADR 0005).
- Files have no author or time. History (sprint 13) fills the empty slot.
- Someone who merges files and never sends any is invisible to the others. That's the nature of the channel; the board can't know who has what.
