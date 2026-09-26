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
        <dt>A card in several rows</dt>
        <dd>It touches several areas. Drag one copy to move just that one.</dd>
        <dt>
          Hold <kbd>{keys.add}</kbd> while dropping
        </dt>
        <dd>Adds the row instead of moving there.</dd>
        <dt>Drop in the gap between sequence columns</dt>
        <dd>Opens a new position there. Sequence columns have no numbers on purpose.</dd>
        <dt>Drag onto the holding area</dt>
        <dd>Removes a value. Pick which one on the drop zone.</dd>
        <dt>Undo, redo, cancel</dt>
        <dd>
          <kbd>{keys.undo}</kbd>, <kbd>{keys.redo}</kbd>, <kbd>Esc</kbd> during a drag.
        </dd>
      </dl>
      <p className="legend-foot">Everything saves in this browser as you go.</p>
    </aside>
  );
}
