package main

// The relay (ADR 0017) numbers, stores and forwards encrypted updates. It
// never sees plan content: clients encrypt every message with a key that
// stays in the link's fragment, and the relay handles opaque bytes.
//
//   - A room is made explicitly, by a hello that asks to create it. Its write
//     token's hash is kept, and only connections that present the token can
//     change the room. Anyone who knows the room can read it; reading is
//     useless without the key.
//   - Each update gets the room's next sequence number and the relay's
//     clock, is written to disk, acknowledged, and forwarded to the room.
//   - A client that connects says the last number it saw, and gets
//     everything after it: the latest snapshot if it's behind that, then the
//     log.
//   - A writer may upload a snapshot it made and encrypted; the relay keeps
//     the updates it covers as a segment for 30 days.
//   - Presence ("ephemeral") is forwarded and never stored.
//
// There is no Yjs code here and no keys, by design.

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// Config is how a relay is run. Zero limits mean no limit.
type Config struct {
	DataDir    string
	MaxMessage int64 // bytes in one frame
	MaxRoom    int64 // ciphertext bytes one room may hold
	MaxData    int64 // ciphertext bytes all rooms together may hold
	MaxRooms   int   // rooms the relay keeps
	// UpdatesPerSecond limits each connection's updates and snapshots.
	UpdatesPerSecond float64
	// PresencePerSecond limits each connection's presence, on its own, so a
	// pointer moving never slows down someone's changes (ADR 0019).
	PresencePerSecond float64
	// MaxPresence is the largest presence message forwarded; larger ones are dropped.
	MaxPresence int64
	// ConnectionsPerMinute and RoomsPerHour limit each address.
	ConnectionsPerMinute float64
	RoomsPerHour         float64
	Origins              OriginPolicy
	TrustForwarded       bool
	// Now is the relay's clock, replaceable in tests.
	Now func() time.Time
}

// DefaultConfig is generous, for a relay a company or a pilot runs for
// itself. A public relay sets tighter limits (sprint 14).
func DefaultConfig(dataDir string) Config {
	return Config{
		DataDir:              dataDir,
		MaxMessage:           4 << 20,
		MaxRoom:              200 << 20,
		MaxData:              2 << 30,
		MaxRooms:             1000,
		UpdatesPerSecond:     50,
		PresencePerSecond:    30,
		MaxPresence:          4 << 10,
		ConnectionsPerMinute: 120,
		RoomsPerHour:         60,
		Origins:              OriginPolicy{Null: true, Hosts: []string{"zjs.github.io"}},
		Now:                  time.Now,
	}
}

// A room ID is random and long, made by the client that shares the plan.
var roomID = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)

// Relay holds the rooms that have someone connected, and the totals for
// every room on disk.
type Relay struct {
	cfg         Config
	mu          sync.Mutex
	open        map[string]*Room
	sizes       map[string]int64 // every room on disk
	total       int64
	nextPeer    uint64
	connections *Limiter
	creations   *Limiter
}

type peer struct {
	id   uint64
	send chan []byte
	// limiter is this connection's own, for updates and snapshots; presence has its own.
	limiter  *Limiter
	presence *Limiter
}

// NewRelay keeps rooms under cfg.DataDir, one directory each.
func NewRelay(cfg Config) (*Relay, error) {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if err := os.MkdirAll(cfg.DataDir, 0o700); err != nil {
		return nil, err
	}
	r := &Relay{
		cfg:         cfg,
		open:        map[string]*Room{},
		sizes:       map[string]int64{},
		connections: NewLimiter(cfg.ConnectionsPerMinute, time.Minute, cfg.ConnectionsPerMinute, cfg.Now),
		creations:   NewLimiter(cfg.RoomsPerHour, time.Hour, cfg.RoomsPerHour, cfg.Now),
	}
	dirs, err := os.ReadDir(cfg.DataDir)
	if err != nil {
		return nil, err
	}
	for _, d := range dirs {
		dir := filepath.Join(cfg.DataDir, d.Name())
		if d.IsDir() && roomID.MatchString(d.Name()) && isRoom(dir) {
			size := roomSize(dir)
			r.sizes[d.Name()] = size
			r.total += size
		}
	}
	return r, nil
}

