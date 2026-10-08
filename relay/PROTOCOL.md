# Relay protocol, version 1

How the app and the relay talk (ADR 0017). The relay numbers, stores and forwards encrypted updates; it can't read them. This is the contract between the two, so a relay and an app built at different times know whether they can work together.

## Connection

A WebSocket at `/rooms/{room}`. `room` is 16 to 64 characters of `A–Z a–z 0–9 _ -`, made at random by whoever shares the plan.

Every message is one binary frame: a type byte, then the type's fields in order. Integers are unsigned varints (as Go's `binary.Uvarint`). Bytes are a varint length, then the bytes. `data` is always ciphertext made by a client; the relay stores and forwards it as given.

The first frame from the client must be `hello`. Before it, the relay answers anything else with error 11 and closes.

## From the app

| Type | Name | Fields | Meaning |
|---|---|---|---|
| `0x01` | hello | version, token, after, flags | I speak `version`; here's the write token, or empty to only read; send me everything after update `after`. Flags: `1` create the room with this token if it doesn't exist (repeating it with the same token is harmless); `2` replay every update the relay keeps, ignoring the snapshot. |
| `0x02` | update | ref, data | A change to number, store and forward. `ref` is the app's own, echoed in the ack or the refusal. |
| `0x03` | snapshot | upto, data | The whole plan as of update `upto`. The relay keeps the updates it covers for 30 days, then drops them. |
| `0x04` | ephemeral | data | Presence: forwarded to everyone else in the room, never stored. A view link may send it too. It has a rate of its own (30 a second by default, `-presence-rate`), and over that, or over 4 KiB, it's dropped without an error, since a newer one follows within seconds. |

## From the relay

| Type | Name | Fields | Meaning |
|---|---|---|---|
| `0x81` | snapshot | upto, at, data | The latest snapshot, when the app is behind it. `at` is when the relay received it, in Unix milliseconds. |
| `0x82` | update | seq, at, data | An update, in sequence order, with when the relay received it. |
| `0x83` | synced | head, upto, epoch, self, canWrite | Caught up. `head` is the latest update; `upto` what the latest snapshot covers; `epoch` the room's 16 random bytes, made when it was created; `self` this connection's number, as other connections see it in `ephemeral` and `left`; `canWrite` is 1 if the token matched. |
| `0x84` | ack | ref, seq, at | Update `ref` is stored as number `seq`. |
| `0x85` | ephemeral | from, data | Someone's presence. |
| `0x86` | left | from | That connection closed. |
| `0x87` | error | code, message, [ref] | A refusal. `message` is for a person. `ref` follows when it refuses an update. |

## Error codes

| Code | Meaning | Closes? |
|---|---|---|
| 1 | The app speaks a newer version: the relay needs updating | yes |
| 2 | The app speaks an older version: reload, or use a newer build | yes |
| 3 | Unknown room, and the hello didn't create it | yes |
| 4 | Create asked for a room that exists with another token | yes |
| 5 | A write without the room's write token | no |
| 6 | A frame over the relay's message limit | no |
| 7 | The room is at its size limit | no |
| 8 | The relay is at its total size or number of rooms | create: yes; update: no |
| 9 | Rate limited | create: yes; update: no |
| 10 | A frame the relay can't read | no |
| 11 | Something other than hello came first | yes |
| 12 | The relay couldn't store something | no |

## What the app must do

- **Number nothing itself.** The relay's `seq` is the order. The app keeps the last `seq` it has applied (its cursor) and asks for everything after it.
- **Check the epoch.** If `synced` brings an epoch other than the one the app saw before, or a `head` below its cursor, the room was replaced or restored from a backup: start the cursor again from 0 and send what the relay is missing.
- **Encrypt everything,** binding the room, the kind of message, and for snapshots `upto`, as additional data, so the relay can't move ciphertext between rooms or kinds (ADR 0018).

## Versioning

`version` changes only when a frame changes meaning. New frame types and new trailing fields can be added within a version: a relay or app that doesn't know them ignores them.
