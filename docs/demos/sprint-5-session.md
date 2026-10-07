# Sprints 3–8 tester session: script (35 minutes)

One session for everything built since the last one: dependencies (sprint 3), plan structure and the inspector (sprint 4), expand, fold and nesting (sprint 5), find (sprint 6), starting a blank plan (Q51), a board that explains itself (sprint 7), and frames for expanded groups, related links and collapsible lanes (sprint 8). It replaces the separate [sprint 3](sprint-3-session.md) and [sprint 4](sprint-4-session.md) scripts, which describe zoom, now removed.

Since sprint 7 it opens with a **cold start**: five minutes on the public link before anyone demos anything (Q53). Every earlier session started with a demo, so none of them could see what a stranger meets first.

Run it with one or two PMs or EMs, ideally on an export of their own with Epic and Story issue types and real Blocks links. There are nine things to learn:

1. **Dependencies:** do the red lines point at problems they'd raise in a planning meeting, or at noise?
2. **Structure:** do levels, bands and expanded groups make the plan's shape readable?
3. **Looking deeper:** do expand and fold cover what they need, or does anyone go looking for zoom?
4. **Restructuring:** when they reorganize groups, do they drag (hold to nest, the strip), or use the inspector?
5. **Finding:** on their own import, do they reach for **/**, **⌘F**, or scan the board? Is fading the other cards enough, or do they want them gone?
6. **Starting from scratch:** is a blank plan and Enter-to-continue fast enough to get a brain dump onto the board?
7. **First visit (sprint 7):** with no demo, does the board explain itself? Do they pivot without being asked? Does the guide get them from ideas to a grouped plan?
8. **From a sequence to a timeline (Q46, Q48, Q56):** can they bucket a rough sequence into quarters without feeling they're redoing it?
9. **Groups and links (sprint 8):** do frames make it clear whose cards are whose, at any depth? Do they want a link that says "related" rather than "comes before", and do they find ⌥L?

Stay quiet while they drive, and note what they try first.

## 0. Cold start (5 minutes, before anything else)

Best with someone who hasn't seen the board at all. Send them https://zjs.github.io/planning-board/ in a private window, so it starts empty. Say only: "Tell me what you think this is for, then try it." Do this before the setup below, so nothing has been shown yet. Then say nothing for five minutes, and note:

- what they say it's for, before touching anything;
- whether they start a blank plan or load the sample, and whether they follow the guide or skip it;
- whether they switch views without being asked, and how soon;
- the first gesture they try that does nothing;
- whether they ever open **?**.

If they finish the guide early, ask: "Put these ideas in a rough order, left to right, then plan them into quarters." Watch whether they find box select (dragging across empty space), and whether they say they're redoing the order (Q56).

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

Don't show hold to nest, the move-out strip, ⇧-click to select matches, copies, or **/** to find.

## 2. They drive (17 minutes)

Hand over control on their own import. Give one task at a time, and don't hint for the first 30 seconds.

| Task | What it tests | Watch for |
|---|---|---|
| "Pivot to Time × System. Which of these red lines would you raise in a planning meeting?" | Order highlights, loops (sprint 3, Q12, Q37) | Which reds are real problems and which are noise? Do they unfold a quarter to see release order, and does that make sense to them? |
| "Which items are the big bets, and which are the details?" | Levels (Q32) | Do they read badges and borders, or pivot to Level? Is "no level" read as "not decided", or as missing data? |
| "Show me everything inside the initiatives." | Select matches, nested expand, frames (Q47, Q42, Q57) | Do they find ⇧-click on a badge? Do they expand an epic inside an expanded initiative? Do the frames make it clear whose card is whose, and do they find the ▾ to collapse one? Do repeated frame titles feel noisy? |
| "Sort the work in one area by component." | Folding (Q43, Q34) | Do they click "4 components ▸", the band, or Unfold all? Does anyone look for zoom? |
| "This story belongs in a different epic. Move it." | Hold to nest, the inspector's Group field | Do they drag and hold, or open the inspector? Does anything nest by accident while they drag normally? Is half a second too long or too short? |
| "Take this story out of its epic." | The move-out strip | Do they notice the strip when the drag starts? |
| "This card is in two areas. Show me everything about it." | Copies (Q45) | Do they find the other copy from the dashed line? Do they see all its links? |
| "This one is mis-sized. Fix it and keep going." | The inspector vs. dragging (Q35) | Do they press I, or pivot and drag? |
| "These two touch the same thing, but neither has to come first. Show that." | Related links (Q44) | Do they reach for L and then undo it? Do they find ⌥L from the card menu or the cheat sheet? Is the dotted line clearly not a dependency? |
| "You need more room to see the plan." | Collapsible holding lanes, the area key | Do they find » and ▾ on the holding lanes? Do they ever ask what the colored edge means, and do they find the answer on the board? |
| "Find every card about _(a topic from their export)_, then show me what's inside them." | Find (Q50), Enter, then E | Do they press **/**, ⌘F, the magnifier, or scan? Do they find Enter, and use E on the result? Does anyone want the faded cards hidden? Does "sso" not matching "processor" ever surprise them? |
| "Start a new plan for something you're thinking about, and get five ideas onto it." Undo brings their import back afterwards. | A blank plan, Enter to continue (Q51) | Do they find File › New blank plan? Do they keep typing after the first card, or reach for the mouse? Do they miss areas or quarters to sort into? |

## 3. Debrief (5 minutes)

0. Before I showed you anything, what did you think this was for? What was the first thing that confused you?

1. Which red lines would you act on? Which would you want to hide?
2. Could you tell the shape of the plan at a glance: what's an initiative, what's a story, what belongs to what?
3. When you wanted to look inside something, was expanding and unfolding enough? Did you miss being able to zoom into one thing and hide the rest?
4. When you moved cards between groups, which way felt natural: holding over a group, the strip, or the inspector?
5. When you looked for a card, did fading the others help, or would you rather they disappeared?
6. Were there links you wanted to draw that weren't "comes before"? Did "related" cover them?
7. What would you need before you'd use this to lay out a real release with your team?

## After

For each observation, update an open question in `docs/questions.md`, or add a new one with what you saw. Start with the cold start (Q53, Q52, Q56), then Q23 (marker noise), Q57 (frames), Q44 (related links), Q35, Q39 and Q50, and note the hold delay. Note whether anyone collapsed the holding lanes, and whether they should start collapsed. Add feedback to `docs/backlog.md` under a theme. If anyone looks for zoom, write down what they wanted to see: it says what expand and fold are missing.
