# UX assessment, 2026-10-07

An expert review of the board as a first-time visitor meets it, asked for by the PM: "I want the board to be intuitive for new users, with easy ways to discover the more advanced features … I want it to really delight users."

Provenance tags: _(recalled)_ = from memory, unverified; _(priors)_ = reasoned guess. Untagged claims about the app were checked against the build.

## The problem

Every tester so far met the board after a demo. The session script still opens with the PM driving L, E, unfolding and I (`docs/demos/sprint-5-session.md`, step 1). But the repo is public, and the Pages link is shared. A stranger who opens it cold meets two things: a reference manual over the board, and a first view where the product's one big idea, pivoting the same cards into another perspective, is neither visible nor animated. Most of what makes the board powerful is reachable only through gestures and single keys that nothing on screen shows.

None of this is a reason to rework the model. The model is coherent, and the fixes are mostly additive: show the idea, teach by doing, and put every action somewhere it can be found.

## How this was assessed

- The build of `main` at `a5a1493`, driven in Chromium at 1440×900 and 1280×720. The path: empty board, sample plan with first-visit help, hovering, selecting, the inspector, pivoting, dragging, holding to nest, find, Properties, and a blank plan with three ideas typed in.
- The UI code, for what screenshots don't show: shortcuts, focus, tooltips, animation.
- Not covered: the import dialog in depth, Firefox and Safari, touch, and real users. An expert review predicts problems, and sessions confirm or kill them. The two methods find overlapping but different problems _(recalled)_.

## What's working: keep it

- **The copy is unusually good.** Notices name exactly what happened and offer Undo: "Put “Least-privilege default role” inside “WebAuthn enrollment”". Empty states teach: the inspector's "Comes after" says "Nothing. Select a card, then this one, and press L." Pressing E with nothing selected says what E is for.
- **Undo covers everything**, and confirmations appear only where a whole board is replaced.
- **Drop feedback is clear.** The whole target cell lights up, and holding over a card shows a dashed outline and "Put inside …".
- **Find dims instead of hiding,** so the board keeps its shape.
- **The corner key**, "System ↓ / Sequence →", says which axis is which.

Changes below should keep these.

## Findings, ranked by effect on a new user's first hour

### 1. The core idea isn't visible on arrival

The sample opens in Sequence × System ([screenshot](2026-10-07-ux/03-sample-board.jpg)):

- The columns have no labels, by design (requirement 6). So the first board doesn't read as a grid of two properties.
- One area, Identity & Access, fills the screen. The other areas are below the fold.
- *Passwordless login* appears four times in that one row: three dashed frames and the card itself.

Pivoting is two native dropdowns labelled Rows and Columns, with the same visual weight as Fold all. Nothing invites a first pivot. When it happens, the board redraws instantly, so nothing shows that these are the same cards in new places. That moment is the product's promise. It's also the mitigation for the requirements' "pivoting erases spatial memory" risk: animated transitions let people track objects across a layout change _(recalled)_.

By contrast, Time × System reads as a plan straight away ([screenshot](2026-10-07-ux/06-time-system.jpg)): quarters across, areas down.

### 2. The help is a manual, and it opens at the wrong moment

First-visit help has about 30 entries in six sections, and it opens over the board the moment the sample loads ([1440×900](2026-10-07-ux/02-sample-with-help.jpg)). At 1280×720 it covers the whole board, and its last sections are cut off ([1280×720](2026-10-07-ux/04-help-1280.jpg)). People tend to close first-run overlays without reading them _(recalled)_. Once it's closed, nothing on the board teaches anything until the user happens to press a key.

### 3. Most of the power is in gestures and keys nothing shows

These have no visible affordance:

- **Single keys:** E, ⇧E, L, I, /.
- **Shortcuts:** ⌘G, ⇧⌘G, ⌘A.
- **Mouse gestures:**
  - Alt-drop to add a value;
  - holding a dragged card to nest it;
  - ⇧-click on a badge or a header to select matches;
  - double-click on empty space to add a card;
  - dropping in the gaps between sequence columns;
  - clicking a line, then Delete.

There's no right-click menu, no command palette, and no hover hint for "add a card here". The toolbar's Group, Ungroup, Expand, Fold and Link stay grey until something is selected, and they don't say what they'd act on.

The drag ghost shows only the card's title. It doesn't say what the drop will write ("→ Q2 2027 · Billing"), so the central mechanic, "drag writes values", is never put into words where it happens.

### 4. A blank plan stalls right after the brain dump

Typing three ideas after **Start a blank plan** puts them in one full-width cell ([screenshot](2026-10-07-ux/05-blank-plan.jpg)). They're sorted by title, not by the order they were typed: *Passwordless login*, *Audit log export*, *SCIM provisioning* came out as Audit, Passwordless, SCIM.

The next natural step is sorting them into areas, but a blank plan has no areas, and areas can only be made in the Properties panel. The board's own gesture, dragging into a lane, can't start. The message "No cards have a system value yet. They're all in the holding lanes." states the problem without the way out. This is the brainstorming phase the product exists for.

