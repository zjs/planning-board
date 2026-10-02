import { keyNames } from './platform.ts';

const STORAGE_KEY = 'planning-board:legend-dismissed';

/** Where feedback goes. A plain link: nothing is sent unless someone follows it. */
export const FEEDBACK_URL = 'https://github.com/zjs/planning-board/issues/new/choose';

/** The commit this build came from, so a report names its build. */
export const BUILD = import.meta.env.VITE_BUILD_COMMIT?.slice(0, 7) || 'local';

/** Open on first visit; remembered per browser once closed. */
export function legendInitiallyOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '1';
  } catch {
    return true;
  }
}

export function rememberLegendClosed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // A convenience only.
  }
}

/** How to use the board, for testers driving on their own (questions.md Q7). */
export function Legend({ onClose }: { onClose: () => void }) {
  const keys = keyNames();
  return (
    <aside className="legend" aria-label="How to use the board" data-testid="legend">
      <header>
        <h2>How it works</h2>
        <button type="button" onClick={onClose} aria-label="Close help">
          ✕
        </button>
      </header>
      <div className="legend-body">
      <section>
        <h3>Moving cards</h3>
      <dl>
        <dt>Drag a card into a cell</dt>
        <dd>It takes that row's and column's values. A card in several areas has a copy in each; drag one to move it.</dd>
        <dt>
          Hold <kbd>{keys.add}</kbd> while dropping
        </dt>
        <dd>Adds that area instead of moving there.</dd>
        <dt>Gaps between sequence columns</dt>
        <dd>Drop there to open a new position. Columns have no numbers on purpose.</dd>
        <dt>Lanes along the right and bottom edges</dt>
        <dd>Cards missing a column (right), a row (bottom), or both (corner). Drop there to clear a value.</dd>
        <dt>Hold a card over another</dt>
        <dd>
          After a moment it highlights: drop to put the card inside it, keeping its values. Dragging a card that's in a
          group shows a strip at the top that moves it out a level.
        </dd>
      </dl>
      </section>
      <section>
        <h3>Cards and groups</h3>
      <dl>
        <dt>Click to select</dt>
        <dd>
          <kbd>⇧ Shift</kbd>-click adds more; <kbd>Esc</kbd> or empty space clears. <kbd>⇧ Shift</kbd>-click a badge,
          such as Initiative, or a row or column header, to select every card that matches; <kbd>{keys.selectAll}</kbd>{' '}
          selects them all. <kbd>Delete</kbd> removes the selection, and everything inside a group.
        </dd>
        <dt>Double-click empty space</dt>
        <dd>
          Makes a card there with that cell's values; in a gap between sequence columns, it's a new column. Double-click
          a card, or press Enter, to rename it.
        </dd>
        <dt>
          <kbd>{keys.group}</kbd> groups the selection
        </dt>
        <dd>
          Into a new card you name, or into the one group already selected. <kbd>{keys.ungroup}</kbd> ungroups.
        </dd>
        <dt>
          Select groups, press <kbd>{keys.expand}</kbd>
        </dt>
        <dd>
          What's inside shows right here, each card marked with its group, and groups inside expand the same way. A
          selected group's count <span className="legend-chip"><span className="child-count">4</span>›</span> does it
          too. <kbd>{keys.fold}</kbd> on a card folds its group back.
        </dd>
      </dl>
      </section>
      <section>
        <h3>Folding</h3>
      <dl>
        <dt>System or Time as an axis</dt>
        <dd>
          Areas or quarters are bands, each folded into one lane to start. Click a band, or a folded lane's "4
          components ▸", to unfold it; <b>Fold all</b> and <b>Unfold all</b> sit beside the axis. An unfolded area has
          a "No component" lane for cards with just the area.
        </dd>
      </dl>
      </section>
      <section>
        <h3>Dependencies</h3>
      <dl>
        <dt>
          Select two cards, press <kbd>{keys.link}</kbd>
        </dt>
        <dd>
          The first one selected comes before the second. <kbd>{keys.link}</kbd> again removes the link. With one card
          selected, <kbd>{keys.link}</kbd> starts a link you can finish anywhere, even inside a group.
        </dd>
        <dt>Lines</dt>
        <dd>
          Hover a card to see its links; select it to see its whole chain. <span className="legend-red">Red</span> lines
          always show: a card placed after one it must come before, or a loop. Click a line and press{' '}
          <kbd>Delete</kbd> to remove it.
        </dd>
      </dl>
      </section>
      <section>
        <h3>Plans and properties</h3>
      <dl>
        <dt>File › Save plan, Open plan</dt>
        <dd>A plan as one file, to move between browsers or send to someone. Opening replaces the board; undo brings it back.</dd>
        <dt>File › Import CSV</dt>
        <dd>
          From a Jira export: choose what each column becomes, then where components, versions, and story points go.
          It replaces the board, and cards keep their Jira keys.
        </dd>
        <dt>
          Inspect, <kbd>{keys.inspect}</kbd>
        </dt>
        <dd>
          Every property of the selected cards, editable without pivoting; select several to change them all at once.
          Also a card's description, its group, and its links, and a way to add a card inside it.
        </dd>
        <dt>Properties</dt>
        <dd>
          Add your own, such as Team; each one is a choice of rows or columns. Click a value to rename it; hover for
          move and delete. A deleted release's cards stay in its quarter.
        </dd>
      </dl>
      </section>
      <section>
        <h3>What the board tells you</h3>
      <dl>
        <dt>Heavier borders</dt>
        <dd>Initiatives and epics, from the Level property. A card with no level hasn't been decided yet.</dd>
        <dt>Dashed frames</dt>
        <dd>
          A group, shown wherever the cards inside it are, around those cards. Drag them as usual; double-click the
          group to expand it.
        </dd>
        <dt>
          <span className="mismatch">⚠</span> markers
        </dt>
        <dd>
          A card dated outside its group, larger than it, in another area, or at or above its level. On a group, the
          count covers everything inside. Hover for why; nothing is changed for you.
        </dd>
        <dt>Undo, redo, cancel</dt>
        <dd>
          <kbd>{keys.undo}</kbd>, <kbd>{keys.redo}</kbd>, <kbd>Esc</kbd> during a drag.
        </dd>
      </dl>
      </section>
      </div>
      <p className="legend-foot">Everything saves in this browser as you go. Save to a file to take it somewhere else.</p>
      <p className="legend-foot">
        Build {BUILD} ·{' '}
        <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">
          Feedback and bug reports
        </a>
      </p>
    </aside>
  );
}
