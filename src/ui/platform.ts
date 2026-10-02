/** Key names for the viewer's platform, so the legend says what's on their keyboard. */
export function keyNames(): {
  add: string;
  undo: string;
  redo: string;
  group: string;
  ungroup: string;
  zoomIn: string;
  zoomOut: string;
  link: string;
  inspect: string;
  expand: string;
  fold: string;
  selectAll: string;
} {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  // platform is deprecated and can be empty (fingerprinting protection), so fall back on the user agent.
  const mac = /Mac|iPhone|iPad/.test(nav?.platform || nav?.userAgent || '');
  return mac
    ? { add: '⌥ Option', undo: '⌘Z', redo: '⇧⌘Z', group: '⌘G', ungroup: '⇧⌘G', zoomIn: '⌘↓', zoomOut: '⌘↑', link: 'L', inspect: 'I', expand: 'E', fold: '⇧E', selectAll: '⌘A' }
    : {
        add: 'Alt',
        undo: 'Ctrl+Z',
        redo: 'Ctrl+Y',
        group: 'Ctrl+G',
        ungroup: 'Ctrl+Shift+G',
        zoomIn: 'Ctrl+↓',
        zoomOut: 'Ctrl+↑',
        link: 'L',
        inspect: 'I',
        expand: 'E',
        fold: 'Shift+E',
        selectAll: 'Ctrl+A',
      };
}
