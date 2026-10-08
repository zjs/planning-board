package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
)

const room = "testroom_0123456789abcdef"

var token = []byte("write-token-for-the-test-room-01")

// clock is a relay clock tests can move.
type clock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *clock) Add(d time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(d)
	c.mu.Unlock()
}

func testConfig(t *testing.T, dir string) (Config, *clock) {
	t.Helper()
	c := &clock{now: time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)}
	cfg := DefaultConfig(dir)
	cfg.Now = c.Now
	cfg.ConnectionsPerMinute = 0
	cfg.RoomsPerHour = 0
	cfg.UpdatesPerSecond = 0
	cfg.PresencePerSecond = 0
	return cfg, c
}

func serve(t *testing.T, cfg Config) *httptest.Server {
	t.Helper()
	relay, err := NewRelay(cfg)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("GET /rooms/{id}", relay)
	mux.HandleFunc("GET /config", serveConfig("", false))
	mux.HandleFunc("GET /", serveApp(""))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

type client struct {
	t    *testing.T
	conn *websocket.Conn
}

func dialRoom(t *testing.T, srv *httptest.Server, id string, header http.Header) (*client, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+"/rooms/"+id, &websocket.DialOptions{HTTPHeader: header})
	if err != nil {
		return nil, err
	}
	conn.SetReadLimit(64 << 20)
	t.Cleanup(func() { conn.CloseNow() })
	return &client{t: t, conn: conn}, nil
}

