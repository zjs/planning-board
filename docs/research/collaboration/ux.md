# The experience of collaborating

Sprint 9, slice 5. What should collaborating on this board feel like? It covers seeing each other, two people reaching for one card, being offline and coming back, finding out who changed what, and sharing.

Each design below rests on evidence from the earlier slices, and ends in a question for the PM in `questions.md` (Q58–Q65). The mockups are on a canvas of eight artboards: **[Collaboration mockups](https://claude.ai/artifact/NQAtzJV6Mz7V3pFiR1N17x)**. Artboards 2 and 5 are interactive. Press Play on them.

Three principles run through all of it. Each follows from what the earlier slices found.

1. **Never block, always show.** Requirement 19 already says conflicts are highlights, never constraints. Collaboration keeps that:
   - no locks;
   - no review step before a merge;
   - no dialogs while people work.

   Instead, the board shows what others are doing before it happens, and what happened after (`prior-art.md`, §3; `merge-scenarios.md`).
2. **Anchor everything to cards, not to the screen.** People can be in different pivots, so a position on screen means nothing on someone else's board (`presence-and-history.md`).
3. **Be honest about what encryption costs.** Old links can't be clawed back, and names are self-chosen. Say so in the interface, at the moment it matters, not in a help page (`relay-and-sync.md`).

## 1. A live session: who's here, and what they're doing (artboard 1)

**The design:**
- **Avatars** in the toolbar, and a connection pill.
- **Other people's pointers,** each with a name tag, drawn on whichever card they're over, wherever that card is in your view.
- **Selections** outlined in the person's color.
- **A card someone is dragging** gets a dashed outline, and "Dee is moving this → Q3 2027 · Billing". The target cell gets a faint outline too.
- **A cursor setting:** Everyone, Driver only, or None, for big sessions (`prior-art.md`, §4).

**Why it looks this way:**
- The spike showed card-relative presence works across pivots (`presence-and-history.md`).
- Showing drag intent is the cheapest defense against the live collisions in `merge-scenarios.md`.
- Presence colors are kept apart from the area colors on card edges, and every color comes with a name, so color never carries meaning alone.

**Question:** Q61, what people see of each other.

## 2. Two people reach for one card (artboard 2, interactive)

**The design, in four steps:**
1. Ada picks the card up, and everyone sees her hand on it.
2. Bo grabs it anyway. His drag ghost warns him: "Ada is moving this too". Most collisions should end there, with Bo letting go.
3. Ada drops first. Bo's ghost says the card just moved.
4. Bo drops anyway. The later drop wins, since Bo had seen Ada's. Each of them gets a notice with a one-click way back: "Undo" for Bo, "Put it back in Q2" for Ada.

**Why it looks this way:**
- A lock would need a server that knows who holds what. Ours can't read, and locks also strand cards when a laptop sleeps.
- Last-writer-wins per value is what every structured tool does (`prior-art.md`, §1).
- What's missing elsewhere is telling the person who lost, and this board can, because both people's edits pass through commands that know what they changed.
- With single values stored as one value (`merge-scenarios.md`, E1), the outcome is always exactly one value. Truly simultaneous drops, inside the same fraction of a second, still resolve by client ID. That's invisible in practice, and the notices cover it.

**Question:** Q60, collisions.

## 3. Following the driver (artboard 3; not in M2)

_The PM left following out of M2 (Q61, 2026-10-08). This section stays as the design to start from if it comes back._

**The design:**
- The driver chooses "Ask everyone to follow me".
- Followers get a few seconds to say "Not now", then take on the driver's **view**: axes, folded bands, expanded groups, and scroll position, centered on what the driver sees.
- A banner in the driver's color says whose view it is.
- "Stop following", or touching the board, restores the follower's own view.

**Why it looks this way:**
- M1 assumed "one person drives while others watch on a shared screen". Following carries that into M2, so people can watch on their own laptops.
- The opt-out and the "Stop following" button come from FigJam and Miro, and Miro added "Stop following" after complaints (`prior-art.md`, §4).
- Following a *view*, not a viewport, is specific to a pivoting board.

**Question:** Q61.

## 4. Connection states (artboard 4)

**The design:** one pill, always in the same place.

| State | What the pill says |
|---|---|
| Live | Live |
| Reconnecting | Reconnecting… (shown only after 3 seconds, so blips stay invisible) |
| Offline | Offline · 7 changes not shared yet |
| Offline for long, with many changes | The same, louder, with a warning that others may be changing the same cards |
| View-only link | View only |
| Can't reach the relay, on a first visit | Can't reach the relay, with nothing local to show |

**Why it looks this way:** the PM asked whether the experience should *prevent* divergence, for instance when someone drops off the VPN. The research says no:
- Every shipped tool merges automatically (`prior-art.md`, §3).
- Our merges are now predictable, or will be after the schema fixes (`merge-scenarios.md`).
- Blocking edits while offline would turn a VPN blip into lost work.

So offline is allowed, and the pill makes its meaning plain: "others can't see these yet". "Keep my changes as a scenario instead" is the opt-in formality (Ink & Switch's "formality on demand") for someone who goes offline on purpose. It waits for scenarios.

**Question:** Q59, coming back after working apart.

## 5. Since you were away (artboard 5, interactive)

**The design.** On the board itself:
- each changed card carries a marker naming who changed it;
- a moved card leaves a dashed outline where it was;
- a deleted group leaves a dashed placeholder.

Beside the board, a panel lists:
- **Yours that didn't stick,** each with a remedy: "Use mine", or "Restore the group, with your cards".
- **What others changed,** with Previous and Next to step through the changes on the board.

"Mark all as seen" clears the markers.

**Why it looks this way:**
- The spike's list in a corner works (`presence-and-history.md`), but the board is spatial. A list says "Ada moved *Invoice redesign*", and the board shows where it went.
- The markers are the same ones scenario compare needs (requirement 23: "moved cards show their old position and an arrow"), so this feature and scenarios share one diff and one set of markers.
- "Restore" depends on deleting by tombstone (`merge-scenarios.md`, E4 and E5), which is why that schema change is recommended.

**Question:** Q59.

## 6. Who changed what (artboard 6)

**The design:**
- **An Activity feed for the whole plan,** grouped by day, filterable by person, with Restore on deletions.
- **A History tab in the inspector** for one card.
- "Last changed by" in the inspector, and on the card only while you hover it, so the board doesn't gain another badge.
- A footnote: names are the ones people chose. History is kept forever, with times in each viewer's time zone (Q63).

**Why it looks this way:**
- History needs our own log, in a document of its own so it never slows the board. Logging in the board's document tripled its size (`presence-and-history.md`).
- Grouped, readable entries follow Patchwork's finding that a diff people can read beats one they have to approve (`prior-art.md`, §2).
- The footnote is the honest version of attribution with no accounts.

**Question:** Q63, history.

## 7. Sharing, view-only links, and new links (artboard 7)

**The design:**
- **Share** makes a shared copy on the company's relay and opens it, while your own copy stays on your computer. It asks for your name on this board once.
- **Two links:** "Can edit" and "Can view".
- **"Make new links…" is how to revoke.** The confirmation says plainly that people with old links keep what they already saw.

**Why it looks this way:**
- The link is the key (Excalidraw's model).
- View-only links come almost free from the write tokens the relay needs anyway (`relay-and-sync.md`, "Who can write").
- Rotating keys is the only revocation end-to-end encryption allows, and the wording is the honest part.

**Question:** Q62, access.

**Since then:** sprint 10 brought several plans per browser, and the PM chose (Q68) that Share turns the plan you're on into the shared plan, rather than making a copy.

## 8. Open, Import and New on a shared plan (artboard 8)

**The design:**
- The File menu says that Open, Import and New blank plan each make a **new** plan, and it lists your plans: shared ones, and ones only on this computer.
- Opening a file on a shared plan asks which you mean:
  - **"Open it as a new plan"** is the recommended choice;
  - **"Replace the shared plan for everyone…"** is kept, for restoring a backup, and says what it does to others.

**Why it looks this way:**
- `merge-scenarios.md` O2 and O3: an offline "new plan" wiped the shared board for everyone, and an offline "open file" made a mix of the file and the shared board.
- It needs more than one board per browser, which the spike already had to build: one database per room.

**Question:** Q58.

## What this leaves out on purpose

- **Comments and chat.** Requirement 32 asks for presence, not conversation. FigJam's cursor chat is cheap later if sessions want it.
- **Accounts, permissions beyond the two links, and signed changes** (out of scope for v1).
- **Merging scenarios** (out of scope). "Keep my changes as a scenario" only creates one.
- **A trash bin.** Restoring happens from "Since you were away" and Activity, where people already look. A bin can come later if people ask "where did it go?".
