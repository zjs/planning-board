import { keyNames } from './platform.ts';

const STORAGE_KEY = 'planning-board:legend-dismissed';

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
      </dl>
      </section>
      <section>
        <h3>Cards and groups</h3>
      <dl>
        <dt>Click to select</dt>
        <dd>
          <kbd>⇧ Shift</kbd>-click adds more; <kbd>Esc</kbd> or empty space clears. <kbd>Delete</kbd> removes the
          selection, and everything inside a group.
        </dd>
        <dt>Double-click empty space</dt>
        <dd>Makes a card there with that cell's values. Double-click a card, or press Enter, to rename it.</dd>
        <dt>
          <kbd>{keys.group}</kbd> groups the selection
        </dt>
        <dd>
          Into a new card you name, or into the one group already selected. <kbd>{keys.ungroup}</kbd> ungroups.
        </dd>
      </dl>
      </section>
      <section>
        <h3>Zooming</h3>
      <dl>
        <dt>
          Double-click a group, or <kbd>{keys.zoomIn}</kbd>
        </dt>
        <dd>
          Shows only what's inside; new cards go inside. Drag a card onto the breadcrumb to move it out.{' '}
          <kbd>Esc</kbd> or <kbd>{keys.zoomOut}</kbd> zooms out.
        </dd>
        <dt>Click a row or column header</dt>
        <dd>
          Identity shows its components, Q2 its releases. Cards tagged only Identity wait in "No component" until you
          drop them on one.
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
        <dt>Faded cards</dt>
        <dd>A group, shown wherever the cards inside it are. Double-click to zoom in; it can't be dragged.</dd>
        <dt>
          <span className="mismatch">⚠</span> markers
        </dt>
        <dd>
          A card dated outside its group, larger than it, or in another area. On a group, the count covers everything
          inside. Hover for why; nothing is changed for you.
        </dd>
        <dt>Undo, redo, cancel</dt>
        <dd>
          <kbd>{keys.undo}</kbd>, <kbd>{keys.redo}</kbd>, <kbd>Esc</kbd> during a drag.
        </dd>
      </dl>
      </section>
      </div>
      <p className="legend-foot">Everything saves in this browser as you go. Save to a file to take it somewhere else.</p>
    </aside>
  );
}