// relayError is a refusal to tell the client about, with its error code.
type relayError struct {
	code uint64
	msg  string
}

func (e *relayError) Error() string { return e.msg }

// acquire opens a room for a connection: an existing one, or, when asked
// with a write token, a new one. Every acquire is paired with a release.
func (r *Relay) acquire(id string, create bool, token []byte, address string) (*Room, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	room, ok := r.open[id]
	if !ok {
		dir := filepath.Join(r.cfg.DataDir, id)
		var err error
		switch {
		case isRoom(dir):
			room, err = loadRoom(dir, id, r.cfg.Now())
		case !create || len(token) == 0:
			return nil, &relayError{ErrUnknownRoom, "There's no shared plan here. It may have been shared through a different relay."}
		case r.cfg.MaxRooms > 0 && len(r.sizes) >= r.cfg.MaxRooms, r.cfg.MaxData > 0 && r.total >= r.cfg.MaxData:
			return nil, &relayError{ErrRelayFull, "This relay is full, so it can't take another shared plan."}
		case !r.creations.Allow(address):
			return nil, &relayError{ErrRateLimited, "Too many plans shared from here at once. Try again in a while."}
		default:
			room, err = createRoom(dir, id, token, r.cfg.Now())
			if err == nil {
				r.sizes[id] = 0
			}
		}
		if err != nil {
			log.Printf("room %s: %v", id, err)
			return nil, &relayError{ErrInternal, "The relay couldn't open this shared plan."}
		}
		r.open[id] = room
	}
	if create && !room.canWrite(token) {
		if room.users == 0 {
			room.close()
			delete(r.open, id)
		}
		return nil, &relayError{ErrRoomTaken, "A shared plan with this name already exists."}
	}
	room.users++
	return room, nil
}

func (r *Relay) release(room *Room) {
	r.mu.Lock()
	defer r.mu.Unlock()
	room.users--
	if room.users == 0 {
		room.close()
		delete(r.open, room.id)
	}
}

// reserve accounts for a room growing by delta bytes, if the relay's total
// allows it. Shrinking always succeeds.
func (r *Relay) reserve(id string, delta int64) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if delta > 0 && r.cfg.MaxData > 0 && r.total+delta > r.cfg.MaxData {
		return false
	}
	r.total += delta
	r.sizes[id] += delta
	return true
}