func dial(t *testing.T, srv *httptest.Server) *client {
	t.Helper()
	c, err := dialRoom(t, srv, room, nil)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func (c *client) send(frame []byte) {
	c.t.Helper()
	if err := c.conn.Write(context.Background(), websocket.MessageBinary, frame); err != nil {
		c.t.Fatal(err)
	}
}

func (c *client) recv() (byte, *Reader) {
	c.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, b, err := c.conn.Read(ctx)
	if err != nil {
		c.t.Fatalf("read: %v", err)
	}
	return NewReader(b)
}

// hello sends a hello and returns what arrived before "synced", and synced's fields.
type synced struct {
	head, upto uint64
	epoch      []byte
	self       uint64
	canWrite   bool
	retired    bool
}

type got struct {
	kind byte
	seq  uint64
	at   uint64
	data string
}

func (c *client) hello(tok []byte, after, flags uint64) ([]got, synced) {
	c.t.Helper()
	c.send(NewFrame(FrameHello).Uint(ProtocolVersion).Bytes(tok).Uint(after).Uint(flags).Done())
	var out []got
	for {
		kind, r := c.recv()
		switch kind {
		case FrameSynced:
			s := synced{head: r.Uint(), upto: r.Uint(), epoch: r.Bytes(), self: r.Uint(), canWrite: r.Uint() == 1, retired: r.Uint() == 1}
			return out, s
		case FrameSnapshotOut, FrameUpdateOut:
			seq, at, data := r.Uint(), r.Uint(), r.Bytes()
			out = append(out, got{kind, seq, at, string(data)})
		case FrameError:
			c.t.Fatalf("error %d: %s", r.Uint(), r.Bytes())
		default:
			c.t.Fatalf("unexpected frame %x before synced", kind)
		}
	}
}

// helloError sends a hello the relay should refuse, and returns the code.
func (c *client) helloError(tok []byte, flags uint64) uint64 {
	c.t.Helper()
	c.send(NewFrame(FrameHello).Uint(ProtocolVersion).Bytes(tok).Uint(0).Uint(flags).Done())
	return c.expectError()
}

// expectError reads frames until an error frame, and returns its code.
func (c *client) expectError() uint64 {
	c.t.Helper()
	for {
		kind, r := c.recv()
		if kind == FrameError {
			return r.Uint()
		}
	}
}

func (c *client) update(ref uint64, data string) {
	c.send(NewFrame(FrameUpdate).Uint(ref).Bytes([]byte(data)).Done())
}

func (c *client) ack() (ref, seq, at uint64) {
	c.t.Helper()
	kind, r := c.recv()
	if kind != FrameAck {
		c.t.Fatalf("expected ack, got %x", kind)
	}
	return r.Uint(), r.Uint(), r.Uint()
}

func TestRoomsAreMadeExplicitlyAndUpdatesNumberedForwardedAndReplayed(t *testing.T) {
	cfg, clk := testConfig(t, t.TempDir())
	srv := serve(t, cfg)
	a := dial(t, srv)
	_, s := a.hello(token, 0, HelloCreate)
	if s.head != 0 || !s.canWrite || len(s.epoch) != 16 {
		t.Fatalf("new room: %+v", s)
	}
	b := dial(t, srv)
	b.hello(token, 0, 0)

	a.update(7, "cipher-1")
	ref, seq, at := a.ack()
	if ref != 7 || seq != 1 || at != uint64(clk.Now().UnixMilli()) {
		t.Fatalf("ack: ref %d seq %d at %d", ref, seq, at)
	}
	kind, r := b.recv()
	if kind != FrameUpdateOut || r.Uint() != 1 || r.Uint() != uint64(clk.Now().UnixMilli()) || string(r.Bytes()) != "cipher-1" {
		t.Fatal("b didn't get update 1 with its receive time")
	}
	clk.Add(time.Minute)
	b.update(1, "cipher-2")
	b.ack()

	c := dial(t, srv)
	updates, s := c.hello(nil, 1, 0)
	if len(updates) != 1 || updates[0].seq != 2 || updates[0].data != "cipher-2" || s.head != 2 || s.canWrite {
		t.Fatalf("catch-up after 1: %+v %+v", updates, s)
	}
}

func TestAnUnknownRoomIsNeverMadeByAccident(t *testing.T) {
	dir := t.TempDir()
	cfg, _ := testConfig(t, dir)
	srv := serve(t, cfg)
	c := dial(t, srv)
	c.send(NewFrame(FrameHello).Uint(ProtocolVersion).Bytes(token).Uint(0).Uint(0).Done())
	if code := c.expectError(); code != ErrUnknownRoom {
		t.Fatalf("code %d", code)
	}
	// Asking to create without a token isn't enough either.
	c = dial(t, srv)
	c.send(NewFrame(FrameHello).Uint(ProtocolVersion).Bytes(nil).Uint(0).Uint(HelloCreate).Done())
	if code := c.expectError(); code != ErrUnknownRoom {
		t.Fatalf("code %d", code)
	}
	if _, err := os.Stat(filepath.Join(dir, room)); !os.IsNotExist(err) {
		t.Fatal("a directory was made for a room nobody created")
	}
}

func TestCreatingAgainWithTheSameTokenIsHarmlessButAnotherTokenCantTakeTheRoom(t *testing.T) {
	cfg, _ := testConfig(t, t.TempDir())
	srv := serve(t, cfg)
	a := dial(t, srv)
	_, first := a.hello(token, 0, HelloCreate)
	again := dial(t, srv)
	_, second := again.hello(token, 0, HelloCreate)
	if !bytes.Equal(first.epoch, second.epoch) || !second.canWrite {
		t.Fatal("a repeated create made a new room")
	}
	thief := dial(t, srv)
	thief.send(NewFrame(FrameHello).Uint(ProtocolVersion).Bytes([]byte("someone-else")).Uint(0).Uint(HelloCreate).Done())
	if code := thief.expectError(); code != ErrRoomTaken {
		t.Fatalf("code %d", code)
	}
}

func TestAViewOnlyConnectionReadsButCantWrite(t *testing.T) {
	cfg, _ := testConfig(t, t.TempDir())
	srv := serve(t, cfg)
	writer := dial(t, srv)
	writer.hello(token, 0, HelloCreate)
	viewer := dial(t, srv)
	_, s := viewer.hello(nil, 0, 0)
	if s.canWrite {
		t.Fatal("a connection without the token was told it can write")
	}
	viewer.update(3, "forged")
	kind, r := viewer.recv()
	if kind != FrameError || r.Uint() != ErrReadOnly {
		t.Fatal("a view-only update wasn't refused")
	}
	r.Bytes()
	if r.Uint() != 3 {
		t.Fatal("the refusal didn't name the update")
	}
	viewer.send(NewFrame(FrameSnapshot).Uint(0).Bytes([]byte("forged")).Done())
	if code := viewer.expectError(); code != ErrReadOnly {
		t.Fatalf("snapshot: code %d", code)
	}
	// A wrong token is the same as none.
	wrong := dial(t, srv)
	_, s = wrong.hello([]byte("not-the-token"), 0, 0)
	if s.canWrite {
		t.Fatal("a wrong token can write")
	}
	// The viewer still hears the writer.
	writer.update(1, "real")
	writer.ack()
	kind, r = viewer.recv()
	if kind != FrameUpdateOut || r.Uint() != 1 {
		t.Fatal("the viewer didn't get the writer's update")
	}
}

func TestSnapshotsCompactTheLogAndKeepWhatTheyReplaceForAReplay(t *testing.T) {
	dir := t.TempDir()
	cfg, clk := testConfig(t, dir)
	srv := serve(t, cfg)
	a := dial(t, srv)
	a.hello(token, 0, HelloCreate)
	for i := 1; i <= 5; i++ {
		a.update(uint64(i), strings.Repeat("u", i))
		a.ack()
	}
	a.send(NewFrame(FrameSnapshot).Uint(3).Bytes([]byte("snap-3")).Done())

	b := dial(t, srv)
	got, s := b.hello(token, 0, 0)
	if len(got) != 3 || got[0].kind != FrameSnapshotOut || got[0].seq != 3 || got[0].data != "snap-3" || got[1].seq != 4 || got[2].seq != 5 || s.upto != 3 {
		t.Fatalf("after a snapshot: %+v %+v", got, s)
	}
	segments, _ := filepath.Glob(filepath.Join(dir, room, "segments", "*.jsonl"))
	if len(segments) != 1 {
		t.Fatalf("segments: %v", segments)
	}

	// A client that can't read the snapshot asks for everything instead.
	c := dial(t, srv)
	got, _ = c.hello(token, 0, HelloReplay)
	if len(got) != 5 || got[0].kind != FrameUpdateOut || got[0].seq != 1 || got[4].seq != 5 {
		t.Fatalf("replay: %+v", got)
	}

	// After 30 days, the segment goes.
	old := clk.Now().Add(-SegmentRetention - time.Hour)
	os.Chtimes(segments[0], old, old)
	clk.Add(time.Minute)
	a.update(6, "u6")
	a.ack()
	a.send(NewFrame(FrameSnapshot).Uint(6).Bytes([]byte("snap-6")).Done())
	d := dial(t, srv)
	d.hello(token, 6, 0) // a round trip, so the snapshot has been handled
	if _, err := os.Stat(segments[0]); !os.IsNotExist(err) {
		t.Fatal("a segment older than 30 days was kept")
	}
}

func TestRoomsSurviveARestartWithTheirEpoch(t *testing.T) {
	dir := t.TempDir()
	cfg, _ := testConfig(t, dir)
	srv := serve(t, cfg)
	a := dial(t, srv)
	_, before := a.hello(token, 0, HelloCreate)
	a.update(1, "one")
	a.ack()
	a.update(2, "two")
	a.ack()
	srv.Close()

	// A torn last line, as if the relay died mid-write, is dropped.
	f, _ := os.OpenFile(filepath.Join(dir, room, "log.jsonl"), os.O_APPEND|os.O_WRONLY, 0)
	f.WriteString(`{"seq":3,"at":1,"da`)
	f.Close()

	srv = serve(t, cfg)
	b := dial(t, srv)
	got, after := b.hello(token, 0, 0)
	if len(got) != 2 || after.head != 2 || !bytes.Equal(before.epoch, after.epoch) {
		t.Fatalf("after a restart: %+v %+v", got, after)
	}
}

func TestRetiredRoomsCanBeReadButNotChanged(t *testing.T) {
	dir := t.TempDir()
	cfg, _ := testConfig(t, dir)
	srv := serve(t, cfg)
	a := dial(t, srv)
	a.hello(token, 0, HelloCreate)
	a.update(1, "one")
	a.ack()
	viewer := dial(t, srv)
	viewer.hello(nil, 0, 0)

	// Retiring takes the write token: a view link can't.
	if code := dial(t, srv).helloError(nil, HelloRetire); code != ErrReadOnly {
		t.Fatalf("retire without the token: %d", code)
	}
	if code := dial(t, srv).helloError([]byte("not-the-token"), HelloRetire); code != ErrReadOnly {
		t.Fatalf("retire with the wrong token: %d", code)
	}

	// Whoever made new links retires the old room once; everyone connected is told.
	b := dial(t, srv)
	_, s := b.hello(token, 0, HelloRetire)
	if !s.retired || !s.canWrite {
		t.Fatalf("retiring connection: %+v", s)
	}
	if code := a.expectError(); code != ErrReplaced {
		t.Fatalf("writer told %d", code)
	}
	if code := viewer.expectError(); code != ErrReplaced {
		t.Fatalf("viewer told %d", code)
	}

	// Writes are refused, with the change's ref; snapshots are ignored.
	a.update(7, "two")
	kind, r := a.recv()
	if code, _, ref := r.Uint(), r.Bytes(), r.Uint(); kind != FrameError || code != ErrReplaced || ref != 7 {
		t.Fatalf("update to a retired room: %x %d ref %d", kind, code, ref)
	}
	a.send(NewFrame(FrameSnapshot).Uint(1).Bytes([]byte("snap")).Done())
	// Presence isn't forwarded: the viewer gets the next thing sent, not the presence.
	a.send(NewFrame(FrameEphemeral).Bytes([]byte("here")).Done())
	b.send(NewFrame(FrameEphemeral).Bytes([]byte("also here")).Done())
	a.update(8, "three")
	if kind, r := a.recv(); kind != FrameError || r.Uint() != ErrReplaced {
		t.Fatal("a second update wasn't refused")
	}
	a.conn.Close(websocket.StatusNormalClosure, "")
	if kind, _ := viewer.recv(); kind != FrameLeft {
		t.Fatalf("viewer got %x, not the writer leaving", kind)
	}

	// After a restart, the room is still retired, still readable, and creating it again doesn't revive it.
	srv.Close()
	srv = serve(t, cfg)
	got, s := dial(t, srv).hello(token, 0, HelloCreate)
	if len(got) != 1 || got[0].data != "one" || !s.retired || s.head != 1 {
		t.Fatalf("after a restart: %+v %+v", got, s)
	}
}

func TestARestoredRelayGivesEveryRoomANewEpoch(t *testing.T) {
	dir := t.TempDir()
	cfg, _ := testConfig(t, dir)
	srv := serve(t, cfg)
	a := dial(t, srv)
	_, before := a.hello(token, 0, HelloCreate)
	a.update(1, "one")
	a.ack()
	srv.Close()

	cfg.Restored = true
	srv = serve(t, cfg)
	got, after := dial(t, srv).hello(token, 0, 0)
	if bytes.Equal(before.epoch, after.epoch) || len(got) != 1 || after.head != 1 {
		t.Fatalf("after a restore: %+v %+v", got, after)
	}
}

func TestASprint11DataFolderStillOpens(t *testing.T) {
	// testdata/sprint-11-data was written by sprint 11's relay: a room with a snapshot, a log, and a kept segment.
	dir := t.TempDir()
	if err := os.CopyFS(dir, os.DirFS(filepath.Join("testdata", "sprint-11-data"))); err != nil {
		t.Fatal(err)
	}
	cfg, _ := testConfig(t, dir)
	srv := serve(t, cfg)
	c := dial(t, srv)
	got, s := c.hello(token, 0, 0)
	if len(got) != 2 || got[0].kind != FrameSnapshotOut || got[0].data != "snapshot-to-2" || got[1].data != "three" {
		t.Fatalf("caught up with %+v", got)
	}
	if s.head != 3 || s.upto != 2 || !s.canWrite || s.retired {
		t.Fatalf("synced %+v", s)
	}
	all, _ := dial(t, srv).hello(nil, 0, HelloReplay)
	if len(all) != 3 || all[0].data != "one" || all[2].data != "three" {
		t.Fatalf("replay %+v", all)
	}
	c.update(1, "four")
	if _, seq, _ := c.ack(); seq != 4 {
		t.Fatalf("next seq %d", seq)
	}
}

func TestPresenceIsForwardedButNeverStored(t *testing.T) {
	dir := t.TempDir()
	cfg, _ := testConfig(t, dir)
	srv := serve(t, cfg)
	a := dial(t, srv)
	_, sa := a.hello(token, 0, HelloCreate)
	b := dial(t, srv)
	b.hello(nil, 0, 0) // a viewer's presence is forwarded too
	b.send(NewFrame(FrameEphemeral).Bytes([]byte("pointer-secret")).Done())
	kind, r := a.recv()
	if kind != FrameEphemeralOut || r.Uint() == sa.self || string(r.Bytes()) != "pointer-secret" {
		t.Fatal("presence wasn't forwarded with its sender")
	}
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			if b, _ := os.ReadFile(path); bytes.Contains(b, []byte("pointer-secret")) || bytes.Contains(b, []byte("cG9pbnRlci1zZWNyZXQ")) {
				t.Errorf("presence stored in %s", path)
			}
		}
		return nil
	})
	b.conn.Close(websocket.StatusNormalClosure, "")
	kind, _ = a.recv()
	if kind != FrameLeft {
		t.Fatal("no left frame")
	}
}

