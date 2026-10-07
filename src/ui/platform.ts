/** Key names for the viewer's platform, so the legend says what's on their keyboard. */
export function keyNames(): {
  add: string;
  undo: string;
  redo: string;
  group: string;
  ungroup: string;
  link: string;
  inspect: string;
  expand: string;
  collapse: string;
  selectAll: string;
  delete: string;
} {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  // platform is deprecated and can be empty (fingerprinting protection), so fall back on the user agent.
  const mac = /Mac|iPhone|iPad/.test(nav?.platform || nav?.userAgent || '');
  return mac
    ? { add: '⌥ Option', undo: '⌘Z', redo: '⇧⌘Z', group: '⌘G', ungroup: '⇧⌘G', link: 'L', inspect: 'I', expand: 'E', collapse: '⇧E', selectAll: '⌘A', delete: '⌫' }
    : {
        add: 'Alt',
        undo: 'Ctrl+Z',
        redo: 'Ctrl+Y',
        group: 'Ctrl+G',
        ungroup: 'Ctrl+Shift+G',
        link: 'L',
        inspect: 'I',
        expand: 'E',
        collapse: 'Shift+E',
        selectAll: 'Ctrl+A',
        delete: 'Delete',
      };
}
