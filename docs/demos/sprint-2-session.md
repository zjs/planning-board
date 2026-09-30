# Sprint 2 tester session: script (20 minutes)

For the PM running a session with one or two PMs or EMs, on a plan imported from their own work. There are two things to learn. First, after an import, does the board look like their plan, or like a pile of tickets? Second, which pivots and fixes do they reach for first? Stay quiet while they drive, and note where they hesitate and what they say about their own data.

## Before (10 minutes, with the tester)

- Ask them to export one release's worth of issues from Jira: a filter covering one product line, then **Export › CSV (all fields)** _(recalled)_. Roadmaps are confidential. The file stays on their machine, and the board never sends it anywhere.
- Open the build in the browser they'll use. If it has an old board, click **File › Reset board**.
- Have `docs/questions.md` open for notes.

## 1. You drive (2 minutes)

Share your screen. Import `docs/samples/jira-export.csv`, clicking through both steps without changing anything. Say one sentence: "It reads a Jira export, and every column becomes something you can pivot by." Switch **Rows** to Team once. Don't explain the value table or the Properties panel.

## 2. They drive (13 minutes)

Hand over control. Give one task at a time, and don't hint for the first 30 seconds.

| Task | What it tests | Watch for |
|---|---|---|
| "Import your own export." | Column mapping and the value table (req. 28, Q27–Q29) | Which columns weren't recognized? Do they read the summary and notes? Do they change any areas, quarters or sizes, or accept the defaults? |
| "Is this your plan? What's wrong with it?" | Whether the import is recognizable | Wrong areas, missing parents, undated work. Is "Not dated" by default a surprise (Q27)? Do they miss a sequence (Q30)? |
| "Show me who is doing what, and when." | Custom properties as axes (req. 1, 26) | Do they find Team in the axis picker without help? |
| "Fix one thing about how the components are grouped." | Value editing (req. 27) | Do they find **Properties**? Rename, move, or delete? Do they expect to drag values? |
| "Add something you'd want to sort by that Jira doesn't have." | Creating a property from scratch | What do they add (customer, theme, risk)? Is one value or several per card the right default? |
| "Send this plan to a colleague." | Plan files (req. 29) | Do they find **File › Save plan to file**? |

## 3. Debrief (5 minutes)

1. How long would it take you to get a plan you trust from this import? What would you fix first?
2. Which Jira fields did you expect to see on the board that aren't there?
3. Was there a column or value you'd have put somewhere else?
4. Would you rather the import update an existing board (by Jira key), or start fresh each time?
5. What would you need before you'd bring this to a planning meeting?

## After

For each observation, update an open question in `docs/questions.md` (Q27–Q30, or Q21–Q23 from sprint 1), or add a new one with what you saw. List any Jira header that wasn't recognized, spelled exactly as it was in the file, so it can be added to the detection list without seeing the data. Those entries drive sprint 3 planning.