### 5. Too many visual channels, some unexplained

One card can carry:

- a colored left edge;
- a border weight for its level;
- ⚠;
- size, time and component badges;
- a child count;
- a group chip;
- a dashed copy outline.

The colored edge is the card's first area, and it isn't explained anywhere, including the help. In a System view it can contradict the row it sits in: an orange (Billing) edge on a card in the Identity row.

The default sample view renders 45 ⚠ markers among 189 cards. So the first plan every visitor sees reads as a plan with problems everywhere, before they know what a problem is. This adds weight to Q23.

### 6. Holding lanes and the toolbar take the screen

At 1440×900, the right holding lane (about 240px) and the bottom one (about 250px) take roughly 40% of the board's area. They're full of white cards on a light background, so they draw the eye before the board does.

The toolbar wraps to two rows at 1280 wide. It also wraps at 1440 once both axes show Fold all and Unfold all, as in Time × System.

### 7. Vocabulary overlaps

Groups **expand** and **fold**, and bands **fold** and **unfold**, so "Fold" means two things on one toolbar. Other labels:

- "No position" for a missing sequence value;
- "via cards inside" on frames;
- "Cards / Chips".

Each label is defensible on its own, but together they're a vocabulary a newcomer has to learn before they can use the board.

### 8. The keyboard can't reach cards

Cards can't take focus, and arrow keys do nothing on the board. So every key-driven action starts with a mouse click. This leaves out keyboard-only and screen-reader users, which enterprise buyers often ask about in accessibility reviews _(recalled)_. It also caps how fast an expert can work.

## Recommendations

Each item is sized to be one thin slice, ordered by expected effect. The decisions they need are in `questions.md` (Q52–Q55).

### Tier 1: the first hour

**A. Make perspectives the hero, and animate the pivot (Q52).**

- A row of one-click perspectives above the board, such as *Sequence*, *Roadmap* (time × area), *Sizing* (size × level) and *Structure* (level × area). The Rows and Columns pickers stay for anything else.
- These are built-in presets, not saved views, so requirement 8 can stay deferred.
- When the view changes, cards glide to their new places in about 300 ms, with reduced motion respected.
- This is the single change most likely to make people say "oh" _(priors)_.

**B. Teach by doing, not by reading (Q53).**

- On a first visit to the sample, replace the help overlay with a short guided start: switch perspective, drag a card, point at a card to see its links. Each step finishes when the user does it, and the whole thing can be skipped.
- The help panel becomes a cheat sheet grouped by goal, opened from "?".
- Hints appear the first time they apply. On the first drag on a multi-value axis, the ghost says "Hold Alt to add instead". On the first selection of a group, a hint says "Press E to show what's inside".

**C. Put every action somewhere it can be found (Q54).**

- **A card menu,** on right-click and on a "⋯" that shows on hover. It lists every action with its key.
- **A command palette** (⌘K) with every command and its shortcut. Menus that show shortcuts are how most people learn them _(recalled)_.
- **The drag ghost says what the drop will write:** "→ Q2 2027 · Billing".
- **A faint "+ Add card"** appears at the end of a cell on hover.
- The selection-dependent buttons can then leave the toolbar, which fixes its wrapping.

**D. Let a blank plan grow its structure on the board (Q55).**

- "+ Add area" at the end of the row headers, and "+ Add quarter" at the end of the columns, named inline.
- The first area gets a nudge in the empty-plan message.
- Cards typed in a row keep the order they were typed in.

### Tier 2: trust and calm

**E. A visual budget.**

- A small key in the board's corner that explains only what's on screen right now.
- Explain the area color, or drop it in System views.
- Quieter mismatch markers until the conflicts panel can filter them (Q23).
- A sample plan with a handful of deliberate, interesting conflicts, not dozens.

**F. Give the board the screen.** Holding lanes that collapse to a thin, counted rail, and switch to chips on their own when they're long. A one-row toolbar (with C).

**G. One word pair for "show the level below"** across groups and bands. Part of Q54.

**H. Keyboard reach.**

- Cards take focus, and arrow keys move between them.
- ⌥+arrow moves a card one lane, which is "drag writes values" from the keyboard.
- This doubles as the accessibility fix.

### Tier 3: delight

- **Cards land:** after a drop, nearby cards slide aside, rather than the board jumping.
- **Follow a card through a pivot:** the selected card is followed across the pivot, so "where did it go?" never comes up.
- **A first link draws itself in,** so a new user sees what a link is.
- **Keys show up in tooltips:** every control's tooltip shows its key (most already do), and keys appear in the card menu (C).

## How to check this with users

- **Add a cold start to the session.** Put five minutes before the PM demos anything: the Pages link and "tell me what this is for, then try it". The current script demos first, so it can't see any of findings 1–3.
- **Measure three things:** whether they pivot without being asked, and how soon; whether they can say "dragging sets values" afterwards; and the first gesture they try that does nothing.
- **Re-run the cold start** with a new person after Tier 1 ships.
