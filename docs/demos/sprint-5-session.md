# Sprints 3–5 tester session: script (30 minutes)

One session for everything built since the last one: dependencies (sprint 3), plan structure and the inspector (sprint 4), and expand, fold and nesting (sprint 5). It replaces the separate [sprint 3](sprint-3-session.md) and [sprint 4](sprint-4-session.md) scripts, which describe zoom, now removed.

Run it with one or two PMs or EMs, ideally on an export of their own with Epic and Story issue types and real Blocks links. There are four things to learn:

1. **Dependencies:** do the red lines point at problems they'd raise in a planning meeting, or at noise?
2. **Structure:** do levels, bands and expanded groups make the plan's shape readable?
3. **Looking deeper:** do expand and fold cover what they need, or does anyone go looking for zoom?
4. **Restructuring:** when they reorganize groups, do they drag (hold to nest, the strip), or use the inspector?

Stay quiet while they drive, and note what they try first.

## Before (10 minutes, with the tester)

- Ask them to export one release's worth of issues, including Issue Type, Parent, and issue links: a filter, then **Export › CSV (all fields)** _(recalled)_. The file stays on their machine.
- Open https://zjs.github.io/planning-board/ in the browser they'll use. If it has an old board, click **File › Reset board**.
- Import it together. In the **Values** step, check **Issue types → levels**, and **give every version a quarter**. Undated cards can't be judged, so without quarters the time view shows no red at all (Q27).
- Have `docs/questions.md` open for notes.

## 1. You drive (3 minutes)

Share your screen on the sample plan. Do four things, with one sentence each:

1. Select two cards and press **L**: "the first comes before the second, and red means the plan disagrees."
2. Select a group and press **E**: "what's inside, right here."
3. Click "4 components ▸" in a row: "one area, broken down."
4. Press **I** with a card selected: "every property of a card, editable without pivoting."

Don't show hold to nest, the move-out strip, ⇧-click to select matches, or copies.

## 2. They drive (17 minutes)

Hand over control on their own import. Give one task at a time, and don't hint for the first 30 seconds.

| Task | What it tests | Watch for |
|---|---|---|
| "Pivot to Time × System. Which of these red lines would you raise in a planning meeting?" | Order highlights, loops (sprint 3, Q12, Q37) | Which reds are real problems and which are noise? Do they unfold a quarter to see release order, and does that make sense to them? |
| "Which items are the big bets, and which are the details?" | Levels (Q32) | Do they read badges and borders, or pivot to Level? Is "no level" read as "not decided", or as missing data? |
| "Show me everything inside the initiatives." | Select matches, nested expand (Q47, Q42) | Do they find ⇧-click on a badge? Do they expand an epic inside an expanded initiative? Do the chips make it clear whose card is whose? |
| "Sort the work in one area by component." | Folding (Q43, Q34) | Do they click "4 components ▸", the band, or Unfold all? Does anyone look for zoom? |
| "This story belongs in a different epic. Move it." | Hold to nest, the inspector's Group field | Do they drag and hold, or open the inspector? Does anything nest by accident while they drag normally? Is half a second too long or too short? |
| "Take this story out of its epic." | The move-out strip | Do they notice the strip when the drag starts? |
| "This card is in two areas. Show me everything about it." | Copies (Q45) | Do they find the other copy from the dashed line? Do they see all its links? |
| "This one is mis-sized. Fix it and keep going." | The inspector vs. dragging (Q35) | Do they press I, or pivot and drag? |

## 3. Debrief (5 minutes)

1. Which red lines would you act on? Which would you want to hide?
2. Could you tell the shape of the plan at a glance: what's an initiative, what's a story, what belongs to what?
3. When you wanted to look inside something, was expanding and unfolding enough? Did you miss being able to zoom into one thing and hide the rest?
4. When you moved cards between groups, which way felt natural: holding over a group, the strip, or the inspector?
5. What would you need before you'd use this to lay out a real release with your team?

## After

For each observation, update an open question in `docs/questions.md`, or add a new one with what you saw. Start with Q23 (marker noise), Q33, Q35 and Q39, and note the hold delay. Add feedback to `docs/backlog.md` under a theme. If anyone looks for zoom, write down what they wanted to see: it says what expand and fold are missing.
