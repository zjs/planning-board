import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Connection, ConnectionStatus, RelayProblem } from '../commands/store.ts';
import type { SharedPlan } from '../commands/plans.ts';
import {
  appForLinks,
  checkRelay,
  isLocalOnly,
  linksFor,
  myName,
  relayAddress,
  relayHere,
  rememberedRelay,
  rememberRelay,
  setMyName,
  type RelayInfo,
} from '../commands/sharing.ts';
import { Dialog } from './Dialog.tsx';

const NO_CONNECTION = { status: null, problem: null, canWrite: false } as const;

/** A shared plan's connection, as React state: re-renders on every change of status or problem. */
export function useConnection(connection: Connection | null): {
  status: ConnectionStatus | null;
  problem: RelayProblem | null;
  canWrite: boolean;
} {
  const key = useSyncExternalStore(
    (listener) => connection?.subscribe(listener) ?? (() => undefined),
    () => (connection ? `${connection.status}|${String(connection.canWrite)}|${connection.problem?.code ?? ''}|${String(connection.retired)}` : ''),
  );
  if (!connection || key === '') return NO_CONNECTION;
  return { status: connection.status, problem: connection.problem, canWrite: connection.canWrite };
}

/** A link with a Copy button. Where the clipboard isn't allowed, the link is selected for copying by hand. */
function LinkField({ label, link, hint, testId }: { label: string; link: string; hint: string; testId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const selectIt = () => {
      input.current?.focus();
      input.current?.select();
    };
    // Over plain http on a network, the browser gives no clipboard at all.
    try {
      navigator.clipboard.writeText(link).then(() => setCopied(true), selectIt);
    } catch {
      selectIt();
    }
  };
  return (
    <div className="share-link">
      <label>
        <span className="share-link-label">{label}</span>
        <span className="share-link-hint">{hint}</span>
        <span className="share-link-row">
          <input ref={input} readOnly value={link} data-testid={testId} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
      </label>
    </div>
  );
}

/** Where the relay step stands: looking for a relay that served this page, or asking for one. */
type RelayStep = { kind: 'looking' } | { kind: 'here'; info: RelayInfo } | { kind: 'ask' };

/**
 * Share a plan (requirements 30 and 33, ADR 0018): your name, once per
 * browser; the relay; then the plan's Can edit and Can view links. A plan
 * that's already shared opens straight to its links.
 */
