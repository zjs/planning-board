------------------------------ MODULE Sync ------------------------------
(* Sharing a plan through the relay, with offline work, crashes and restores
   (ADR 0017, relay/PROTOCOL.md, src/store/relay.ts, relay/relay.go).

   Yjs is assumed, not modeled: a document is the set of changes it has
   seen, and merging is union. A message carries a set of changes, as one
   Yjs update can hold many.

   The relay numbers each update, appends it to the room's log, queues it
   to everyone else in the room, then queues the ack to its sender, all
   under the room's lock, so each connection's queue is in sequence order.
   A snapshot replaces the log up to its reach. A backup can be restored;
   with `-restored`, every room gets a new epoch.

   Each client keeps its document, a shadow of what the relay is known to
   hold, its cursor (the last sequence number it has seen) and the room's
   epoch. The shadow, cursor and epoch are saved together, at any moment.
   Local edits are saved as they're made (y-indexeddb); changes from the
   relay are saved to the document some time later. *)

EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS Clients, MaxEdits, MaxCrashes, MaxRestores, MaxConnects, RestoreBumpsEpoch

\* The two people are interchangeable, so TLC checks one of each pair of mirror-image states.
Symmetry == Permutations(Clients)

Ids == 1..MaxEdits
None == 0

VARIABLES
  \* The relay, on disk.
  log, head, snap, epoch, backup,
  \* Each client, in memory.
  doc, shadow, cursor, seen, conn, pending, nextRef,
  \* Each client, saved.
  savedDoc, savedRec,
  \* The connection: frames to the client, and to the relay, in order.
  inbox, outbox,
  \* Bookkeeping for the bounds, and for the properties.
  made, crashes, restores, connects,
  \* Not part of the system: how many people were live when the relay was last restored, so the bounds can be
  \* shown to reach the case -restored is for.
  syncedAtRestore

relay == <<log, head, snap, epoch, backup>>
client == <<doc, shadow, cursor, seen, conn, pending, nextRef>>
saved == <<savedDoc, savedRec>>
wire == <<inbox, outbox>>
count == <<made, crashes, restores, connects, syncedAtRestore>>
vars == <<relay, client, saved, wire, count>>

\* Everything the relay holds, in its snapshot and log.
Held == snap.ups \cup UNION {e.ups : e \in {log[i] : i \in 1..Len(log)}}

\* Updates after `after`, as frames.
After(after) == SelectSeq(log, LAMBDA e : e.seq > after)
UpdateFrames(es) == [i \in 1..Len(es) |-> [type |-> "update", seq |-> es[i].seq, ups |-> es[i].ups]]

Init ==
  /\ log = <<>> /\ head = 0 /\ snap = [upto |-> 0, ups |-> {}] /\ epoch = 1
  /\ backup = [log |-> <<>>, head |-> 0, snap |-> [upto |-> 0, ups |-> {}]]
  /\ doc = [c \in Clients |-> {}] /\ shadow = [c \in Clients |-> {}]
  /\ cursor = [c \in Clients |-> 0] /\ seen = [c \in Clients |-> None]
  /\ conn = [c \in Clients |-> "off"] /\ pending = [c \in Clients |-> {}] /\ nextRef = [c \in Clients |-> 0]
  /\ savedDoc = [c \in Clients |-> {}]
  /\ savedRec = [c \in Clients |-> [cursor |-> 0, seen |-> None, shadow |-> {}]]
  /\ inbox = [c \in Clients |-> <<>>] /\ outbox = [c \in Clients |-> <<>>]
  /\ made = {} /\ crashes = 0 /\ restores = 0 /\ connects = 0 /\ syncedAtRestore = 0

\* Send one update: remembered as pending until its ack.
SendUpdate(c, ups) ==
  /\ pending' = [pending EXCEPT ![c] = @ \cup {[ref |-> nextRef[c] + 1, ups |-> ups]}]
  /\ nextRef' = [nextRef EXCEPT ![c] = @ + 1]
  /\ outbox' = [outbox EXCEPT ![c] = Append(@, [type |-> "update", ref |-> nextRef[c] + 1, ups |-> ups])]

