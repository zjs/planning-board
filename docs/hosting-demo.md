# Running the hosted demo relay

The demo relay lets anyone try sharing a plan from the hosted page, with no setup (Q64 a). It's the published relay image, run with no app, demo limits, a privacy note, and plans nobody opens for 30 days deleted. Its configuration is [`deploy/demo-relay/fly.toml`](../deploy/demo-relay/fly.toml), on Fly.io. Any host that runs a container with a persistent volume and HTTPS would do; the flags in that file are what matter.

**Before you start:** the image must have the demo's flags, which arrive in version 0.14.0. Do this after the 0.14.0 release is published.

## 1. Account and tools (the PM)

1. Make a Fly.io account and add a card. The demo uses one small machine and a 1 GB volume, about $3–5 a month _(recalled; check Fly's pricing page)_.
2. Install `flyctl` and run `fly auth login`.

## 2. Create the app and its volume (the PM)

From `deploy/demo-relay/` in a checkout of the repository:

```
fly launch --copy-config --no-deploy --name <a name of your choice>
fly volumes create relay_data --size 1 --region ams
```

`fly launch` keeps this folder's `fly.toml` and writes the name you chose into it. The relay's address is then `https://<name>.fly.dev`.

## 3. Deploy (the PM)

```
fly deploy
```

## 4. Check it from outside

- `https://<name>.fly.dev/healthz` says `ok`.
- `https://<name>.fly.dev/` shows the relay's page, **not** the app, and links to the privacy note.
- `https://<name>.fly.dev/privacy` shows the privacy note.
- `https://<name>.fly.dev/config` names `https://<name>.fly.dev` as its public address.
- On the [hosted page](https://zjs.github.io/planning-board/): load the sample, **Share**, give `https://<name>.fly.dev`, and copy the Can edit link. Open it in another browser profile: the plan opens and goes **Live**, and a change in one shows in the other.

Then tell engineering the address. A pull request sets it as the demo relay (`DEMO_RELAY` in `src/commands/sharing.ts`), so the hosted page offers it in Share by default, and names it in the README.

## Running it

- **Upgrading:** change the image tag in `fly.toml` to the new version and run `fly deploy`. Shared plans are on the volume and survive it.
- **Watching it:** `fly logs` shows start-ups, expired plans and errors. It never shows plan content, and the relay logs no internet addresses; Fly's own proxy keeps its logs.
- **If it fills up:** people see "This relay is full". Plans expire after 30 days unused, so it empties by itself; raise `-max-rooms` or the volume, if it's being used for real.
- **Abuse:** the limits are per address and per plan. A relay that's being misused can be stopped with `fly scale count 0`, which keeps the volume.
- **Backups:** none, by design. It's a demo, and its privacy note says plans on it can be lost.