func TestRelayRefusesOtherProtocolVersions(t *testing.T) {
	cfg, _ := testConfig(t, t.TempDir())
	srv := serve(t, cfg)
	for version, want := range map[uint64]uint64{ProtocolVersion + 1: ErrOutdatedRelay, 0: ErrOutdatedClient} {
		c := dial(t, srv)
		c.send(NewFrame(FrameHello).Uint(version).Bytes(token).Uint(0).Uint(HelloCreate).Done())
		if code := c.expectError(); code != want {
			t.Errorf("version %d: code %d, want %d", version, code, want)
		}
	}
	c := dial(t, srv)
	c.update(1, "before hello")
	if code := c.expectError(); code != ErrHelloFirst {
		t.Errorf("update before hello: code %d", code)
	}
}

func TestLimits(t *testing.T) {
	t.Run("a room at its size", func(t *testing.T) {
		cfg, _ := testConfig(t, t.TempDir())
		cfg.MaxRoom = 10
		srv := serve(t, cfg)
		a := dial(t, srv)
		a.hello(token, 0, HelloCreate)
		a.update(1, "123456")
		a.ack()
		a.update(2, "123456")
		if code := a.expectError(); code != ErrRoomFull {
			t.Fatalf("code %d", code)
		}
	})
	t.Run("the relay at its total", func(t *testing.T) {
		cfg, _ := testConfig(t, t.TempDir())
		cfg.MaxData = 10
		srv := serve(t, cfg)
		a := dial(t, srv)
		a.hello(token, 0, HelloCreate)
		a.update(1, "123456")
		a.ack()
		a.update(2, "123456")
		if code := a.expectError(); code != ErrRelayFull {
			t.Fatalf("code %d", code)
		}
	})
	t.Run("the number of rooms", func(t *testing.T) {
		cfg, _ := testConfig(t, t.TempDir())
		cfg.MaxRooms = 1
		srv := serve(t, cfg)
		dial(t, srv).hello(token, 0, HelloCreate)
		c, _ := dialRoom(t, srv, "anotherroom_0123456789", nil)
		c.send(NewFrame(FrameHello).Uint(ProtocolVersion).Bytes(token).Uint(0).Uint(HelloCreate).Done())
		if code := c.expectError(); code != ErrRelayFull {
			t.Fatalf("code %d", code)
		}
	})
	t.Run("a message over the limit", func(t *testing.T) {
		cfg, _ := testConfig(t, t.TempDir())
		cfg.MaxMessage = 100
		srv := serve(t, cfg)
		a := dial(t, srv)
		a.hello(token, 0, HelloCreate)
		a.update(1, strings.Repeat("x", 200))
		if code := a.expectError(); code != ErrTooLarge {
			t.Fatalf("code %d", code)
		}
	})
	t.Run("updates faster than the rate", func(t *testing.T) {
		cfg, _ := testConfig(t, t.TempDir())
		cfg.UpdatesPerSecond = 1 // a burst of 4, then one a second; the test clock doesn't move
		srv := serve(t, cfg)
		a := dial(t, srv)
		a.hello(token, 0, HelloCreate)
		for i := 1; i <= 4; i++ {
			a.update(uint64(i), "x")
			a.ack()
		}
		a.update(5, "x")
		if code := a.expectError(); code != ErrRateLimited {
			t.Fatalf("code %d", code)
		}
	})
	t.Run("presence has its own rate, and never uses up changes", func(t *testing.T) {
		cfg, _ := testConfig(t, t.TempDir())
		cfg.UpdatesPerSecond = 1  // a burst of 4
		cfg.PresencePerSecond = 1 // a burst of 2; the test clock doesn't move
		srv := serve(t, cfg)
		a := dial(t, srv)
		a.hello(token, 0, HelloCreate)
		b := dial(t, srv)
		b.hello(token, 0, 0)
		for i := 0; i < 5; i++ {
			a.send(NewFrame(FrameEphemeral).Bytes([]byte{byte('0' + i)}).Done())
		}
		// Changes still go through after a burst of presence, and only the first two presence messages arrived.
		a.update(1, "x")
		a.ack()
		var forwarded []string
		for {
			kind, r := b.recv()
			if kind == FrameUpdateOut {
				break
			}
			if kind == FrameEphemeralOut {
				r.Uint()
				forwarded = append(forwarded, string(r.Bytes()))
			}
		}
		if strings.Join(forwarded, ",") != "0,1" {
			t.Fatalf("forwarded %v", forwarded)
		}
	})
	t.Run("presence over its size is dropped quietly", func(t *testing.T) {
		cfg, _ := testConfig(t, t.TempDir())
		cfg.MaxPresence = 8
		srv := serve(t, cfg)
		a := dial(t, srv)
		a.hello(token, 0, HelloCreate)
		b := dial(t, srv)
		b.hello(token, 0, 0)
		a.send(NewFrame(FrameEphemeral).Bytes([]byte("much too long")).Done())
		a.send(NewFrame(FrameEphemeral).Bytes([]byte("short")).Done())
		kind, r := b.recv()
		r.Uint()
		if kind != FrameEphemeralOut || string(r.Bytes()) != "short" {
			t.Fatal("the long presence message wasn't dropped, or the short one didn't arrive")
		}
	})
	t.Run("new rooms from one address", func(t *testing.T) {
		cfg, _ := testConfig(t, t.TempDir())
		cfg.RoomsPerHour = 1
		srv := serve(t, cfg)
		dial(t, srv).hello(token, 0, HelloCreate)
		c, _ := dialRoom(t, srv, "anotherroom_0123456789", nil)
		c.send(NewFrame(FrameHello).Uint(ProtocolVersion).Bytes(token).Uint(0).Uint(HelloCreate).Done())
		if code := c.expectError(); code != ErrRateLimited {
			t.Fatalf("code %d", code)
		}
	})
	t.Run("totals are counted from disk at start-up", func(t *testing.T) {
		dir := t.TempDir()
		cfg, _ := testConfig(t, dir)
		srv := serve(t, cfg)
		a := dial(t, srv)
		a.hello(token, 0, HelloCreate)
		a.update(1, "123456")
		a.ack()
		srv.Close()
		relay, err := NewRelay(cfg)
		if err != nil || relay.total != 6 || len(relay.sizes) != 1 {
			t.Fatalf("total %d, rooms %d, %v", relay.total, len(relay.sizes), err)
		}
	})
}

