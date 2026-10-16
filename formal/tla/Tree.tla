------------------------------ MODULE Tree ------------------------------
(* Grouping under concurrent moves, and loop repair (ADR 0004, requirement 14).

   Each card has two keys in the shared document: `parent`, which moves and
   repairs write, and `move`, which only moves write: the group the card left
   and the move's stamp. Yjs settles concurrent writes to one key the same way
   on every computer. With two people, which is all this model has, that
   means: a write wins over every write its author had already seen, and
   between writes made apart, the client ID decides. With three or more, Yjs
   orders writes by YATA, where the answer can also depend on the client of a
   write both of them saw; that isn't modeled, and the ASSUME below keeps the
   model to two.

   The stamps on moves are a Lamport clock, counting further than the code's
   (`latestMoveCounter` in src/store/schema.ts counts only each card's
   current move, and repairs carry no stamp): an over-approximation, which a
   copy counting the code's way also passes. Each move here is one card; a
   drag of several cards (`moveItems`) gives them one stamp, and ties fall to
   the card ID, which isn't modeled.

   A client's document is the set of writes it has seen, so syncing is union.
   A move is refused on screen if it would put a card inside itself
   (`wouldCreateCycle`), but two moves made apart can still make a loop.
   Repair (`loopRepairs` in src/domain/tree.ts) settles every loop: the card
   whose move has the highest stamp goes back to the group it left, or to the
   top level if that would loop too. *)

EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS Items, Clients, MaxMoves, Top

ASSUME Top \notin Items

\* `Beats` below is how Yjs settles two writers, not three or more (see the header).
ASSUME Cardinality(Clients) = 2

Stamp == [n: Nat, c: Clients]

VARIABLES seen, moves

vars == <<seen, moves>>

\* A write: to key `parent` or `move` of a card, with a value, its stamp, and the stamps of
\* every write its author had seen. For `move`, the value is the group left.
Write == [item: Items, key: {"parent", "move"}, val: Items \cup {Top}, st: Stamp, past: SUBSET Stamp]

ClientOrder == CHOOSE f \in [Clients -> 1..Cardinality(Clients)] : \A a, b \in Clients : a # b => f[a] # f[b]
ItemOrder == CHOOSE f \in [Items -> 1..Cardinality(Items)] : \A a, b \in Items : a # b => f[a] # f[b]

\* Yjs, with two people: the later of two writes to one key is the one that saw the other; if neither did, the client ID decides.
Beats(w, v) == v.st \in w.past \/ (w.st \notin v.past /\ ClientOrder[w.st.c] > ClientOrder[v.st.c])

\* The winning write to a key, if any.
Winner(D, i, k) ==
  LET ws == {w \in D : w.item = i /\ w.key = k}
  IN IF ws = {} THEN <<>> ELSE <<CHOOSE w \in ws : \A v \in ws : v = w \/ Beats(w, v)>>

Stamps(D) == {w.st : w \in D}

\* A move stamp's order: counter, then client (src/domain/tree.ts, `outranks`).
Later(s1, s2) == s1.n > s2.n \/ (s1.n = s2.n /\ ClientOrder[s1.c] > ClientOrder[s2.c])

ParentIn(D, i) == LET w == Winner(D, i, "parent") IN IF w = <<>> THEN Top ELSE w[1].val

Parents(D) == [i \in Items |-> ParentIn(D, i)]

MaxN(D) == IF D = {} THEN 0 ELSE (CHOOSE w \in D : \A v \in D : w.st.n >= v.st.n).st.n

\* Following parents from i, within n steps, reaches a.
RECURSIVE Reaches(_, _, _, _)
Reaches(P, i, a, n) == IF n = 0 \/ i = Top THEN FALSE ELSE IF i = a THEN TRUE ELSE Reaches(P, P[i], a, n - 1)

N == Cardinality(Items) + 1

Within(P, i, a) == Reaches(P, i, a, N)

OnLoop(P, i) == P[i] # Top /\ Within(P, P[i], i)

Acyclic(P) == \A i \in Items : ~OnLoop(P, i)

\* The move stamp a card carries, or none.
MoveOf(D, i) == Winner(D, i, "move")

