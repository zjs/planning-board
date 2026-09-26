# Sprint 0 tester session: script (20 minutes)

For the PM running a session with one or two PMs or EMs. The goal is to learn whether "drag writes values, then pivot" is a way they'd want to plan. You're not here to teach the tool, so stay quiet while they drive and note where they hesitate.

## Before (5 minutes, alone)

- Open the build in the browser they'll use. Click **Reset** if you've been playing, so they start from the empty state.
- Have `docs/questions.md` open for notes.

## 1. You drive (5 minutes)

Share your screen. Load the sample plan and say one sentence: "Every card is a roadmap item; the axes are properties; dragging a card sets them." Then pivot **Sequence × System → Time × System → Size × Time**, and drag one card in each view. Don't explain Alt, the holding-area zones, or the gaps.

## 2. They drive (10 minutes)

Hand over control, or send them the file. Give one task at a time and don't hint for the first 30 seconds.

| Task | What it tests | Watch for |
|---|---|---|
| "Billing looks overloaded in Q2. Move two of those items to Q3." | The core drag in a time view | Hesitation before the first drag. Do they check the badges or pivot to confirm? |
| "Three items in the holding area have no area. Put them where they belong." | Tagging by dragging (req. 21; the "nobody tags components" risk) | Do they find the holding area? Does it feel like work or like sorting? |
| "*Customer-managed encryption keys* also touches the Admin Console. Show that." | Discoverability of ⌥/Alt-drop (Q1) | Do they find the modifier without help? What do they try first? |
| (In Time × System) "Nobody knows when *IdP-initiated login* happens. Make that visible." | Holding-area drop zones (Q11) | Do they read the two zones? Which one do they pick? |
| "*Webhook secret rotation* must happen before *Scoped API tokens*. Arrange that." (Scoped API tokens is inside the *Public API v2* group, so only the group card shows) | Sequence gaps (Q8); groups hiding children | Do they use a gap or an existing column? Do they get stuck because the child isn't on the board? |
| "Now look at the same plan by quarter. Is anything surprising?" | The pivot itself; spatial memory (requirements, Risks) | Do they lose their bearings? Do they miss where things were? |

## 3. Debrief (5 minutes)

1. When did it feel like moving sticky notes, and when did it feel like filling in a form?
2. What did you expect to happen that didn't?
3. After a drag, did you trust what the card's values were? What did you check?
4. Would you use this to argue about a release before it goes into Jira? What's missing for that?
5. Did the unnumbered sequence columns help, or confuse?

## After

For each observation, either update an open question in `docs/questions.md` (Q1, Q8, Q9, Q10, Q11) or add a new one with what you saw. Quote the tester where you can. Those entries drive sprint 1 planning.