// ServeHTTP handles /rooms/{id} as a WebSocket.
func (r *Relay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	id := req.PathValue("id")
	if !roomID.MatchString(id) {
		http.Error(w, "bad room id", http.StatusBadRequest)
		return
	}
	if !r.cfg.Origins.Allowed(req) {
		http.Error(w, "this page may not use this relay", http.StatusForbidden)
		return
	}
	address := clientAddress(req, r.cfg.TrustForwarded)
	if !r.connections.Allow(address) {
		http.Error(w, "too many connections", http.StatusTooManyRequests)
		return
	}
	// The origin was checked above, by host, which the library's own check can't do behind a proxy.
	conn, err := websocket.Accept(w, req, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	defer conn.CloseNow()
	if r.cfg.MaxMessage > 0 {
		conn.SetReadLimit(r.cfg.MaxMessage + 1024)
	}
	ctx := req.Context()

	// The first frame must be hello.
	hctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	_, frame, err := conn.Read(hctx)
	cancel()
	if err != nil {
		return
	}
	kind, fields := NewReader(frame)
	version, token, after, flags := fields.Uint(), fields.Bytes(), fields.Uint(), fields.Uint()
	refuse := func(code uint64, msg string) {
		wctx, done := context.WithTimeout(ctx, 5*time.Second)
		conn.Write(wctx, websocket.MessageBinary, errorFrame(code, msg))
		done()
		conn.Close(websocket.StatusPolicyViolation, msg)
	}
	switch {
	case kind != FrameHello || fields.Err() != nil:
		refuse(ErrHelloFirst, "Expected hello.")
		return
	case version > ProtocolVersion:
		refuse(ErrOutdatedRelay, "This relay is out of date for this version of Planning Board. Ask whoever runs it to update it.")
		return
	case version < ProtocolVersion:
		refuse(ErrOutdatedClient, "This version of Planning Board is out of date for this relay. Reload the page, or use a newer build.")
		return
	}
	room, err := r.acquire(id, flags&HelloCreate != 0, token, address)
	if err != nil {
		var re *relayError
		if errors.As(err, &re) {
			refuse(re.code, re.msg)
		}
		return
	}
	defer r.release(room)

	r.mu.Lock()
	r.nextPeer++
	p := &peer{
		id:       r.nextPeer,
		send:     make(chan []byte, 1024),
		limiter:  NewLimiter(r.cfg.UpdatesPerSecond, time.Second, 4*r.cfg.UpdatesPerSecond, r.cfg.Now),
		presence: NewLimiter(r.cfg.PresencePerSecond, time.Second, 2*r.cfg.PresencePerSecond, r.cfg.Now),
	}
	r.mu.Unlock()
	canWrite := room.canWrite(token)

	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		for b := range p.send {
			wctx, done := context.WithTimeout(ctx, 10*time.Second)
			err := conn.Write(wctx, websocket.MessageBinary, b)
			done()
			if err != nil {
				conn.CloseNow()
				return
			}
		}
	}()

	// Catch up and join in one step, so nothing is missed or sent twice.
	if !r.join(room, p, after, flags&HelloReplay != 0, canWrite) {
		close(p.send)
		<-writerDone
		return
	}
	defer func() {
		room.mu.Lock()
		if _, ok := room.peers[p]; ok {
			delete(room.peers, p)
			close(p.send)
		}
		room.broadcast(NewFrame(FrameLeft).Uint(p.id).Done(), nil)
		room.mu.Unlock()
		<-writerDone
	}()

	for {
		_, frame, err := conn.Read(ctx)
		if err != nil {
			return
		}
		if !r.handle(room, p, frame, canWrite) {
			return
		}
	}
}

// join sends a new connection everything after `after`, then "synced", and
// adds it to the room, all under the room's lock.
func (r *Relay) join(room *Room, p *peer, after uint64, replay, canWrite bool) bool {
	room.mu.Lock()
	defer room.mu.Unlock()
	queue := func(b []byte) bool {
		select {
		case p.send <- b:
			return true
		default:
			return false
		}
	}
	updates := room.log
	if replay {
		all, err := room.retained()
		if err != nil {
			log.Printf("room %s: replay: %v", room.id, err)
		} else {
			updates = all
			after = 0
		}
	} else if after < room.snapshot.Upto && len(room.snapshot.Data) > 0 {
		if !queue(NewFrame(FrameSnapshotOut).Uint(room.snapshot.Upto).Uint(uint64(room.snapshot.At)).Bytes(room.snapshot.Data).Done()) {
			return false
		}
		after = room.snapshot.Upto
	}
	for _, e := range updates {
		if e.Seq > after && !queue(updateFrame(e)) {
			return false
		}
	}
	write := uint64(0)
	if canWrite {
		write = 1
	}
	if !queue(NewFrame(FrameSynced).Uint(room.head).Uint(room.snapshot.Upto).Bytes(room.epoch).Uint(p.id).Uint(write).Done()) {
		return false
	}
	room.peers[p] = struct{}{}
	return true
}

func updateFrame(e entry) []byte {
	return NewFrame(FrameUpdateOut).Uint(e.Seq).Uint(uint64(e.At)).Bytes(e.Data).Done()
}