\* Who loses a loop: the card with the latest move; a card that never moved ranks below one that did,
\* and then the card ID decides.
Outranks(D, a, b) ==
  LET ma == MoveOf(D, a)
      mb == MoveOf(D, b)
  IN IF ma # <<>> /\ mb # <<>> /\ ma[1].st # mb[1].st THEN Later(ma[1].st, mb[1].st)
     ELSE IF ma # <<>> /\ mb = <<>> THEN TRUE
     ELSE IF ma = <<>> /\ mb # <<>> THEN FALSE
     ELSE ItemOrder[a] > ItemOrder[b]

\* Settle one loop of P, as loopRepairs does each time round its loop: the card to move, and where.
LoopOf(P, i) == {j \in Items : OnLoop(P, j) /\ Within(P, j, i) /\ Within(P, i, j)}

\* At most one repair per card: loopRepairs moves each loser once, to somewhere that can't loop. A repair that
\* needs more is broken, and is cut off here, leaving its loop for RepairLeavesTree to find.
RECURSIVE Settle(_, _, _, _)
Settle(D, P, out, n) ==
  IF Acyclic(P) \/ n = 0 THEN out
  ELSE LET i == CHOOSE j \in Items : OnLoop(P, j)
           loop == LoopOf(P, i)
           loser == CHOOSE j \in loop : \A k \in loop : k = j \/ Outranks(D, j, k)
           prev == IF MoveOf(D, loser) = <<>> THEN Top ELSE MoveOf(D, loser)[1].val
           back == IF prev # Top /\ ~Within(P, prev, loser) THEN prev ELSE Top
       IN Settle(D, [P EXCEPT ![loser] = back], out @@ (loser :> back), n - 1)

Repairs(D) == Settle(D, Parents(D), <<>>, Cardinality(Items))

TypeOK == moves \in 0..MaxMoves

Init == seen = [c \in Clients |-> {}] /\ moves = 0

\* A person drags card i into group p (or out to the top), on their own copy, maybe while offline.
Move(c, i, p) ==
  /\ moves < MaxMoves
  /\ p # i
  /\ LET P == Parents(seen[c]) IN P[i] # p /\ (p = Top \/ ~Within(P, p, i))
  /\ LET st == [n |-> MaxN(seen[c]) + 1, c |-> c]
         past == Stamps(seen[c])
     IN seen' = [seen EXCEPT ![c] = @ \cup {[item |-> i, key |-> "parent", val |-> p, st |-> st, past |-> past],
                                            [item |-> i, key |-> "move", val |-> Parents(seen[c])[i], st |-> st, past |-> past]}]
  /\ moves' = moves + 1

\* Two copies meet: through the relay, another tab, or a changes file.
Sync(a, b) ==
  /\ ~(seen[a] \subseteq seen[b])
  /\ seen' = [seen EXCEPT ![b] = @ \cup seen[a]]
  /\ UNCHANGED moves

\* A copy finds a loop and writes its repair: `parent` only, never `move`.
Repair(c) ==
  /\ ~Acyclic(Parents(seen[c]))
  /\ LET r == Repairs(seen[c])
         st == [n |-> MaxN(seen[c]) + 1, c |-> c]
         past == Stamps(seen[c])
     IN seen' = [seen EXCEPT ![c] = @ \cup {[item |-> i, key |-> "parent", val |-> r[i], st |-> st, past |-> past] : i \in DOMAIN r}]
  /\ UNCHANGED moves

Next ==
  \/ \E c \in Clients, i \in Items, p \in Items \cup {Top} : Move(c, i, p)
  \/ \E a, b \in Clients : a # b /\ Sync(a, b)
  \/ \E c \in Clients : Repair(c)

Spec == Init /\ [][Next]_vars /\ \A a, b \in Clients : WF_vars(Sync(a, b)) /\ \A c \in Clients : WF_vars(Repair(c))

\* Repair always leaves a tree, whatever copy it runs on.
RepairLeavesTree == \A c \in Clients : Acyclic([i \in Items |-> IF i \in DOMAIN Repairs(seen[c]) THEN Repairs(seen[c])[i] ELSE Parents(seen[c])[i]])

\* Every parent is a card or the top level: nothing is detached.
NoDetached == \A c \in Clients : \A i \in Items : Parents(seen[c])[i] \in Items \cup {Top}

\* Once people stop moving cards, every copy ends the same, and a tree.
Settled == \A a, b \in Clients : seen[a] = seen[b] /\ Acyclic(Parents(seen[a]))
Converges == <>[]Settled
=============================================================================