\* Someone edits, online or not. The edit is saved with the document.
Edit(c) ==
  /\ Cardinality(made) < MaxEdits
  /\ LET id == Cardinality(made) + 1 IN
     /\ made' = made \cup {id}
     /\ doc' = [doc EXCEPT ![c] = @ \cup {id}]
     /\ savedDoc' = [savedDoc EXCEPT ![c] = @ \cup {id}]
     /\ IF conn[c] = "live" THEN SendUpdate(c, {id}) ELSE UNCHANGED <<pending, nextRef, outbox>>
  /\ UNCHANGED <<relay, shadow, cursor, seen, conn, savedRec, inbox, crashes, restores, connects, syncedAtRestore>>

\* Connect: the relay sends what's after the cursor, a snapshot first if the cursor is behind it, then synced.
Connect(c) ==
  /\ conn[c] = "off" /\ connects < MaxConnects
  \* A cursor with no epoch was left by a catch-up cut short before synced: it says nothing about which room it
  \* counted in, so start again from nothing (src/store/relay.ts, `connect`; without this, F10 in the threat model).
  /\ LET stale == seen[c] = None /\ cursor[c] > 0
         at == IF stale THEN 0 ELSE cursor[c]
         from == IF at < snap.upto /\ snap.upto > 0 THEN snap.upto ELSE at
         first == IF from # at THEN <<[type |-> "snapshot", upto |-> snap.upto, ups |-> snap.ups]>> ELSE <<>>
     IN /\ inbox' = [inbox EXCEPT ![c] = first \o UpdateFrames(After(from)) \o <<[type |-> "synced", head |-> head, epoch |-> epoch]>>]
        /\ cursor' = [cursor EXCEPT ![c] = at]
        /\ shadow' = [shadow EXCEPT ![c] = IF stale THEN {} ELSE @]
  /\ conn' = [conn EXCEPT ![c] = "joining"]
  /\ connects' = connects + 1
  /\ UNCHANGED <<relay, doc, seen, pending, nextRef, saved, outbox, made, crashes, restores, syncedAtRestore>>

\* The connection drops: frames on the way are lost, and so is what was pending.
Drop(c) ==
  /\ conn[c] # "off"
  /\ conn' = [conn EXCEPT ![c] = "off"]
  /\ inbox' = [inbox EXCEPT ![c] = <<>>] /\ outbox' = [outbox EXCEPT ![c] = <<>>]
  /\ pending' = [pending EXCEPT ![c] = {}]
  /\ UNCHANGED <<relay, doc, shadow, cursor, seen, nextRef, saved, count>>

Reset(c) ==
  /\ shadow' = [shadow EXCEPT ![c] = {}]
  /\ cursor' = [cursor EXCEPT ![c] = 0]

\* The client handles the next frame from the relay.
Receive(c) ==
  /\ conn[c] # "off" /\ inbox[c] # <<>>
  /\ LET f == Head(inbox[c]) IN
     CASE f.type = "snapshot" ->
            /\ shadow' = [shadow EXCEPT ![c] = @ \cup f.ups] /\ doc' = [doc EXCEPT ![c] = @ \cup f.ups]
            /\ cursor' = [cursor EXCEPT ![c] = IF f.upto > @ THEN f.upto ELSE @]
            /\ inbox' = [inbox EXCEPT ![c] = Tail(@)]
            /\ UNCHANGED <<seen, conn, pending, nextRef, outbox>>
       [] f.type = "update" ->
            /\ shadow' = [shadow EXCEPT ![c] = @ \cup f.ups] /\ doc' = [doc EXCEPT ![c] = @ \cup f.ups]
            /\ cursor' = [cursor EXCEPT ![c] = IF f.seq > @ THEN f.seq ELSE @]
            /\ inbox' = [inbox EXCEPT ![c] = Tail(@)]
            /\ UNCHANGED <<seen, conn, pending, nextRef, outbox>>
       [] f.type = "ack" ->
            /\ shadow' = [shadow EXCEPT ![c] = @ \cup UNION {p.ups : p \in {q \in pending[c] : q.ref = f.ref}}]
            /\ pending' = [pending EXCEPT ![c] = {q \in @ : q.ref # f.ref}]
            /\ cursor' = [cursor EXCEPT ![c] = IF f.seq > @ THEN f.seq ELSE @]
            /\ inbox' = [inbox EXCEPT ![c] = Tail(@)]
            /\ UNCHANGED <<doc, seen, conn, nextRef, outbox>>
       [] f.type = "synced" ->
            IF (seen[c] # None /\ f.epoch # seen[c]) \/ f.head < cursor[c]
            THEN \* Replaced or restored: start again from what this copy has, and reconnect at once (`reconnectNow`),
                 \* asking for everything. The new connection doesn't count against MaxConnects; a drop on the way is
                 \* Drop's to model.
                 /\ Reset(c)
                 /\ seen' = [seen EXCEPT ![c] = f.epoch]
                 /\ conn' = [conn EXCEPT ![c] = "joining"]
                 /\ inbox' = [inbox EXCEPT ![c] =
                       (IF snap.upto > 0 THEN <<[type |-> "snapshot", upto |-> snap.upto, ups |-> snap.ups]>> ELSE <<>>)
                       \o UpdateFrames(After(snap.upto)) \o <<[type |-> "synced", head |-> head, epoch |-> epoch]>>]
                 /\ outbox' = [outbox EXCEPT ![c] = <<>>]
                 /\ pending' = [pending EXCEPT ![c] = {}]
                 /\ UNCHANGED <<doc, nextRef>>
            ELSE /\ seen' = [seen EXCEPT ![c] = f.epoch]
                 /\ conn' = [conn EXCEPT ![c] = "live"]
                 /\ inbox' = [inbox EXCEPT ![c] = Tail(@)]
                 /\ IF doc[c] \ shadow[c] # {} THEN SendUpdate(c, doc[c] \ shadow[c]) ELSE UNCHANGED <<pending, nextRef, outbox>>
                 /\ UNCHANGED <<doc, shadow, cursor>>
  /\ UNCHANGED <<relay, saved, count>>

