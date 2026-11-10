import { useState } from 'react';
import { shareFragment } from '../commands/sharing.ts';
import { Dialog } from './Dialog.tsx';

/** Advice for a link from a newer version, where the newer app is to be found. */
export const NEWER_LINK = 'This link is from a newer version of Planning Board. Open it in the hosted page, or download the newest planning-board.html from the releases.';

/**
 * Open a share link in this copy of the app, such as the HTML file opened
 * from disk, which no link can name. The key is after the #, so it opens
 * here whichever address the link names.
 */
export function OpenLinkDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Dialog title="Open a share link" onClose={onClose} testId="open-link">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const opened = shareFragment(text);
          if (opened === 'newer' || !opened) {
            setProblem(opened === 'newer' ? NEWER_LINK : 'That isn’t a share link. Copy the whole link, including everything after the #.');
            return;
          }
          onClose();
          location.hash = opened.hash;
        }}
      >
        <label className="share-field">
          Share link
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setProblem(null);
            }}
            data-testid="open-link-input"
            placeholder="https://…#v=1&room=…"
          />
        </label>
        <p className="share-note">It opens here, in this copy of the app, whichever address the link names.</p>
        {problem && (
          <p className="share-problem" role="alert">
            {problem}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={text.trim() === ''}>
            Open
          </button>
        </div>
      </form>
    </Dialog>
  );
}
