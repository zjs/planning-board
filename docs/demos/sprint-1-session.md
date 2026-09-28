# Sprint 1 tester session: script (20 minutes)

For the PM running a session with one or two PMs or EMs. There are two things to learn. First, can they break an epic down and regroup work on the board without being taught? Second, do they keep their bearings as they zoom in and out? Stay quiet while they drive, and note where they hesitate.

## Before (5 minutes, alone)

- Open the build in the browser they'll use. Click **Reset**, then **Load sample plan**.
- Recreate one real epic you'd break down, as a single card in the sample plan: double-click empty space in a cell and type its title. Pick one they'll recognize.
- Have `docs/questions.md` open for notes.

## 1. You drive (3 minutes)

Share your screen. Say one sentence: "Cards are roadmap items, and groups are cards with cards inside them." Double-click *EU data residency* to zoom in, show the breadcrumb, and zoom back out. Don't explain ⌘G, ⌘↓, the faded copies, or the ⚠ markers.

## 2. They drive (12 minutes)

Hand over control, or send them the file. Give one task at a time, and don't hint for the first 30 seconds.

| Task | What it tests | Watch for |
|---|---|---|
| "Break *[your epic]* down into three parts." | Zooming into a plain card, and creating cards inside it (Q20) | Do they find ⌘↓ or the **Zoom in** button? Do they try to drag cards onto it first? Does double-click rename it when they wanted to open it? |
| "These three belong together: *Custom roles*, *Least-privilege default role*, *Role templates for new workspaces*. Put them under one item." | Select, then ⌘G (Q15) | Do they find ⇧-click and ⌘G, or the **Group** button? Do they expect the new group to land where it does? |
| "Take *Least-privilege default role* back out of that group." | Moving out through the breadcrumb | Do they try dragging it onto the breadcrumb? What else do they try? |
| (In Time × System) "Which Identity work hasn't been assigned to a component? Assign one." | Lane zoom, "No component", and refining (Q18, Q22) | Do they click the row header? Do they notice the chip? Afterwards, do they expect the card to still say Identity? |
| "Why is *EU data residency* showing up in the Billing row?" | Faded copies (Q16) | Do they read "via cards inside"? Do they double-click to find out, or try to drag it? |
| "Look at the ⚠ markers. Which of them would you actually act on?" | Marker noise (Q23) | Which kinds they dismiss: date, size, or area. Is 17 flagged cards too many to take seriously? |
| "Get back to the full plan." | Orientation across zoom levels | Esc, the breadcrumb, or the chip? Do they know where they are before they start? |

## 3. Debrief (5 minutes)

1. When you broke the epic down, did it feel like writing sticky notes, or like filling in a form?
2. Did you ever lose track of where you were, or what the board was showing?
3. Double-click creates, renames, or zooms in, depending on where you click. Did that trip you up?
4. The faded cards and the ⚠ markers: useful, or noise?
5. What would you need before you'd use this to break down a real release?

## After

For each observation, update an open question in `docs/questions.md` (such as Q21, Q22 or Q23), or add a new one with what you saw. Quote the tester where you can. Those entries drive sprint 2 planning.