\* The relay handles the next frame from a client.
Handle(c) ==
  /\ conn[c] # "off" /\ outbox[c] # <<>>
  /\ LET f == Head(outbox[c]) IN
     CASE f.type = "update" ->
            LET e == [seq |-> head + 1, ups |-> f.ups] IN
            /\ log' = Append(log, e) /\ head' = head + 1
            /\ inbox' = [d \in Clients |->
                 IF d = c THEN Append(inbox[d], [type |-> "ack", ref |-> f.ref, seq |-> e.seq])
                 ELSE IF conn[d] # "off"
                      THEN Append(inbox[d], [type |-> "update", seq |-> e.seq, ups |-> e.ups])
                      ELSE inbox[d]]
            /\ UNCHANGED snap
       [] f.type = "snapshot" ->
            \* compact: a snapshot further than the last replaces the log up to its reach.
            /\ IF f.upto > snap.upto /\ f.upto <= head
               THEN /\ snap' = [upto |-> f.upto, ups |-> f.ups]
                    /\ log' = SelectSeq(log, LAMBDA e : e.seq > f.upto)
               ELSE UNCHANGED <<snap, log>>
            /\ UNCHANGED <<head, inbox>>
  /\ outbox' = [outbox EXCEPT ![c] = Tail(@)]
  /\ UNCHANGED <<epoch, backup, client, saved, count>>

\* A caught-up writer uploads its shadow as a snapshot reaching its cursor.
Snapshot(c) ==
  /\ conn[c] = "live" /\ cursor[c] > snap.upto
  \* One at a time, as the client's threshold allows: none already on its way.
  /\ \A i \in 1..Len(outbox[c]) : outbox[c][i].type # "snapshot"
  /\ outbox' = [outbox EXCEPT ![c] = Append(@, [type |-> "snapshot", upto |-> cursor[c], ups |-> shadow[c]])]
  /\ UNCHANGED <<relay, client, saved, inbox, count>>

\* Saving: the sync record (shadow, cursor and epoch together), or the document.
\* Saves matter only to a crash still to come, so after the last one they stop, which keeps the state space small.
SaveRecord(c) ==
  /\ crashes < MaxCrashes
  /\ savedRec' = [savedRec EXCEPT ![c] = [cursor |-> cursor[c], seen |-> seen[c], shadow |-> shadow[c]]]
  /\ UNCHANGED <<relay, client, savedDoc, wire, count>>
SaveDoc(c) ==
  /\ crashes < MaxCrashes
  /\ savedDoc' = [savedDoc EXCEPT ![c] = doc[c]]
  /\ UNCHANGED <<relay, client, savedRec, wire, count>>

