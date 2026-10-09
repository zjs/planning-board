import { useEffect, useState } from 'react';
import { checkRelay } from '../commands/sharing.ts';
import { thirdPartyNotices } from '../notices.ts';
import { keyNames } from './platform.ts';

/** Where feedback goes. A plain link: nothing is sent unless someone follows it. */
export const FEEDBACK_URL = 'https://github.com/zjs/planning-board/issues/new/choose';

/** The commit this build came from, so a report names its build. */
export const BUILD = import.meta.env.VITE_BUILD_COMMIT?.slice(0, 7) || 'local';

/**
 * The cheat sheet, grouped by what you want to do (Q53). It opens from "?",
 * never by itself: a first-time visitor learns from the guided start and
 * from the board, and comes here to look something up.
 */
export function Legend({ onClose, relay = null }: { onClose: () => void; relay?: string | null }) {
  const keys = keyNames();
  const [licenses, setLicenses] = useState(false);
  const relayBuild = useRelayBuild(relay);
  if (licenses) return <Licenses onBack={() => setLicenses(false)} onClose={onClose} />;
  return (
    <aside className="legend" aria-label="Cheat sheet" data-testid="legend">
      <header>
        <h2>Cheat sheet</h2>
        <button type="button" onClick={onClose} aria-label="Close help">
          ✕
        </button>
      </header>
      <div className="legend-body">
        <section>
          <h3>Add and arrange cards</h3>
          <dl>
            <dt>Double-click empty space</dt>
            <dd>
              A new card with that cell’s values. <kbd>Enter</kbd> after its title starts the next one; <kbd>Esc</kbd>{' '}
              stops. Double-click a card, or press <kbd>Enter</kbd>, to rename it.
            </dd>
            <dt>Drag a card into a cell</dt>
            <dd>It takes that row’s and column’s values, and says which while you drag.</dd>
            <dt>
              Hold <kbd>{keys.add}</kbd> while dropping
            </dt>
            <dd>Adds the row’s or column’s value instead of replacing the one it came from.</dd>
            <dt>Lanes along the right and bottom</dt>
            <dd>Cards missing a column, a row, or both. Drop there to clear a value.</dd>
            <dt>Gaps between sequence columns</dt>
            <dd>Drop there to open a new position. Columns have no numbers on purpose.</dd>
            <dt>Drag across empty space</dt>
            <dd>
              Selects the cards in the box; <kbd>⇧ Shift</kbd> adds. Drag any selected card to move them all.
            </dd>
            <dt>Right-click a card, or its ⋯</dt>
            <dd>Every action on it, with its key.</dd>
          </dl>
        </section>
        <section>
          <h3>Change the view</h3>
          <dl>
            <dt>Views, under the toolbar</dt>
            <dd>
              Sequence, Roadmap, Sizing and Structure, one click each. Rows and Columns pick any other pair; <b>⇄</b>{' '}
              swaps them. Every card keeps all its values.
            </dd>
            <dt>Fold and unfold</dt>
            <dd>
              Areas and quarters start folded. Click one, or its “4 components ▸”, to unfold it; <b>Fold all</b> and{' '}
              <b>Unfold all</b> sit beside the axis.
            </dd>
            <dt>Headers</dt>
            <dd>
              Double-click one to rename it. <b>+ Add area</b> (or quarter, size, team…) under a holding lane’s name adds
              one.
            </dd>
          </dl>
        </section>
        <section>
          <h3>Groups</h3>
          <dl>
            <dt>Hold a card over another</dt>
            <dd>When it highlights, let go: it goes inside, keeping its values.</dd>
            <dt>
              <kbd>{keys.group}</kbd> groups the selection
            </dt>
            <dd>
              Into a new card you name, or into the one group selected. <kbd>{keys.ungroup}</kbd> ungroups.
            </dd>
            <dt>
              <kbd>{keys.expand}</kbd> expands, <kbd>{keys.collapse}</kbd> collapses
            </dt>
            <dd>
              Shows what’s inside the selected groups right here, framed under each group’s name. A selected group’s
              count <span className="legend-chip"><span className="child-count">4</span>›</span> does it too, and an
              expanded group’s <span className="legend-chip"><span className="child-count">4</span>▾</span> collapses it.
            </dd>
            <dt>Move out of a group</dt>
            <dd>Drag a card that’s inside one: drop it on the strip at the top.</dd>
          </dl>
        </section>
        <section>
          <h3>Select and find</h3>
          <dl>
            <dt>Click, ⇧-click</dt>
            <dd>
              Selects, or adds to the selection. <kbd>Esc</kbd> or empty space clears. <kbd>{keys.selectAll}</kbd> selects
              every card.
            </dd>
            <dt>
              <kbd>⇧ Shift</kbd>-click a badge or a header
            </dt>
            <dd>Selects every card that matches: every Initiative, or everything in a row.</dd>
            <dt>
              Press <kbd>/</kbd> and type
            </dt>
            <dd>
              Finds cards by title, Jira key or description, and fades the rest. <kbd>Enter</kbd> selects them all;{' '}
              <kbd>↓</kbd> <kbd>↑</kbd> step through them.
            </dd>
          </dl>
        </section>
        <section>
          <h3>Links</h3>
          <dl>
            <dt>
              Select two cards, press <kbd>{keys.link}</kbd>
            </dt>
            <dd>
              The first comes before the second. <kbd>{keys.link}</kbd> again removes it. With one card selected, it
              starts a link you finish on any card.
            </dd>
            <dt>
              Select two cards, press <kbd>{keys.relate}</kbd>
            </dt>
            <dd>
              Relates them, with no order: a dotted line with no arrow, never red. <kbd>{keys.relate}</kbd> again removes
              it. Not the same as <kbd>{keys.add}</kbd> while dropping, which adds a value.
            </dd>
            <dt>Lines</dt>
            <dd>
              Point at a card for its links; select it for its whole chain. <span className="legend-red">Red</span>{' '}
              lines always show: out of order, or a loop. Click a line and press <kbd>Delete</kbd> to remove it.
            </dd>
          </dl>
        </section>
        <section>
          <h3>Plans and properties</h3>
          <dl>
            <dt>File › Your plans</dt>
            <dd>
              Keep several plans in this browser, and switch between them. Double-click the plan's name, top left, to
              rename it.
            </dd>
            <dt>File › Save plan, Open plan</dt>
            <dd>A plan as one file, to move between browsers or send to someone. Opening one makes a new plan.</dd>
            <dt>File › Import CSV</dt>
            <dd>From a Jira export, as a new plan. Cards keep their Jira keys.</dd>
            <dt>
              Inspect, <kbd>{keys.inspect}</kbd>
            </dt>
            <dd>Every property of the selected cards, editable without pivoting, plus descriptions and links.</dd>
            <dt>Properties</dt>
            <dd>Add your own, such as Team, and move or delete values.</dd>
          </dl>
        </section>
        <section>
          <h3>Share</h3>
          <dl>
            <dt>Share</dt>
            <dd>
              Gives a Can edit and a Can view link, through a relay: the app opened from one, or one you name. The relay
              keeps an encrypted copy it can’t read; the key is only in the link.
            </dd>
            <dt>Live, Offline</dt>
            <dd>
              Beside a shared plan’s name. Keep working offline: it counts what isn’t shared yet, and shares it when
              you’re back. Click it for the plan’s links.
            </dd>
            <dt>View only</dt>
            <dd>A plan opened with its Can view link: you see changes as they happen, and can’t make any.</dd>
            <dt>Who’s here</dt>
            <dd>
              The avatars beside it. Others’ pointers and selections show on the same cards in your own view. Click the
              avatars to drive, or to show only the driver’s pointer, or nobody’s.
            </dd>
            <dt>Moving the same card</dt>
            <dd>
              A card someone is dragging says so, and where to. If two of you drop it, the later drop wins, and each of
              you is told, with a way back.
            </dd>
            <dt>Make new links</dt>
            <dd>In the links, to cut off the old ones. Anyone with an old link keeps the plan as it was, read-only.</dd>
            <dt>Activity</dt>
            <dd>
              Who changed what, and when, in your time zone. Restore brings back anything deleted. A card’s own history is
              in the inspector, and its tooltip says who changed it last.
            </dd>
            <dt>Share by file</dt>
            <dd>
              Where no relay is allowed. <strong>File › Send changes</strong> makes an encrypted file to email;{' '}
              <strong>Merge changes…</strong> takes one someone sent you.
            </dd>
          </dl>
        </section>
        <section>
          <h3>What the board tells you</h3>
          <dl>
            <dt>The colored edge</dt>
            <dd>
              The card’s area, so you can tell it in any view. Its header shows the same color; point at the edge to see
              its name.
            </dd>
            <dt>Heavier borders</dt>
            <dd>Initiatives and epics. A card with no level hasn’t been decided yet.</dd>
            <dt>Dashed lines and outlines</dt>
            <dd>The copies of a card that’s in more than one lane.</dd>
            <dt>Frames</dt>
            <dd>
              A group around its cards in this cell: solid when it’s expanded, dashed when it’s collapsed and only its
              cards are here.
            </dd>
            <dt>
              <span className="mismatch">⚠</span> markers
            </dt>
            <dd>
              A card that doesn’t fit its group: dated outside it, larger, in another area, or at its level or above. On
              a group, “⚠ 3” counts what’s wrong inside it, red lines included. Point at it to see what.
            </dd>
            <dt>Undo, redo, cancel</dt>
            <dd>
              <kbd>{keys.undo}</kbd>, <kbd>{keys.redo}</kbd>, <kbd>Esc</kbd> during a drag.
            </dd>
          </dl>
        </section>
      </div>
      <p className="legend-foot">
        Everything saves in this browser as you go, and the same plan open in two tabs stays in step. Save to a file
        to take it somewhere else, or share it.
      </p>
      <p className="legend-foot" data-testid="legend-builds">
        Build {BUILD}
        {relayBuild && <> · Relay {relayBuild}</>} ·{' '}
        <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">
          Feedback and bug reports
        </a>{' '}
        ·{' '}
        <button type="button" className="link" onClick={() => setLicenses(true)}>
          Open-source licenses
        </button>
      </p>
    </aside>
  );
}

/**
 * The build of the relay a shared plan goes through, from its /config, so a
 * report about sharing names both builds. A relay from before builds were
 * named says nothing, and a relay that can't be reached shows nothing.
 */
function useRelayBuild(relay: string | null): string | null {
  const [build, setBuild] = useState<string | null>(null);
  useEffect(() => {
    if (relay === null) return;
    let live = true;
    void checkRelay(relay).then((info) => {
      if (live && info) setBuild(info.build ?? 'unnamed (an older relay)');
    });
    return () => {
      live = false;
    };
  }, [relay]);
  return relay === null ? null : build;
}

/** The licenses of the software inside the app, as the build listed them (ADR 0001, amended). */
function Licenses({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const text = thirdPartyNotices();
  return (
    <aside className="legend" aria-label="Open-source licenses" data-testid="licenses">
      <header>
        <h2>Open-source licenses</h2>
        <span>
          <button type="button" className="link" onClick={onBack}>
            Back to the cheat sheet
          </button>
          <button type="button" onClick={onClose} aria-label="Close help">
            ✕
          </button>
        </span>
      </header>
      <pre className="legend-licenses">{text ?? 'The licenses are listed in the built app. This one was started with npm run dev.'}</pre>
    </aside>
  );
}
