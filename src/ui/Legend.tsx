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
      <dl>
        <dt>Drag a card into a cell</dt>
        <dd>It takes that row's and that column's values. Pivot the axes to see it from another angle.</dd>
        <dt>A card that shows up more than once</dt>
        <dd>It touches several areas. Drag one copy to move just that one.</dd>
        <dt>
          Hold <kbd>{keys.add}</kbd> while dropping
        </dt>
        <dd>Adds that area instead of moving there.</dd>
        <dt>Drop in the gap between sequence columns</dt>
        <dd>Opens a new position there. Sequence columns have no numbers on purpose.</dd>
        <dt>The lanes along the right and bottom edges</dt>
        <dd>
          Hold cards missing a value: a row but no column on the right, a column but no row along the bottom, neither in
          the corner. Drop a card there to clear that value.
        </dd>
        <dt>Click a card to select it</dt>
        <dd>
          <kbd>⇧ Shift</kbd>-click adds more. <kbd>Delete</kbd> removes the selection, including everything inside a
          group. Click empty space or press <kbd>Esc</kbd> to deselect.
        </dd>
        <dt>Double-click empty space</dt>
        <dd>Makes a new card there, with that row's and column's values. Type a title and press Enter.</dd>
        <dt>Double-click a card, or press Enter</dt>
        <dd>Renames it. Double-clicking a group zooms into it instead; Enter still renames.</dd>
        <dt>
          Zoom in: double-click a group, or <kbd>{keys.zoomIn}</kbd>
        </dt>
        <dd>
          Shows only what's inside. Any card can be zoomed into, and new cards you make there go inside it. Drag a card
          onto the breadcrumb to move it out. <kbd>Esc</kbd> or <kbd>{keys.zoomOut}</kbd> zooms out.
        </dd>
        <dt>Faded cards</dt>
        <dd>
          A group also shows, faded, wherever the cards inside it are. It can't be dragged from there; double-click to
          zoom in.
        </dd>
        <dt>
          <span className="mismatch">⚠</span> markers
        </dt>
        <dd>
          A card that doesn't fit its group: dated outside it, larger than it, or in another area. On a group, the number
          counts the mismatches anywhere inside it. Hover to see why. Nothing is changed for you.
        </dd>
        <dt>Click a row or column header</dt>
        <dd>
          Zooms into it: Identity shows its components, Q2 its releases. Cards tagged only Identity wait in "No
          component"; drop one on a component to refine it. The chip above the board zooms back out.
        </dd>
        <dt>
          <kbd>{keys.group}</kbd> groups the selection
        </dt>
        <dd>
          The new group card gets the values its cards share; type its name. If one selected card is already a group,
          the others join it instead. <kbd>{keys.ungroup}</kbd> ungroups.
        </dd>
        <dt>Undo, redo, cancel</dt>
        <dd>
          <kbd>{keys.undo}</kbd>, <kbd>{keys.redo}</kbd>, <kbd>Esc</kbd> during a drag.
        </dd>
      </dl>
      <p className="legend-foot">Everything saves in this browser as you go.</p>
    </aside>
  );
}
