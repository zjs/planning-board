# 0011: Drawing dependency links

Status: Accepted (sprint 3, slices 2 and 3). Amended in sprint 5, slice 4: copy lines.

## Context

Requirements 15, 16 and 18 need links drawn between cards, the focus rules from Q14 and Q39, and highlights for links that are out of order. The board is DOM and CSS grid (ADR 0002), and a card can appear in several places at once: one copy per lane, plus faded "via children" copies of groups. Pinned holding lanes stay put while the board scrolls under them. Links often involve cards hidden inside a collapsed group (Q38).

## Decision

- **One SVG overlay** sits inside the board grid, above the cells and the pinned lanes but below notices and dialogs. It's drawn imperatively from the cards' positions on screen: React decides which lines to draw, and the overlay measures where they go. It redraws when the lines or the layout change, on resize, and at most once per frame while the board scrolls. Scrolling matters because cards in the pinned lanes move relative to the board. It doesn't take the pointer, so cards stay draggable underneath.
- **Which lines show is a pure query** (`src/domain/dependencies.ts`):
  - **Focus (Q39).** Hovering a card shows its direct links. Selecting a card shows its whole chain, upstream and downstream. For a group, both include the links of the cards inside it, since a group's dependencies include its children's (requirement 13).
  - **Problems.** Out-of-order links and loops are always drawn in red, whatever the focus. If one pair of cards has both a flagged link and an ordinary one, it gets a single red line.
- **Hidden ends (Q38).** Each end of a link is drawn at the card itself if it's on screen. Otherwise it's drawn at the nearest group around it that has a solid copy on screen. A link whose ends land on the same card isn't drawn at that level, and neither is a link whose card isn't on screen at all (outside the current zoom). Links that land on the same pair of cards share one line, and its tooltip lists them all.
- **Copies.** A card with several copies is linked from the pair of copies closest together, faded copies included. So a link to a child in Billing is drawn to the group's faded copy in the Billing row, when it has one.
- **Shape.** A curve with an arrowhead at the dependent. It leaves and arrives on the facing sides: left and right when the cards are side by side, top and bottom when one is above the other. When the cards share a column, the curve bows out so it doesn't run through the cards between them.
- **Lines can be picked.** Each line has a wide, invisible twin that takes the pointer, so it can be hovered (a tooltip lists the links it stands for, or what's wrong with them) and clicked. A clicked line is selected, Delete removes every link it stands for in one undo step, and Esc deselects it.
- **Making links.** Select the prerequisite, then the dependent, and press L or the Link button. The selection keeps click order, so order decides direction. With one card selected, L starts a pending link that survives zooming, and a bar says what it's waiting for. Pressing L on an already-linked pair removes the link. With no cards or three or more selected, L explains itself and does nothing (Q39). Loops are allowed (Q37).
- **Order is judged per view.** A link is out of order on an axis the view orders by (sequence, or time at the level shown, Q12), using each linked card's own values even when its line is drawn to a group. Loops are found as strongly connected components and are flagged in every view.

## Alternatives

- **Lines in React state.** It would re-render the whole overlay on every scroll frame, for positions only the page knows.
- **A canvas.** It's harder to give lines hover titles and click targets, and ADR 0002 keeps canvas for when the DOM isn't enough.
- **Drawing every link, with a toggle.** Q14 rejected this: the sample plan alone would draw about 36 crossing lines.

## Consequences

- Lines can lag a frame behind fast scrolling. That's the price of measuring the page instead of computing layout twice.
- An overlay above the pinned lanes means lines can cross headers when the board is scrolled. It's accepted, so lines can reach cards that are in holding lanes.
- More links make more measuring. Focus keeps the count small; if a plan has many out-of-order links, only lines that touch the visible area will need drawing.

## Copy lines (sprint 5)

A card with values in several lanes has a copy in each, and testers lost track of them (questions.md Q45). The same overlay now draws the copies of the hovered card and the selected cards, when there's more than one on the board, in the same measuring pass as the dependency lines:

- Each copy is joined to the nearest copy already joined, a minimum spanning tree (`nearestNeighbors`), so copies in neighboring lanes are joined to each other rather than all to one far-off copy.
- A copy line uses the same curve as a dependency, dashed, gray, with no arrow, and takes no clicks. It's drawn under the dependency lines.
- Every copy gets a dashed outline (`copy-focus`), which also marks copies scrolled out of the line's reach.
- A dependency is still drawn once, from the copy nearest its other end. The joined copies show that it belongs to the card under the pointer, without multiplying lines.
- A group's faded copies aren't copies of the card itself, so they're left out.
