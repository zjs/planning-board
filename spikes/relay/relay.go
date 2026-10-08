// Package main is a spike of the M2 relay (docs/sprint-9.md, deliverable 3).
//
// The relay never sees plan content. Clients encrypt every message with a
// key that stays in the link's fragment, and the relay handles opaque
// strings:
//
//   - it gives each update the room's next sequence number, appends it to the
//     room's log on disk, and forwards it to everyone else in the room;
//   - a client that reconnects says the last number it saw ("hello"), and
//     gets everything after it: the latest snapshot if it's behind that, then
//     the log;
//   - any client may upload a snapshot covering the log up to some number,
//     made and encrypted by the client, and the relay drops what it covers;
//   - presence ("ephemeral") is forwarded and never stored.
//
// There is no Yjs code here and no keys, by design.
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// Message is every frame on the wire, in both directions. Data is always
// ciphertext (base64), which the relay stores and forwards as given.
type Message struct {
	T     string `json:"t"`
	Seq   int64  `json:"seq,omitempty"`
	After int64  `json:"after,omitempty"`
	Upto  int64  `json:"upto,omitempty"`
	Head  int64  `json:"head,omitempty"`
	Ref   string `json:"ref,omitempty"`
	From  string `json:"from,omitempty"`
	Data  string `json:"data,omitempty"`
}

type entry struct {
	Seq  int64  `json:"seq"`
	Data string `json:"data"`
}

type snapshot struct {
	Upto int64  `json:"upto"`
	Data string `json:"data"`
}

// Room is one shared plan (one scenario, per ADR 0003).
type Room struct {
	mu       sync.Mutex
	id       string
	dir      string
	head     int64
	snapshot snapshot
	log      []entry
	logFile  *os.File
	peers    map[*peer]struct{}
}

type peer struct {
	id   string
	send chan Message
}

// Relay holds the open rooms.
type Relay struct {
	mu      sync.Mutex
	dataDir string
	rooms   map[string]*Room
	nextID  int64
}

// A room ID is random and long, made by the client that shares the plan.
var roomID = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)

// MaxMessage bounds one frame: a snapshot of a plan of a few hundred cards
// is well under this (relay-and-sync.md).
const MaxMessage = 8 << 20

// NewRelay keeps rooms under dataDir, one directory each.
func NewRelay(dataDir string) *Relay {
	return &Relay{dataDir: dataDir, rooms: map[string]*Room{}}
}

func (r *Relay) room(id string) (*Room, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if room, ok := r.rooms[id]; ok {
		return room, nil
	}
	room, err := openRoom(filepath.Join(r.dataDir, id), id)
	if err != nil {
		return nil, err
	}
	r.rooms[id] = room
	return room, nil
}