\* A tab crashes or reloads: it starts again from what was saved. A shadow holding something
\* the document doesn't belongs to another copy: start again from nothing (`start` in relay.ts).
Crash(c) ==
  /\ crashes < MaxCrashes
  /\ crashes' = crashes + 1
  /\ doc' = [doc EXCEPT ![c] = savedDoc[c]]
  /\ IF savedRec[c].shadow \subseteq savedDoc[c]
     THEN /\ shadow' = [shadow EXCEPT ![c] = savedRec[c].shadow]
          /\ cursor' = [cursor EXCEPT ![c] = savedRec[c].cursor]
          /\ seen' = [seen EXCEPT ![c] = savedRec[c].seen]
     ELSE /\ shadow' = [shadow EXCEPT ![c] = {}] /\ cursor' = [cursor EXCEPT ![c] = 0] /\ seen' = [seen EXCEPT ![c] = None]
  /\ conn' = [conn EXCEPT ![c] = "off"] /\ pending' = [pending EXCEPT ![c] = {}]
  /\ inbox' = [inbox EXCEPT ![c] = <<>>] /\ outbox' = [outbox EXCEPT ![c] = <<>>]
  /\ UNCHANGED <<relay, nextRef, saved, made, restores, connects, syncedAtRestore>>

\* Whoever runs the relay backs it up, and later restores the backup, starting once with `-restored`.
\* Likewise backups, to a restore still to come.
Backup ==
  /\ restores < MaxRestores
  /\ backup' = [log |-> log, head |-> head, snap |-> snap]
  /\ UNCHANGED <<log, head, snap, epoch, client, saved, wire, count>>

Restore ==
  /\ restores < MaxRestores
  /\ restores' = restores + 1
  /\ log' = backup.log /\ head' = backup.head /\ snap' = backup.snap
  /\ epoch' = IF RestoreBumpsEpoch THEN epoch + 1 ELSE epoch
  /\ syncedAtRestore' = Cardinality({c \in Clients : conn[c] = "live"})
  /\ conn' = [c \in Clients |-> "off"]
  /\ inbox' = [c \in Clients |-> <<>>] /\ outbox' = [c \in Clients |-> <<>>]
  /\ pending' = [c \in Clients |-> {}]
  /\ UNCHANGED <<backup, doc, shadow, cursor, seen, nextRef, saved, made, crashes, connects>>

Next ==
  \/ \E c \in Clients :
       Edit(c) \/ Connect(c) \/ Drop(c) \/ Receive(c) \/ Handle(c) \/ Snapshot(c)
       \/ SaveRecord(c) \/ SaveDoc(c) \/ Crash(c)
  \/ Backup \/ Restore

Spec == Init /\ [][Next]_vars

\* ---- Properties ----

\* A client that's caught up with this room's epoch believes the relay holds only what it does.
\* If this fails, the client never resends what the relay lost.
ShadowIsTrue == \A c \in Clients : seen[c] = epoch /\ conn[c] = "live" => shadow[c] \subseteq Held

\* No change is ever lost: each is on the relay or saved on some computer.
NothingLost == \A id \in made : id \in Held \/ \E c \in Clients : id \in savedDoc[c]

\* Once everyone is connected, caught up and quiet, every copy holds every change.
Quiet == \A c \in Clients : conn[c] = "live" /\ inbox[c] = <<>> /\ outbox[c] = <<>> /\ pending[c] = {}
Converged == Quiet => \A c \in Clients : doc[c] = made

\* Not a property of the system: a witness, which the bounds must break (`npm run formal` checks they do). It shows
\* they reach a quiet state after a restore made while everyone was live and in sync, the case -restored is for.
NoQuietAfterRestoreWithEveryoneLive == ~(restores > 0 /\ syncedAtRestore = Cardinality(Clients) /\ Quiet)

\* What a caught-up client's cursor says it has seen, its shadow holds. A snapshot is the
\* shadow, said to reach the cursor, so if this failed a snapshot could drop a change.
CursorIsTrue == \A c \in Clients : seen[c] = epoch /\ conn[c] = "live" =>
  /\ \A i \in 1..Len(log) : log[i].seq <= cursor[c] => log[i].ups \subseteq shadow[c]
  /\ cursor[c] >= snap.upto => snap.ups \subseteq shadow[c]
=============================================================================