// handle applies one frame from a connection. It returns false to close it.
func (r *Relay) handle(room *Room, p *peer, frame []byte, canWrite bool) bool {
	kind, fields := NewReader(frame)
	room.mu.Lock()
	defer room.mu.Unlock()
	if _, ok := room.peers[p]; !ok {
		return false
	}
	reply := func(b []byte) bool {
		select {
		case p.send <- b:
			return true
		default:
			return false
		}
	}
	tooBig := r.cfg.MaxMessage > 0 && int64(len(frame)) > r.cfg.MaxMessage
	switch kind {
	case FrameUpdate:
		ref, data := fields.Uint(), fields.Bytes()
		switch {
		case fields.Err() != nil:
			return reply(errorFrame(ErrBadFrame, "A change didn't arrive whole."))
		case !canWrite:
			return reply(NewFrame(FrameError).Uint(ErrReadOnly).String("This link can view the plan, not change it.").Uint(ref).Done())
		case tooBig:
			return reply(NewFrame(FrameError).Uint(ErrTooLarge).String("This change is too large for the relay.").Uint(ref).Done())
		case !p.limiter.Allow("updates"):
			return reply(NewFrame(FrameError).Uint(ErrRateLimited).String("Changes are arriving faster than the relay takes them.").Uint(ref).Done())
		case r.cfg.MaxRoom > 0 && room.size+int64(len(data)) > r.cfg.MaxRoom:
			return reply(NewFrame(FrameError).Uint(ErrRoomFull).String("This shared plan is full on the relay.").Uint(ref).Done())
		case !r.reserve(room.id, int64(len(data))):
			return reply(NewFrame(FrameError).Uint(ErrRelayFull).String("The relay is full.").Uint(ref).Done())
		}
		e, err := room.append(data, r.cfg.Now())
		if err != nil {
			r.reserve(room.id, -int64(len(data)))
			log.Printf("room %s: append: %v", room.id, err)
			return reply(NewFrame(FrameError).Uint(ErrInternal).String("The relay couldn't store this change.").Uint(ref).Done())
		}
		room.broadcast(updateFrame(e), p)
		return reply(NewFrame(FrameAck).Uint(ref).Uint(e.Seq).Uint(uint64(e.At)).Done())
	case FrameSnapshot:
		upto, data := fields.Uint(), fields.Bytes()
		switch {
		case fields.Err() != nil:
			return reply(errorFrame(ErrBadFrame, "A snapshot didn't arrive whole."))
		case !canWrite:
			return reply(errorFrame(ErrReadOnly, "This link can view the plan, not change it."))
		case tooBig || (r.cfg.MaxRoom > 0 && int64(len(data)) > r.cfg.MaxRoom):
			return reply(errorFrame(ErrTooLarge, "This snapshot is too large for the relay."))
		case !p.limiter.Allow("updates"):
			return true // a snapshot can always wait for the next one
		}
		delta, err := room.compact(snapshot{Upto: upto, At: r.cfg.Now().UnixMilli(), Data: data}, r.cfg.Now())
		if err != nil {
			log.Printf("room %s: compact: %v", room.id, err)
			return true
		}
		r.reserve(room.id, delta)
		return true
	case FrameEphemeral:
		data := fields.Bytes()
		if fields.Err() != nil || tooBig {
			return reply(errorFrame(ErrBadFrame, "Presence didn't arrive whole."))
		}
		// Presence is a hint, sent again within seconds: over its size or rate, it's dropped quietly.
		if (r.cfg.MaxPresence > 0 && int64(len(data)) > r.cfg.MaxPresence) || !p.presence.Allow("presence") {
			return true
		}
		room.broadcast(NewFrame(FrameEphemeralOut).Uint(p.id).Bytes(data).Done(), p)
		return true
	default:
		return reply(errorFrame(ErrBadFrame, "The relay didn't understand a message."))
	}
}

// broadcast queues b for every peer but `except`. Call with room.mu held,
// so peers see updates in sequence order. A peer that can't keep up is
// dropped; it catches up from the log when it reconnects.
func (room *Room) broadcast(b []byte, except *peer) {
	for p := range room.peers {
		if p == except {
			continue
		}
		select {
		case p.send <- b:
		default:
			close(p.send)
			delete(room.peers, p)
		}
	}
}
