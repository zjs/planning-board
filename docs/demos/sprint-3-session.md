# Sprint 3 tester session: script (20 minutes)

For the PM running a session with one or two PMs or EMs, ideally on an export of their own with real Blocks links. There are two things to learn. First, do the red lines point at problems they'd raise in a planning meeting, or at noise? Second, does the board stay readable once dependencies show? Stay quiet while they drive. Note where they hesitate, which lines they talk about, and which they ignore.

## Before (10 minutes, with the tester)

- Ask them to export one release's worth of issues, including issue links: a filter, then **Export › CSV (all fields)** _(recalled)_. The file stays on their machine.
- Open https://zjs.github.io/planning-board/ in the browser they'll use. If it has an old board, click **File › Reset board**.
- Import it together. In the **Values** step, **give every version a quarter**. Undated cards can't be judged, so without quarters the time view shows no red at all (Q27).
- Have `docs/questions.md` open for notes.

## 1. You drive (2 minutes)

Share your screen on the sample plan. Do three things, with one sentence each:

1. Select two cards and press **L**: "the first comes before the second."
2. Drag the first card to the right of the second: "red means it's placed after something that waits on it."
3. Hover over a card: "its links show when you point at it."

Don't explain selecting a card to see its chain, groups, or loops.

## 2. They drive (13 minutes)

Hand over control on their own import, in **Time × System**. Give one task at a time, and don't hint for the first 30 seconds.

| Task | What it tests | Watch for |
|---|---|---|
| "Is anything in this plan scheduled before what it depends on?" | Order highlights (req. 16) | Do they find the red lines unprompted, and read the arrow the right way round? Are they real problems, stale Jira data, or noise? |
| "Switch to releases. Does the answer change?" | Judging at the level shown (Q12) | Do new red lines surprise them, or make sense? |
| "Pick the item you worry about most. What does it wait on, and what waits on it?" | Hover vs. select (Q39) | Do they hover or click? Is the whole chain on selection useful, or too much? |
| "Fix one red line." | Dragging as the fix | Do they move the prerequisite earlier or the dependent later? Do they notice the red clear? |
| "Add a dependency that Jira doesn't know about." | Drawing links (Q24) | Do they find L, or the **Link** button? Do they get the selection order right the first time? |
| "Is anything inside this epic in trouble?" | Group ⚠ counts (req. 18, Q38) | Do they read the ⚠ count, hover over it, and zoom in? Does mixing mismatches and link problems in one count confuse them (Q23)? |
| "Break this epic apart." (Select it and ungroup.) | Re-pointed links (Q21) | Do the extra links make sense, or does one link becoming four look wrong? |

If time is left, switch **Columns → Sequence** and ask them to lay out the next release by hand. Imported cards start without a position (Q30), so this shows whether the sequence view earns its place once links exist.

## 3. Debrief (5 minutes)

1. Which red line would you raise in your next planning meeting? Which would you ignore, and why?
2. Was the board still readable? Where did it get busy?
3. When you wanted to see a card's dependencies, did hovering or selecting give you what you needed?
4. Is there a kind of dependency the tool should know about that it doesn't (soft "prefer before", start-to-start)? Both are out of scope for now; note what they ask for.
5. What would you need to stop checking dependencies in Jira, or on a whiteboard?

## After

For each observation, update an open question in `docs/questions.md` (Q39 and Q21 first, then Q12 and Q23), or add a new one with what you saw. Add feedback to `docs/backlog.md` under a theme. Note any red line the tester called wrong, with why: it's the best evidence on whether sprint 4's conflicts panel needs "mark as reviewed" first.
