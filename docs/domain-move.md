# Moving the public build to a domain of its own

The steps for the PM, in order. The current site at `https://zjs.github.io/planning-board/` keeps working until step 6. Why it's built this way: [ADR 0025](decisions/0025-a-domain-of-its-own.md).

## 1. Choose and buy

- **The name.** Buy the domain at any registrar. Plans and links will carry it for years, so prefer one you'll keep renewing.
- **The host.** It must not be this repository's own Pages site, which keeps the old address so the hand-over page can run there. Either:
  - **a second GitHub repository,** such as `zjs/planning-board-site`, with Pages on the custom domain. Add a token that can push to it as a secret here, and engineering adds the deploy job; or
  - **another static host,** such as Cloudflare Pages. Add its API token as a secret, and engineering adds the deploy job.

Then tell engineering the name and the host.

## 2. Engineering points the build at it

In one pull request:
- `NEW_PUBLIC_APP` in `src/move/addresses.ts` becomes the new address.
- The relay's default `-allow-origin` (`relay/relay.go`) gains the new host, beside `zjs.github.io`.
- A deploy job publishes each tested build at the new address, after CI passes on `main`, as `pages.yml` does today.
- A release (the next version) carries the relay that allows both, with a note in its release notes for anyone running a relay.

## 3. Check the new address

With the old address still serving the app:
1. Open the new address: the app loads, and its cheat sheet names the same build as the old address.
2. Share a plan through an HTTPS relay, such as the demo relay, and open the link in a second browser profile: it opens at the new address and goes **Live**.
3. In a browser that has plans at the old address, open the new address, choose **File › Bring plans from zjs.github.io**, and check every plan arrives: its cards, its history, and, for a shared plan, the same links, still syncing.
4. Check what GitHub does with the old address once another site has the domain: it must still serve this repository's Pages site, not redirect.

## 4. Relays allow the new address

Hosted relays, the demo relay included, move to the release from step 2. A relay that doesn't allow the new host refuses pages from it. People see **Can't use the relay** until it's upgraded, or until its operator adds the host with `-allow-origin`.

## 5. Tell people

The README, `CLAUDE.md` and the docs name the new address; engineering changes them in one pull request. Links already sent keep working through the stub.

## 6. Switch the old address to the stub

In Settings › Secrets and variables › Actions › Variables, set `OLD_ADDRESS_SERVES` to `stub`, then re-run the latest Pages workflow. The old address now:
- sends share links on to the new one, keys and all;
- sends everyone else straight on, unless their browser still keeps plans there, when it offers to move them, or to open the old app at `./app/` to save them to files.

To undo, set it back to `app` and re-run Pages.

## Later

Once few people still arrive through the old address, the stub can stay as it is indefinitely: it costs nothing and keeps old links working.
