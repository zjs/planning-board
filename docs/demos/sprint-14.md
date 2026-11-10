# Sprint 14 demo

Sprint 14 is "the relay, made safe to host" (`docs/plans/m2-plan.md`): show what whoever runs a relay can and can't do, check it formally, keep them out of the app's code, and get a hosted demo relay ready.

- **The threat model** (`docs/security/threat-model.md`, Q79): the operator as the attacker, each claim with how it's established, and findings, each fixed, queued or accepted.
- **Formal checks in CI** (ADR 0024): a protocol proof (ProVerif), TLA+ models of sync with offline work and of grouping, and random schedules of the real code.
- **Keeping the operator out of the app** (Q80 c): links through an https relay never open its copy, a relay can serve no app, and each release's `planning-board.html` is checksummed and attested.
- **Ready for a domain of its own** (Q80 d, ADR 0025): plans move between addresses browser to browser. Nothing changes at the current address until you've chosen the domain and its host (`docs/domain-move.md`).
- **The demo relay** (Q64 a): idle expiry, a privacy note, and deploy steps for you (`docs/hosting-demo.md`).

## Set up

This is a release: once this merges, **v0.14.0** appears under [Releases](https://github.com/zjs/planning-board/releases). Download its relay archive for your computer, `planning-board.html` and `SHA256SUMS` into one folder. Use **two browser profiles**, Ada and Bo, as in the earlier demos.

## Exit criteria walkthrough (about 20 minutes)

| Do this | You should see |
|---|---|
| **1.** Read [the threat model](../security/threat-model.md)'s first sections: the attacker, what's protected, and the claims. | In plain words: the operator can't read a plan's content or forge a change. They can see which plans exist, who connects and when, and how large the changes are. Anyone holding a Can view link who also runs the relay could write. Each claim names the proof, model or test behind it. |
| **2.** Open the latest CI run on `main` under **Actions**. | **Formal: protocol, sync and grouping** passes, and its summary lists each model, its broken variants (which must fail), and its states. **App** lists the random schedules among its tests. |
| **3.** As Bo, in a profile that has never shared, open a share link from the hosted page. | Before the plan, a dialog asks Bo's name, with **Not now**. |
| **4.** In the download folder, check the files: `shasum -a 256 -c SHA256SUMS --ignore-missing` (Mac), or `sha256sum -c …` (Linux). | `planning-board.html: OK`, and the relay archive OK. |
| Unpack the relay archive, and start it with `./planning-board-relay -serve-app=false` (on a Mac, the quarantine step in its README first). | It says it serves no app, and that over plain http people open the HTML file. Instead of app addresses it prints **Relay, here** (`http://localhost:8787`) and **Relay, on network**. Opening either in a browser shows a page saying where to open the app instead. |
| As Ada, open `planning-board.html` from the folder, **Load sample plan**, **Share**, and give `http://localhost:8787` as the relay. | Links, with a note: the relay serves no app, so the links name the public build, which can't reach a plain http relay, and everyone opens the HTML file and pastes the link into **Open a share link…**. There's no note saying whoever runs the relay could change the app. If this computer has no network address, a warning also says the links only work on this computer. |
| As Bo, open `planning-board.html` too, then **File › Open a share link…**, and paste Ada's Can edit link. | Bo's name, then Ada's plan, **Live**. Edits show on both boards. |
| **5.** *After you deploy the demo relay (`docs/hosting-demo.md`) and a pull request sets its address:* on https://zjs.github.io/planning-board/, **Share** a plan. | The demo relay is already in the field, with "Plans nobody opens for 30 days are deleted · What it keeps". Open the link as Bo: it works with no setup. The relay's own address says it serves no app, and `/privacy` says what it keeps. |

Automated tests run steps 3 to 5 on every build, as far as they can without the real hosted pages: `e2e/relay/share.spec.ts` (the name prompt), `e2e/relay/no-app.spec.ts` (a relay serving no app, used from the file by two people), and `e2e/relay/demo.spec.ts` (Share offering a stand-in demo relay). CI runs the formal models on every change.

## What else changed

- **A cursor with no epoch starts again** (F10 in the threat model): a first visit cut short, followed by a restore of the relay, can no longer miss the plan's first changes. The sync model found it.
- **Behind a proxy,** the relay reads the last `X-Forwarded-For` entry, which the proxy added, not the first, which anyone could set. `-client-address-header` reads a proxy's own header, as the demo relay does with Fly.io's.
- **Links from an https relay's own page** now open the hosted page, never the relay's copy (F1). Teams on an https relay need to reach `zjs.github.io`, and `-allow-origin` must keep it; the release notes say so.
- **The domain move** is prepared but switched off: `move.html` sits beside the current app, unused until the new address exists.

## Known gaps

- **The demo relay isn't live** until you deploy it. Until then, nothing in the app mentions it.
- **The new domain** waits for your choice of name and host (`docs/domain-move.md`).
- **Fly.io details** are from its docs and community threads, not tried: the volume's owner, and that its edge overwrites a `Fly-Client-IP` someone sends. The deploy steps' checks would catch the first, not the second.
- **An operator holding a Can view link can write** (F5), and a relay could hold changes back from some people without anyone noticing (F4). Both are queued in the backlog's theme N: signing each change, and a hash chain over them.
- **Yjs's own merging is assumed correct,** not checked: the models treat it as a set of changes merged by union (`docs/plans/sprint-14-plan.md`).
- **"Since you were away"** is sprint 15.