// openRoom loads a room's snapshot and log from disk, or starts an empty one.
func openRoom(dir, id string) (*Room, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	room := &Room{id: id, dir: dir, peers: map[*peer]struct{}{}}
	if b, err := os.ReadFile(filepath.Join(dir, "snapshot.json")); err == nil {
		if err := json.Unmarshal(b, &room.snapshot); err != nil {
			return nil, fmt.Errorf("room %s: snapshot: %w", id, err)
		}
		room.head = room.snapshot.Upto
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if f, err := os.Open(filepath.Join(dir, "log.jsonl")); err == nil {
		scanner := bufio.NewScanner(f)
		scanner.Buffer(make([]byte, 0, 64<<10), MaxMessage*2)
		for scanner.Scan() {
			var e entry
			if err := json.Unmarshal(scanner.Bytes(), &e); err != nil {
				// A torn last line after a crash: keep what was whole.
				break
			}
			if e.Seq > room.snapshot.Upto {
				room.log = append(room.log, e)
			}
			if e.Seq > room.head {
				room.head = e.Seq
			}
		}
		f.Close()
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	f, err := os.OpenFile(filepath.Join(dir, "log.jsonl"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	room.logFile = f
	return room, nil
}

// append gives data the next sequence number and makes it durable. Call with mu held.
func (room *Room) append(data string) (int64, error) {
	e := entry{Seq: room.head + 1, Data: data}
	line, _ := json.Marshal(e)
	if _, err := room.logFile.Write(append(line, '\n')); err != nil {
		return 0, err
	}
	if err := room.logFile.Sync(); err != nil {
		return 0, err
	}
	room.head = e.Seq
	room.log = append(room.log, e)
	return e.Seq, nil
}

// compact stores a client's snapshot and drops the log entries it covers. Call with mu held.
func (room *Room) compact(s snapshot) error {
	if s.Upto <= room.snapshot.Upto || s.Upto > room.head {
		return nil
	}
	b, _ := json.Marshal(s)
	tmp := filepath.Join(room.dir, "snapshot.json.tmp")
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, filepath.Join(room.dir, "snapshot.json")); err != nil {
		return err
	}
	room.snapshot = s
	kept := room.log[:0]
	for _, e := range room.log {
		if e.Seq > s.Upto {
			kept = append(kept, e)
		}
	}
	room.log = kept
	// Rewrite the log with only what the snapshot doesn't cover.
	tmpLog := filepath.Join(room.dir, "log.jsonl.tmp")
	f, err := os.Create(tmpLog)
	if err != nil {
		return err
	}
	w := bufio.NewWriter(f)
	for _, e := range room.log {
		line, _ := json.Marshal(e)
		w.Write(append(line, '\n'))
	}
	if err := w.Flush(); err != nil {
		f.Close()
		return err
	}
	f.Close()
	room.logFile.Close()
	if err := os.Rename(tmpLog, filepath.Join(room.dir, "log.jsonl")); err != nil {
		return err
	}
	room.logFile, err = os.OpenFile(filepath.Join(room.dir, "log.jsonl"), os.O_APPEND|os.O_WRONLY, 0o600)
	return err
}

// broadcast queues m for every peer but `except`. Call with mu held, so peers see updates in sequence order.
func (room *Room) broadcast(m Message, except *peer) {
	for p := range room.peers {
		if p == except {
			continue
		}
		select {
		case p.send <- m:
		default:
			// A peer that can't keep up is dropped; it catches up from the log when it reconnects.
			close(p.send)
			delete(room.peers, p)
		}
	}
}

// ServeHTTP handles /rooms/{id} as a WebSocket.
func (r *Relay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	id := req.PathValue("id")
	if !roomID.MatchString(id) {
		http.Error(w, "bad room id", http.StatusBadRequest)
		return
	}
	room, err := r.room(id)
	if err != nil {
		log.Printf("room %s: %v", id, err)
		http.Error(w, "room unavailable", http.StatusInternalServerError)
		return
	}
	conn, err := websocket.Accept(w, req, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	conn.SetReadLimit(MaxMessage)
	r.mu.Lock()
	r.nextID++
	p := &peer{id: fmt.Sprintf("p%d", r.nextID), send: make(chan Message, 1024)}
	r.mu.Unlock()

	ctx, cancel := context.WithCancel(req.Context())
	defer cancel()
	go func() {
		defer cancel()
		for m := range p.send {
			b, _ := json.Marshal(m)
			wctx, done := context.WithTimeout(ctx, 10*time.Second)
			err := conn.Write(wctx, websocket.MessageText, b)
			done()
			if err != nil {
				return
			}
		}
	}()

	room.mu.Lock()
	room.peers[p] = struct{}{}
	room.mu.Unlock()
	defer func() {
		room.mu.Lock()
		if _, ok := room.peers[p]; ok {
			delete(room.peers, p)
			close(p.send)
		}
		room.broadcast(Message{T: "left", From: p.id}, nil)
		room.mu.Unlock()
		conn.CloseNow()
	}()

	for {
		_, b, err := conn.Read(ctx)
		if err != nil {
			return
		}
		var m Message
		if err := json.Unmarshal(b, &m); err != nil {
			return
		}
		if !r.handle(room, p, m) {
			return
		}
	}
}

// handle applies one client message. It returns false to close the connection.
func (r *Relay) handle(room *Room, p *peer, m Message) bool {
	room.mu.Lock()
	defer room.mu.Unlock()
	if _, ok := room.peers[p]; !ok {
		return false
	}
	send := func(out Message) bool {
		select {
		case p.send <- out:
			return true
		default:
			return false
		}
	}
	switch m.T {
	case "hello":
		// Everything after `after`: the snapshot if the client is behind it, then the log.
		after := m.After
		if after < room.snapshot.Upto && room.snapshot.Data != "" {
			if !send(Message{T: "snapshot", Upto: room.snapshot.Upto, Data: room.snapshot.Data}) {
				return false
			}
			after = room.snapshot.Upto
		}
		for _, e := range room.log {
			if e.Seq > after && !send(Message{T: "update", Seq: e.Seq, Data: e.Data}) {
				return false
			}
		}
		return send(Message{T: "synced", Head: room.head, Upto: room.snapshot.Upto, From: p.id})
	case "update":
		seq, err := room.append(m.Data)
		if err != nil {
			log.Printf("room %s: append: %v", room.id, err)
			return false
		}
		room.broadcast(Message{T: "update", Seq: seq, Data: m.Data}, p)
		return send(Message{T: "ack", Seq: seq, Ref: m.Ref})
	case "snapshot":
		if err := room.compact(snapshot{Upto: m.Upto, Data: m.Data}); err != nil {
			log.Printf("room %s: compact: %v", room.id, err)
		}
		return true
	case "ephemeral":
		room.broadcast(Message{T: "ephemeral", From: p.id, Data: m.Data}, p)
		return true
	}
	return true
}
