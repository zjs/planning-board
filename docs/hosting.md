# Running a relay

A shared plan goes through a relay: one program that serves Planning Board, and stores and forwards changes it can't read. This page covers running one for a team: on a server behind HTTPS, kept up to date and backed up, or on a laptop for a pilot. The program's options are in [`relay/README.md`](../relay/README.md), and why it can't read plans is in [ADR 0018](decisions/0018-keys-and-links.md).

It's the same program on a laptop and on a server. A pilot that works becomes the install: copy its data folder to the server.

## On a server

### Run it

Either a container:

```
docker run -d --name planning-board --restart unless-stopped \
  -p 127.0.0.1:8787:8787 -v planning-board-data:/data \
  ghcr.io/zjs/planning-board -public-url https://plans.example.com -trust-forwarded
```

Or the Linux download from the [`relay-latest` release](https://github.com/zjs/planning-board/releases/tag/relay-latest), under systemd, as `/etc/systemd/system/planning-board.service`:

```ini
[Unit]
Description=Planning Board relay
After=network-online.target

[Service]
ExecStart=/opt/planning-board/planning-board-relay -addr 127.0.0.1:8787 -data /var/lib/planning-board -public-url https://plans.example.com -trust-forwarded -announce=false
DynamicUser=yes
StateDirectory=planning-board
Restart=on-failure
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes

[Install]
WantedBy=multi-user.target
```

Then `systemctl enable --now planning-board`.

Either way, it listens only on the server itself, and a reverse proxy in front of it answers on HTTPS.

- **`-public-url`** is the address people open. Share links use it.
- **`-trust-forwarded`** lets the relay see each person's address, from the proxy's `X-Forwarded-For`, rather than the proxy's own. Its rate limits are per address, so without it, everyone shares one limit. Set it only behind a proxy that sets that header.

### HTTPS, with a reverse proxy

The proxy must pass WebSocket upgrades on `/rooms/`. The relay accepts pages from its own address, which it knows from `-public-url` or from the `Host` header the proxy passes on.

**Caddy** fetches a certificate on its own, and passes WebSockets and `Host` by default:

```
plans.example.com {
	reverse_proxy 127.0.0.1:8787
}
```

**nginx:**

```nginx
server {
    listen 443 ssl;
    server_name plans.example.com;
    # ssl_certificate and ssl_certificate_key as usual

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # A shared plan's connection stays open for as long as someone has it open.
        proxy_read_timeout 1h;
    }
}
```

**Rooms.** Each shared plan uses two rooms on the relay, one for the board and one for its history, so `-max-rooms` counts both: the default of 1000 is about 500 shared plans.

**Checking it.** `https://plans.example.com/healthz` says `ok`, and `/config` names the public address. Open the address, load the sample, and **Share**: the pill should say **Live**.

**Pages hosted elsewhere.** People usually open the app from the relay's own address, but the public copy on GitHub Pages can use your relay too, if the relay is on HTTPS: a page served over HTTPS can't reach a plain `http` relay, except one on the same computer. To let another host's copy of the app use it, add that host with `-allow-origin`.

### Upgrading

Stop the relay, replace the program or pull the new image, and start it again. Boards that were open reconnect on their own, and send anything made in the meantime.

A relay and an app built at different times work together as long as they speak the same protocol version (`relay/PROTOCOL.md`). If they don't, the pill says **Can't use the relay**, and its message says which one to update. Since the relay serves the app, people who open it from the relay's address always get a matching build.

New features sometimes need both. For example, **Make new links** cuts off old links only on a relay built after it was added (October 2026). On an older relay, the app warns that old links still work, so upgrade the relay before relying on it. The `relay-latest` release and the container's `latest` tag are rebuilt from every change, so upgrading means taking the newest.

### Backup and restore

Everything is in the data folder: one folder per shared plan, each holding only ciphertext. A backup is a copy of that folder, taken at any time, by any tool that copies files.

To restore:

1. Stop the relay.
2. Put the backup in place of the data folder.
3. Start it once with `-restored`. Every shared plan gets a new epoch, so each board that opens it starts again from the relay's copy, and sends whatever the backup is missing. Nobody loses the work they did after the backup, as long as someone who had it opens the plan.
4. Later starts don't need the flag.

A plan made after the backup isn't in it. Boards that have it say **Not on the relay**, and **Put it back** makes it again from that board's copy.

Keys never reach the relay, so a backup can't be read without a plan's link. It does show which plans exist and how large they are.

## A pilot on a laptop

For a team that can't use a hosted relay, and hasn't yet persuaded IT to run one: one person runs the relay on their own computer, and colleagues on the same network open its address. Download it from the [`relay-latest` release](https://github.com/zjs/planning-board/releases/tag/relay-latest), and see [`relay/README.md`](../relay/README.md) for the Mac and Windows steps.

What to know:

- **The same network.** Colleagues open the "On your network" address the relay prints. Over a VPN, that works only if the VPN lets computers reach each other. Many company VPNs don't.
- **While it's off, sharing pauses.** If the laptop sleeps, shuts down or leaves the network, everyone's pill says **Reconnecting…** and then **Offline**. Everyone keeps working, and changes are shared when the relay is back. For a long pilot, keep the laptop awake and plugged in.
- **A new address.** If the laptop's address changes, such as on another network, links still name the old one. Everyone opens **Share › The relay moved?** and types the new address once. Their plans and unsent changes carry over.
- **Moving to a server.** Stop the relay, copy `planning-board-data` to the server's data folder, and start the server's relay. Everyone then uses **The relay moved?** with the server's address, or the share links made from it.
- **Company policy.** Running a server on a laptop may be covered by your company's policy too. Check before a pilot.

Where neither a hosted relay nor a laptop is allowed, a shared plan can travel as encrypted files instead, through email or a shared drive: **Share › No relay allowed? Share by file** ([ADR 0022](decisions/0022-changes-by-file.md)).
