# Spike: a relay that reads nothing

The M2 relay's shape (`docs/sprint-9.md`, deliverable 3): rooms of encrypted updates, numbered and forwarded, with snapshots made by clients. The relay has no Yjs code and no keys. The reading is in `docs/research/collaboration/relay-and-sync.md`.

```
go test ./...                                     # the relay on its own
go run . -static ../sync-client/dist             # serve the spike app and the relay on http://localhost:8787
```

Flags:
- `-addr`: where to listen (default `localhost:8787`);
- `-data`: where rooms are kept (default `relay-data`);
- `-static`: a directory to serve at `/`.

**The protocol:** JSON text frames over a WebSocket at `/rooms/{id}`. `data` is always ciphertext.

| From | Frame | Meaning |
|---|---|---|
| Client | `{"t":"hello","after":N}` | Send me everything after update N |
| Relay | `{"t":"snapshot","upto":S,"data":…}` | The latest snapshot, if the client is behind it |
| Relay | `{"t":"update","seq":K,"data":…}` | An update, in sequence order |
| Relay | `{"t":"synced","head":H,"upto":S,"from":id}` | Caught up. `from` is this connection's ID |
| Client | `{"t":"update","ref":r,"data":…}` | A new update. The relay numbers it, writes it to disk, forwards it, and acknowledges it |
| Relay | `{"t":"ack","ref":r,"seq":K}` | Your update `r` is number K |
| Client | `{"t":"snapshot","upto":S,"data":…}` | A snapshot covering updates up to S. The relay stores it, and drops what it covers |
| Both | `{"t":"ephemeral","data":…}` | Presence: forwarded to the room, never stored |
| Relay | `{"t":"left","from":id}` | Someone disconnected |

This is a spike, so some things a real relay needs are missing. It accepts any origin, and has no write tokens, quotas or rate limits. See the write-up for what the real one needs.