func TestOrigins(t *testing.T) {
	policy := DefaultConfig("").Origins
	policy.Public = "plans.example.com"
	cases := []struct {
		origin, host string
		want         bool
	}{
		{"", "relay:8787", true},                                // not a page
		{"null", "relay:8787", true},                            // the app opened from disk
		{"http://192.168.1.23:8787", "192.168.1.23:8787", true}, // the relay's own page
		{"https://plans.example.com", "10.0.0.5:8787", true},    // behind a TLS proxy
		{"https://zjs.github.io", "relay:8787", true},           // the public build
		{"https://evil.example", "relay:8787", false},
	}
	for _, c := range cases {
		req := httptest.NewRequest("GET", "/rooms/"+room, nil)
		req.Host = c.host
		if c.origin != "" {
			req.Header.Set("Origin", c.origin)
		}
		if got := policy.Allowed(req); got != c.want {
			t.Errorf("origin %q on %s: %v", c.origin, c.host, got)
		}
	}
	policy.Null = false
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Origin", "null")
	if policy.Allowed(req) {
		t.Error("file pages allowed when turned off")
	}

	cfg, _ := testConfig(t, t.TempDir())
	srv := serve(t, cfg)
	if _, err := dialRoom(t, srv, room, http.Header{"Origin": {"https://evil.example"}}); err == nil {
		t.Error("a page from another site connected")
	}
}

