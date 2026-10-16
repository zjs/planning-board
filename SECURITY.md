# Security

Roadmaps are confidential, so Planning Board is built so that nothing but a person's own browser can read a plan:

- **On its own,** the app runs entirely in the browser, with no account, no analytics, and no network requests. Plans are kept in the browser's storage and in files people save.
- **A shared plan** goes through a relay, which stores and forwards it encrypted. The key is only in the share link, after the `#`, which browsers never send to a server. A plan shared by file travels encrypted with the same key. How the keys and links work is in [ADR 0018](docs/decisions/0018-keys-and-links.md); what a relay can and can't see is in [`relay/README.md`](relay/README.md#what-it-can-and-cant-see). The [threat model](docs/security/threat-model.md) treats whoever runs a relay as the attacker: what they can and can't do, how each claim is established, and what's still open.
- **The app's own code** could read a plan, so it matters where it comes from. Shared through an HTTPS relay, links open the page the plan was shared from, or the hosted page, never the relay's copy of the app. A relay on a laptop over plain `http` serves the app itself, so whoever runs it is trusted with the plan. Each release's `planning-board.html` has a checksum and a build attestation, so a copy can be checked ([how](relay/README.md#checking-a-download)).

So the problems that matter most are ones that would let someone read or change a plan without its link: a weakness in the encryption or the links, a relay that can be made to reveal or alter what it stores, a Can view link that can write, or a link that still works after **Make new links**. Files the app opens (plan files, CSV imports, changes files) are in scope too.

If you find a security problem, please report it privately through [GitHub's private vulnerability reporting](https://github.com/zjs/planning-board/security/advisories/new), not in a public issue. You'll get a reply there.

**Never paste a share link** in an issue or a report: anyone with it can open the plan.
