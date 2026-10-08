package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

const room = "testroom_0123456789abcdef"

func serve(t *testing.T, dir string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle("GET /rooms/{id}", NewRelay(dir))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

type client struct {
	t    *testing.T
	conn *websocket.Conn
}

func dial(t *testing.T, srv *httptest.Server) *client {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+"/rooms/"+room, nil)
	if err != nil {
		t.Fatal(err)
	}
	conn.SetReadLimit(MaxMessage)
	t.Cleanup(func() { conn.CloseNow() })
	return &client{t: t, conn: conn}
}

func (c *client) send(m Message) {
	b, _ := json.Marshal(m)
	if err := c.conn.Write(context.Background(), websocket.MessageText, b); err != nil {
		c.t.Fatal(err)
	}
}

func (c *client) recv() Message {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, b, err := c.conn.Read(ctx)
	if err != nil {
		c.t.Fatal(err)
	}
	var m Message
	json.Unmarshal(b, &m)
	return m
}

// hello catches up and returns what arrived before "synced".
func (c *client) hello(after int64) (got []Message, synced Message) {
	c.send(Message{T: "hello", After: after})
	for {
		m := c.recv()
		if m.T == "synced" {
			return got, m
		}
		got = append(got, m)
	}
}

func TestUpdatesAreNumberedForwardedAndReplayed(t *testing.T) {
	srv := serve(t, t.TempDir())
	a, b := dial(t, srv), dial(t, srv)
	a.hello(0)
	b.hello(0)

	a.send(Message{T: "update", Ref: "r1", Data: "ciphertext-1"})
	if ack := a.recv(); ack.T != "ack" || ack.Seq != 1 || ack.Ref != "r1" {
		t.Fatalf("ack = %+v", ack)
	}
	if got := b.recv(); got.T != "update" || got.Seq != 1 || got.Data != "ciphertext-1" {
		t.Fatalf("forwarded = %+v", got)
	}
	a.send(Message{T: "update", Ref: "r2", Data: "ciphertext-2"})
	a.recv()
	b.recv()

	c := dial(t, srv)
	got, synced := c.hello(1)
	if len(got) != 1 || got[0].Seq != 2 || synced.Head != 2 {
		t.Fatalf("resume after 1: %+v, %+v", got, synced)
	}
}

func TestSnapshotsCompactTheLog(t *testing.T) {
	dir := t.TempDir()
	srv := serve(t, dir)
	a := dial(t, srv)
	a.hello(0)
	for i := 0; i < 5; i++ {
		a.send(Message{T: "update", Data: "u"})
		a.recv()
	}
	a.send(Message{T: "snapshot", Upto: 4, Data: "snap-to-4"})
	// Messages on one connection are handled in order, so once this is acked the snapshot is stored.
	a.send(Message{T: "update", Data: "u"})
	a.recv()
	b := dial(t, srv)
	got, synced := b.hello(0)
	if len(got) != 3 || got[0].T != "snapshot" || got[0].Upto != 4 || got[1].Seq != 5 || got[2].Seq != 6 || synced.Upto != 4 {
		t.Fatalf("after compaction: %+v %+v", got, synced)
	}
	log, _ := os.ReadFile(filepath.Join(dir, room, "log.jsonl"))
	if strings.Count(string(log), "\n") != 2 {
		t.Fatalf("log still holds %q", log)
	}
}

func TestRoomsSurviveARestart(t *testing.T) {
	dir := t.TempDir()
	first := serve(t, dir)
	a := dial(t, first)
	a.hello(0)
	a.send(Message{T: "update", Data: "kept"})
	a.recv()
	first.Close()

	second := serve(t, dir)
	b := dial(t, second)
	got, synced := b.hello(0)
	if len(got) != 1 || got[0].Data != "kept" || synced.Head != 1 {
		t.Fatalf("after restart: %+v %+v", got, synced)
	}
	b.send(Message{T: "update", Data: "next"})
	if ack := b.recv(); ack.Seq != 2 {
		t.Fatalf("numbering after restart: %+v", ack)
	}
}

func TestPresenceIsForwardedButNeverStored(t *testing.T) {
	dir := t.TempDir()
	srv := serve(t, dir)
	a, b := dial(t, srv), dial(t, srv)
	a.hello(0)
	b.hello(0)
	a.send(Message{T: "ephemeral", Data: "cursor"})
	if got := b.recv(); got.T != "ephemeral" || got.Data != "cursor" || got.From == "" {
		t.Fatalf("presence = %+v", got)
	}
	log, _ := os.ReadFile(filepath.Join(dir, room, "log.jsonl"))
	if len(log) != 0 {
		t.Fatalf("presence was stored: %q", log)
	}
	a.conn.Close(websocket.StatusNormalClosure, "")
	if got := b.recv(); got.T != "left" {
		t.Fatalf("leaving = %+v", got)
	}
}

func TestRejectsBadRoomIDs(t *testing.T) {
	srv := serve(t, t.TempDir())
	res, err := http.Get(srv.URL + "/rooms/..%2F..%2Fetc")
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status %d", res.StatusCode)
	}
}
