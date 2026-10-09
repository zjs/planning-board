# Planning Board relay

One program that serves [Planning Board](https://github.com/zjs/planning-board) and lets people share plans through it, end-to-end encrypted. It stores and forwards changes it can't read: the key is in each share link, after the `#`, which browsers never send to a server.

Run it on a company server, in a container, or on your own computer for a pilot. It's the same program each way, so a pilot that works becomes the install.

You only need it to share. One person planning alone can use the [hosted page](https://zjs.github.io/planning-board/) or the app opened from a file, with no relay.

## Download and run

Download the archive for your computer from the [`relay-latest` release](https://github.com/zjs/planning-board/releases/tag/relay-latest), unpack it, and run `planning-board-relay`. It prints the addresses to open:

```
Planning Board is running.
  On this computer: http://localhost:8787
  On your network:  http://192.168.1.23:8787
  Shared plans are kept, encrypted, in /Users/you/Downloads/planning-board-data
  Leave this window open while people use it. Press Ctrl+C to stop.
```

Open the "On this computer" address, and **Share** a plan from there. Colleagues on the same network open the links you send them, which use the "On your network" address. Shared plans are kept in `planning-board-data`, next to the program. Copying that folder is a backup, at any moment; after restoring one, start the relay once with `-restored`.

Running it for a team, behind HTTPS, with upgrades and backups, or as a pilot on a laptop: [`docs/hosting.md`](https://github.com/zjs/planning-board/blob/main/docs/hosting.md).

**On a Mac,** the program isn't signed yet, so macOS refuses to open it. In Terminal, in the folder you unpacked it to:

```
xattr -d com.apple.quarantine planning-board-relay
./planning-board-relay
```

**On Linux,** if it won't run, `chmod +x planning-board-relay` first.

**On Windows,** allow it through the firewall when Windows asks, on private networks, so colleagues can reach it.

## In a container

```
docker run -p 8787:8787 -v planning-board-data:/data ghcr.io/zjs/planning-board -public-url https://plans.example.com
```

Put it behind your company's reverse proxy for HTTPS, and pass `-trust-forwarded` so it sees each person's address rather than the proxy's. [`docs/hosting.md`](https://github.com/zjs/planning-board/blob/main/docs/hosting.md) has Caddy, nginx and systemd examples.

## Updating

`planning-board-relay -version` says which build you have, such as `build 3d350aa (2026-10-09)`; so do its start-up message and `/config`. To update, stop it, replace the program (or pull the new image), and start it again with the same data folder. Boards that were open reconnect on their own. The `relay-latest` release is rebuilt from every change to the project, so the newest download is always the one to use; [`docs/hosting.md`](https://github.com/zjs/planning-board/blob/main/docs/hosting.md#upgrading) has the details.

## Options

| Flag | Default | What it does |
|---|---|---|
| `-addr` | `:8787` | Where to listen. |
| `-data` | `planning-board-data` next to the program | Where shared plans are kept, encrypted. |
| `-public-url` | the address it was reached on | The address people use, for share links. Set it behind a proxy. |
| `-allow-origin` | `zjs.github.io` | Other web hosts whose pages may use this relay, or `*`. The relay's own pages are always allowed. |
| `-allow-file-pages` | on | Let the app opened as a file from disk use this relay. |
| `-max-message` | 4 MB | The largest single change or snapshot. |
| `-max-room` | 200 MB | The most one shared plan may hold. |
| `-max-data` | 2 GB | The most all shared plans together may hold. |
| `-max-rooms` | 1000 | The most shared plans the relay keeps. |
| `-update-rate` | 50 | Changes per second one connection may send. |
| `-presence-rate` | 30 | Presence messages per second one connection may send: pointers, selections and drags. Counted apart from changes. |
| `-connection-rate` | 120 | Connections per minute from one address. |
| `-share-rate` | 60 | New shared plans per hour from one address. |
| `-trust-forwarded` | off | Behind a proxy, read `X-Forwarded-For` and `X-Forwarded-Proto`. |
| `-static` | | Serve the app from this directory's `index.html` instead of the built-in one. |
| `-announce` | on | Print the addresses colleagues can open. |
| `-version` | | Print which build this is, and stop. |
| `-licenses` | | Print the licenses of the open-source software inside, and stop. |
| `-restored` | off | Start once with this after restoring the data folder from a backup: every shared plan gets a new epoch, so boards send whatever the backup is missing. |

## What it can and can't see

- **It can't read plans:** every change is encrypted in the browser before it's sent. How the keys and links work is in [ADR 0018](https://github.com/zjs/planning-board/blob/main/docs/decisions/0018-keys-and-links.md).
- **It does see:** which shared plans exist, when people connect and from which addresses, and how large the changes are.
- **When it serves the app,** whoever runs it could serve an altered app. That's the same trust as any website. Run it yourself, or have your company run it. Over plain `http`, on a network you don't trust, someone in between could do the same.

## Building it

```
npm ci && npm run build
cp dist/index.html relay/web/index.html
cd relay && go build -trimpath -o planning-board-relay .
```

Without `relay/web/index.html`, the program serves a page saying how to add the app. `go test -race ./...` runs its tests. The wire protocol is in [`PROTOCOL.md`](https://github.com/zjs/planning-board/blob/main/relay/PROTOCOL.md).

## License

Apache 2.0, in `LICENSE` beside this file. The open-source software inside it, and inside the app it serves, is listed with its licenses in `THIRD-PARTY-NOTICES.txt`, which `-licenses` also prints (in a container: `docker run --rm ghcr.io/zjs/planning-board -licenses`). The source is at <https://github.com/zjs/planning-board>.
