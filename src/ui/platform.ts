/** Key names for the viewer's platform, so the legend says what's on their keyboard. */
export function keyNames(): { add: string; undo: string; redo: string } {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  // platform is deprecated and can be empty (fingerprinting protection), so fall back on the user agent.
  const mac = /Mac|iPhone|iPad/.test(nav?.platform || nav?.userAgent || '');
  return mac ? { add: '⌥ Option', undo: '⌘Z', redo: '⇧⌘Z' } : { add: 'Alt', undo: 'Ctrl+Z', redo: 'Ctrl+Y' };
}
