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
        <dd>Renames it.</dd>
        <dt>Undo, redo, cancel</dt>
        <dd>
          <kbd>{keys.undo}</kbd>, <kbd>{keys.redo}</kbd>, <kbd>Esc</kbd> during a drag.
        </dd>
      </dl>
      <p className="legend-foot">Everything saves in this browser as you go.</p>
    </aside>
  );
}