export function ShareDialog({
  planName,
  shared,
  connection,
  onShare,
  onMoveRelay,
  onRenewLinks,
  onSaveFile,
  onClose,
}: {
  planName: string;
  shared: SharedPlan | null;
  connection: Connection | null;
  /** Share the plan through this relay: the address this browser reaches it at. */
  onShare: (relay: string) => void;
  /** A shared plan's relay has a new address, such as a laptop on another network. */
  onMoveRelay: (relay: string) => void;
  /** Make new links, cutting off the old ones (Q62). */
  onRenewLinks: () => void;
  onSaveFile: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(() => myName() ?? '');
  const [named, setNamed] = useState(() => myName() !== null);
  const [relayStep, setRelayStep] = useState<RelayStep>({ kind: 'looking' });
  const [typed, setTyped] = useState(() => rememberedRelay() ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // The relay's address as others reach it, for the links.
  const [publicRelay, setPublicRelay] = useState<string | null>(null);
  const { status, problem: refused } = useConnection(connection);
  const [renewing, setRenewing] = useState(false);
  const replaced = connection?.retired === true;

  useEffect(() => {
    let live = true;
    void relayHere().then((info) => {
      if (live) setRelayStep(info ? { kind: 'here', info } : { kind: 'ask' });
    });
    return () => {
      live = false;
    };
  }, []);

  // A shared plan's links name the relay as others reach it, which it says at /config.
  const sharedRelay = shared?.relay ?? null;
  useEffect(() => {
    if (sharedRelay === null) return;
    let live = true;
    void checkRelay(sharedRelay).then((info) => {
      if (live) setPublicRelay(info ? info.publicUrl.replace(/\/$/, '') : sharedRelay);
    });
    return () => {
      live = false;
    };
  }, [sharedRelay]);

  const tryRelay = async (relay: string) => {
    setChecking(true);
    setProblem(null);
    const info = await checkRelay(relay);
    setChecking(false);
    if (!info) {
      setProblem(`There’s no relay answering at ${relay}. Check it’s running, and that this computer can reach it.`);
      return null;
    }
    if (info.protocol !== 1) {
      setProblem('That relay is a different version from this app. Open the app from the relay’s own address instead.');
      return null;
    }
    return info;
  };

  if (!named) {
    return (
      <Dialog title="Share this plan" onClose={onClose} testId="share-dialog">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() === '') return;
            setMyName(name);
            setNamed(true);
          }}
        >
          <label className="share-field">
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} data-testid="share-name" autoComplete="name" />
          </label>
          <p className="share-note">Others sharing a plan with you see it. It’s kept in this browser only.</p>
          <div className="dialog-actions">
            <button type="submit" className="primary" disabled={name.trim() === ''}>
              Continue
            </button>
          </div>
        </form>
      </Dialog>
    );
  }

  if (shared) {
    const links = publicRelay === null || shared.pending || replaced ? null : linksFor(shared, appForLinks(publicRelay), publicRelay);
    return (
      <Dialog title={`Share “${planName}”`} onClose={onClose} testId="share-dialog">
        {replaced ? (
          <p className="share-problem" role="alert" data-testid="share-replaced">
            This plan was given new links, so the one you opened can only show it. Ask whoever shared it for the new link.
          </p>
        ) : refused ? (
          <p className="share-problem" role="alert">
            The relay refused this plan: {refused.message}
          </p>
        ) : status !== 'live' && (shared.pending || publicRelay === null) ? (
          <p role="status">{shared.replaces?.length ? 'Making new links…' : 'Sharing…'}</p>
        ) : null}
        {links && (
          <>
            {links.edit && (
              <LinkField
                label="Can edit"
                hint="Anyone with this link can change the plan."
                link={links.edit}
                testId="edit-link"
              />
            )}
            <LinkField label="Can view" hint="Anyone with this link can see the plan, and not change it." link={links.view} testId="view-link" />
            <p className="share-note">
              The relay never sees your plan: it’s encrypted with a key that’s only in the link, after the #, which
              browsers don’t send to any server.
            </p>
            {isLocalOnly(publicRelay ?? '') && (
              <p className="share-problem">
                These links say <code>localhost</code>, so they only open on this computer. Start the relay on a computer
                your colleagues can reach, and open the app from the address it prints.
              </p>
            )}
          </>
        )}
        {links?.edit && !renewing && (
          <div className="share-renew">
            <button type="button" onClick={() => setRenewing(true)} data-testid="renew-links">
              Make new links…
            </button>
          </div>
        )}
        {renewing && (
          <div className="share-renew" role="group" aria-label="Make new links">
            <p>
              Both links stop working. Anyone who opens them sees the plan as it was, and can’t change it; people who had
              them keep what they already saw. Send the new links to everyone who should still have the plan.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setRenewing(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                data-testid="renew-confirm"
                onClick={() => {
                  setRenewing(false);
                  onRenewLinks();
                }}
              >
                Make new links
              </button>
            </div>
          </div>
        )}
        {shared.secret && !replaced && (
          <details className="share-move">
            <summary>The relay moved?</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const address = relayAddress(typed);
                if ('problem' in address) {
                  setProblem(address.problem);
                  return;
                }
                void tryRelay(address.relay).then((info) => {
                  if (!info) return;
                  rememberRelay(address.relay);
                  onMoveRelay(address.relay);
                });
              }}
            >
              <label className="share-field">
                Its new address
                <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={shared.relay} />
              </label>
              {problem && <p className="share-problem">{problem}</p>}
              <div className="dialog-actions">
                <button type="submit" disabled={checking}>
                  Use this address
                </button>
              </div>
            </form>
          </details>
        )}
        <div className="dialog-actions">
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Dialog>
    );
  }

  const shareThrough = (relay: string) => {
    rememberRelay(relay);
    onShare(relay);
  };

  return (
    <Dialog title={`Share “${planName}”`} onClose={onClose} testId="share-dialog">
      {relayStep.kind === 'looking' && <p role="status">Looking for a relay…</p>}
      {relayStep.kind === 'here' && (
        <>
          <p>
            Your plan is shared through the relay this page came from, <code>{relayStep.info.publicUrl}</code>. Anyone
            with a link sees the plan you’re on now, and its changes from then on.
          </p>
          {isLocalOnly(relayStep.info.publicUrl) && (
            <p className="share-problem">
              This address only works on this computer, so colleagues can’t open its links. Open the app from the
              relay’s network address instead, which it prints when it starts.
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              data-testid="share-start"
              // This browser reaches the relay where it found this page; links use the address others reach.
              onClick={() => shareThrough(new URL('.', location.href).href.replace(/\/$/, ''))}
            >
              Share
            </button>
          </div>
        </>
      )}
      {relayStep.kind === 'ask' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const address = relayAddress(typed);
            if ('problem' in address) {
              setProblem(address.problem);
              return;
            }
            void tryRelay(address.relay).then((info) => info && shareThrough(address.relay));
          }}
        >
          <p>
            A shared plan goes through a relay, which passes changes between you and keeps an encrypted copy. It can’t
            read the plan. Run one on your own computer (<code>planning-board-relay</code>), or use your company’s.
          </p>
          <label className="share-field">
            Relay address
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="http://192.168.1.23:8787"
              data-testid="share-relay"
            />
          </label>
          {location.protocol === 'https:' && (
            <p className="share-note">From this page, a relay must use https, or run on this computer (localhost).</p>
          )}
          {problem && (
            <p className="share-problem" role="alert">
              {problem}
            </p>
          )}
          <details className="share-move">
            <summary>Or open the app from your relay</summary>
            <p>
              A relay serves the app too, at the address it prints. Links from there work for everyone who can reach it.
              Each address keeps its own plans, so save this one to a file first, then open the file there.
            </p>
            <button type="button" onClick={onSaveFile}>
              Save plan to file
            </button>
          </details>
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={checking} data-testid="share-start">
              {checking ? 'Checking…' : 'Share'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
