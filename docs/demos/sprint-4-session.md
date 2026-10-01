# Sprint 4 tester session: script (20 minutes)

For the PM running a session with one or two PMs or EMs, ideally on an export of their own that includes Epic and Story issue types. There are three things to learn:

1. Do levels, bands and expanded groups make the plan's shape readable, or do they add clutter?
2. When people want to focus on one area, do they fold bands or zoom (Q34)?
3. When they want to change one card, do they open the inspector or drag (Q35)?

Stay quiet while they drive, and note what they try first.

## Before (10 minutes, with the tester)

- Ask them to export one release's worth of issues, including Issue Type and Parent: a filter, then **Export › CSV (all fields)** _(recalled)_. The file stays on their machine.
- Open https://zjs.github.io/planning-board/ in the browser they'll use. If it has an old board, click **File › Reset board**.
- Import it together. In the **Values** step, check **Issue types → levels**, and give every version a quarter.
- Have `docs/questions.md` open for notes.

## 1. You drive (2 minutes)

Share your screen on the sample plan. Do three things, with one sentence each:

1. Press **I** with a card selected: "every property of a card, editable without pivoting."
2. Set **Rows → System (component)**: "components, grouped by area."
3. Select a group and press **E**: "what's inside, right here."

Don't show folding bands, multi-zoom, or frames.

## 2. They drive (13 minutes)

Hand over control on their own import. Give one task at a time, and don't hint for the first 30 seconds.

| Task | What it tests | Watch for |
|---|---|---|
| "Which items are the big bets, and which are the details?" | Levels (Q32) | Do they read the badges and borders, or pivot to Level? Is "no level" read as "not decided", or as missing data? |
| "Sort the work by area, then within one area by component." | Nested axes (Q34) | Do they pick System (component) and use the bands? Do they fold the other areas, or zoom into one? |
| "This one is mis-sized. Fix it and keep going." | The inspector (Q35) | Do they press I, use the toolbar, or pivot and drag? Does the panel get in the way of the board? |
| "Show me what's inside these two epics, side by side." | Expand in place, multi-zoom (Q33) | E, ⌘↓, or double-click? Are the chips and colored edges enough to tell whose card is whose? |
| "Why does this epic show up in the Billing row?" | Frames (Q33) | Do they read the frame as "these cards put it here"? Do they try to drag the card inside it? |
| "Something in this epic doesn't fit. Find it." | Level marker, ⚠ counts (Q23) | Which markers would they act on, and which are noise? |

## 3. Debrief (5 minutes)

1. Could you tell the shape of the plan at a glance: what's an initiative, what's a story, what belongs to what?
2. When you wanted to focus on one area, what did you reach for? Was folding or zooming more natural?
3. Did you use the inspector, or did dragging feel faster? When would you want each?
4. Did the chips and frames help you see which cards belong to which group, or did they make the board busier?
5. What would you need before you'd use this to lay out a real release with your team?

## After

For each observation, update an open question in `docs/questions.md` (Q33, Q35, and Q23 first), or add a new one with what you saw. Add feedback to `docs/backlog.md` under a theme. If folding bands and zooming both get used, note when each was chosen. If only one is used, that settles Q34's open half.
