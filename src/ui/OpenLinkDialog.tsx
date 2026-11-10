import { useState } from "react";
import { shareFragment } from "../commands/sharing.ts";
import { Dialog } from "./Dialog.tsx";

/**
 * Open a share link in this copy of the app, such as the HTML file opened
 * from disk, which no link can name. The key is after the #, so the address
 * before it doesn't matter.
 */
export function OpenLinkDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState(false);
  return (
    <Dialog title="Open a share link" onClose={onClose} testId="open-link">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const hash = shareFragment(text);
          if (!hash) {
            setProblem(true);
            return;
          }
          onClose();
          location.hash = hash;
        }}
      >
        <label className="share-field">
          Share link
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setProblem(false);
            }}
            data-testid="open-link-input"
            placeholder="https://…#v=1&room=…"
          />
        </label>
        <p className="share-note">
          It opens here, in this copy of the app, whichever address the link
          names.
        </p>
        {problem && (
          <p className="share-problem" role="alert">
            That isn’t a share link. Copy the whole link, including everything
            after the #.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary"
            disabled={text.trim() === ""}
          >
            Open
          </button>
        </div>
      </form>
    </Dialog>
  );
}