func TestFramesRoundTripAndShortFramesFail(t *testing.T) {
	f := NewFrame(FrameUpdate).Uint(300).Bytes([]byte("data")).String("").Done()
	kind, r := NewReader(f)
	if kind != FrameUpdate || r.Uint() != 300 || string(r.Bytes()) != "data" || len(r.Bytes()) != 0 || r.Err() != nil {
		t.Fatal("round trip")
	}
	_, r = NewReader(f[:len(f)-3])
	r.Uint()
	r.Bytes()
	if r.Err() == nil {
		t.Fatal("a truncated frame read as whole")
	}
	if _, r := NewReader(nil); r.Err() == nil {
		t.Fatal("an empty frame read")
	}
}

func TestTheRelayServesTheAppAndItsConfig(t *testing.T) {
	cfg, _ := testConfig(t, t.TempDir())
	srv := serve(t, cfg)
	res, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	if res.Header.Get("Cache-Control") != "no-cache" || !strings.HasPrefix(res.Header.Get("Content-Type"), "text/html") {
		t.Fatalf("headers: %v", res.Header)
	}
	res.Body.Close()
	res, err = http.Get(srv.URL + "/config")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var info relayInfo
	json.NewDecoder(res.Body).Decode(&info)
	if info.Protocol != ProtocolVersion || info.PublicURL == "" || res.Header.Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("config: %+v %v", info, res.Header)
	}
	if res, _ := http.Get(srv.URL + "/elsewhere"); res.StatusCode != http.StatusNotFound {
		t.Fatalf("other paths: %d", res.StatusCode)
	}
}
