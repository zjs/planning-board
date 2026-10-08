package main

// A room on disk (ADR 0017): one directory per shared plan, holding
//
//   room.json        when it was made, the hash of its write token, its epoch,
//                    and when its links were replaced, if they were
//   snapshot.json    the latest snapshot a client uploaded, if any
//   log.jsonl        every update since that snapshot, one per line
//   segments/        updates a snapshot replaced, kept 30 days so a bad
//                    snapshot can be replaced by a full replay
//
// Data is ciphertext, written as base64 by encoding/json. Nothing here can
// read it.

import (
	"bufio"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// SegmentRetention is how long updates a snapshot replaced are kept.
const SegmentRetention = 30 * 24 * time.Hour

type roomMeta struct {
	Version   int    `json:"version"`
	TokenHash string `json:"tokenHash"`
	Epoch     string `json:"epoch"`
	Created   int64  `json:"created"`
	// Retired is when the room's links were replaced (Q62), in Unix
	// milliseconds, or 0. A retired room is read-only for good.
	Retired int64 `json:"retired,omitempty"`
}

type entry struct {
	Seq  uint64 `json:"seq"`
	At   int64  `json:"at"`
	Data []byte `json:"data"`
}

type snapshot struct {
	Upto uint64 `json:"upto"`
	At   int64  `json:"at"`
	Data []byte `json:"data"`
}

// Room is one shared plan. mu guards everything else, and is held while
// frames are queued to peers, so every peer sees updates in order.
type Room struct {
	mu       sync.Mutex
	peers    map[*peer]struct{}
	users    int // connections holding the room open (Relay.acquire)
	id       string
	dir      string
	meta     roomMeta
	epoch    []byte
	head     uint64
	snapshot snapshot
	log      []entry
	logFile  *os.File
	// size is the ciphertext the room holds now: its snapshot and its log.
	// Kept segments don't count; they expire on their own.
	size int64
}

func hashToken(token []byte) string {
	sum := sha256.Sum256(token)
	return hex.EncodeToString(sum[:])
}

// canWrite says whether token is this room's write token, in constant time.
func (room *Room) canWrite(token []byte) bool {
	if len(token) == 0 {
		return false
	}
	want, err := hex.DecodeString(room.meta.TokenHash)
	if err != nil {
		return false
	}
	got := sha256.Sum256(token)
	return subtle.ConstantTimeCompare(want, got[:]) == 1
}

// retire marks the room's links replaced, durably. Call with room.mu held.
// Retiring again changes nothing.
func (room *Room) retire(now time.Time) error {
	if room.meta.Retired != 0 {
		return nil
	}
	meta := room.meta
	meta.Retired = now.UnixMilli()
	b, _ := json.Marshal(meta)
	if err := writeAtomic(filepath.Join(room.dir, "room.json"), b); err != nil {
		return err
	}
	room.meta = meta
	return nil
}

// newEpoch gives a room on disk a new epoch, after a restore from a backup:
// boards that see it start their cursor again, and send what the room is missing.
func newEpoch(dir string) error {
	path := filepath.Join(dir, "room.json")
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var meta roomMeta
	if err := json.Unmarshal(b, &meta); err != nil {
		return err
	}
	epoch := make([]byte, 16)
	if _, err := rand.Read(epoch); err != nil {
		return err
	}
	meta.Epoch = hex.EncodeToString(epoch)
	b, _ = json.Marshal(meta)
	return writeAtomic(path, b)
}

func (room *Room) retired() bool { return room.meta.Retired != 0 }

func isRoom(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, "room.json"))
	return err == nil
}

// createRoom makes a new room with token as its write token.
func createRoom(dir, id string, token []byte, now time.Time) (*Room, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	epoch := make([]byte, 16)
	if _, err := rand.Read(epoch); err != nil {
		return nil, err
	}
	meta := roomMeta{Version: 1, TokenHash: hashToken(token), Epoch: hex.EncodeToString(epoch), Created: now.UnixMilli()}
	b, _ := json.Marshal(meta)
	if err := writeAtomic(filepath.Join(dir, "room.json"), b); err != nil {
		return nil, err
	}
	return loadRoom(dir, id, now)
}

// loadRoom opens a room made earlier: its meta, its snapshot, and its log.
func loadRoom(dir, id string, now time.Time) (*Room, error) {
	room := &Room{id: id, dir: dir, peers: map[*peer]struct{}{}}
	b, err := os.ReadFile(filepath.Join(dir, "room.json"))
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(b, &room.meta); err != nil {
		return nil, fmt.Errorf("room %s: room.json: %w", id, err)
	}
	if room.epoch, err = hex.DecodeString(room.meta.Epoch); err != nil {
		return nil, fmt.Errorf("room %s: epoch: %w", id, err)
	}
	if b, err := os.ReadFile(filepath.Join(dir, "snapshot.json")); err == nil {
		if err := json.Unmarshal(b, &room.snapshot); err != nil {
			return nil, fmt.Errorf("room %s: snapshot: %w", id, err)
		}
		room.head = room.snapshot.Upto
		room.size += int64(len(room.snapshot.Data))
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	entries, err := readLog(filepath.Join(dir, "log.jsonl"))
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if e.Seq > room.snapshot.Upto {
			room.log = append(room.log, e)
			room.size += int64(len(e.Data))
		}
		if e.Seq > room.head {
			room.head = e.Seq
		}
	}
	f, err := os.OpenFile(filepath.Join(dir, "log.jsonl"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	room.logFile = f
	room.pruneSegments(now)
	return room, nil
}

// readLog reads a log or segment file. A torn last line, from a crash
// mid-write, is dropped: it was never acknowledged.
func readLog(path string) ([]entry, error) {
	f, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var out []entry
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64<<10), 64<<20)
	for scanner.Scan() {
		var e entry
		if err := json.Unmarshal(scanner.Bytes(), &e); err != nil {
			break
		}
		out = append(out, e)
	}
	return out, nil
}

// append gives data the next sequence number and makes it durable before
// anyone hears about it.
func (room *Room) append(data []byte, now time.Time) (entry, error) {
	e := entry{Seq: room.head + 1, At: now.UnixMilli(), Data: data}
	line, _ := json.Marshal(e)
	if _, err := room.logFile.Write(append(line, '\n')); err != nil {
		return entry{}, err
	}
	if err := room.logFile.Sync(); err != nil {
		return entry{}, err
	}
	room.head = e.Seq
	room.log = append(room.log, e)
	room.size += int64(len(data))
	return e, nil
}

// compact stores a client's snapshot, and moves the updates it covers into
// a segment kept for SegmentRetention. It returns how much the room's size
// changed. A snapshot that covers nothing new, or more than exists, is ignored.
func (room *Room) compact(s snapshot, now time.Time) (int64, error) {
	if s.Upto <= room.snapshot.Upto || s.Upto > room.head {
		return 0, nil
	}
	before := room.size
	var covered, kept []entry
	for _, e := range room.log {
		if e.Seq <= s.Upto {
			covered = append(covered, e)
		} else {
			kept = append(kept, e)
		}
	}
	if len(covered) > 0 {
		if err := os.MkdirAll(filepath.Join(room.dir, "segments"), 0o700); err != nil {
			return 0, err
		}
		if err := writeLog(filepath.Join(room.dir, "segments", fmt.Sprintf("log-%020d.jsonl", s.Upto)), covered); err != nil {
			return 0, err
		}
	}
	b, _ := json.Marshal(s)
	if err := writeAtomic(filepath.Join(room.dir, "snapshot.json"), b); err != nil {
		return 0, err
	}
	// Rewrite the log with only what the snapshot doesn't cover.
	if err := writeLog(filepath.Join(room.dir, "log.jsonl"), kept); err != nil {
		return 0, err
	}
	room.logFile.Close()
	f, err := os.OpenFile(filepath.Join(room.dir, "log.jsonl"), os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return 0, err
	}
	room.logFile = f
	room.snapshot = s
	room.log = kept
	room.size = int64(len(s.Data))
	for _, e := range kept {
		room.size += int64(len(e.Data))
	}
	room.pruneSegments(now)
	return room.size - before, nil
}

// retained is every update the relay still has, oldest first: kept
// segments, then the log. For a client that couldn't read the snapshot.
func (room *Room) retained() ([]entry, error) {
	names, _ := filepath.Glob(filepath.Join(room.dir, "segments", "log-*.jsonl"))
	sort.Strings(names)
	var out []entry
	last := uint64(0)
	for _, name := range names {
		entries, err := readLog(name)
		if err != nil {
			return nil, err
		}
		for _, e := range entries {
			if e.Seq > last {
				out = append(out, e)
				last = e.Seq
			}
		}
	}
	for _, e := range room.log {
		if e.Seq > last {
			out = append(out, e)
			last = e.Seq
		}
	}
	return out, nil
}

// pruneSegments deletes segments older than SegmentRetention.
func (room *Room) pruneSegments(now time.Time) {
	names, _ := filepath.Glob(filepath.Join(room.dir, "segments", "log-*.jsonl"))
	for _, name := range names {
		if info, err := os.Stat(name); err == nil && now.Sub(info.ModTime()) > SegmentRetention {
			os.Remove(name)
		}
	}
}

func (room *Room) close() {
	if room.logFile != nil {
		room.logFile.Close()
	}
}

// writeLog writes entries to path atomically, one JSON line each.
func writeLog(path string, entries []entry) error {
	var b strings.Builder
	for _, e := range entries {
		line, _ := json.Marshal(e)
		b.Write(line)
		b.WriteByte('\n')
	}
	return writeAtomic(path, []byte(b.String()))
}

// writeAtomic writes b to path through a synced temporary file and a rename,
// so a crash leaves the old file or the new one, never half of either.
func writeAtomic(path string, b []byte) error {
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// roomSize reads a room's size from disk without opening it, for the
// relay's totals at start-up.
func roomSize(dir string) int64 {
	var size int64
	var s snapshot
	if b, err := os.ReadFile(filepath.Join(dir, "snapshot.json")); err == nil && json.Unmarshal(b, &s) == nil {
		size += int64(len(s.Data))
	}
	entries, _ := readLog(filepath.Join(dir, "log.jsonl"))
	for _, e := range entries {
		if e.Seq > s.Upto {
			size += int64(len(e.Data))
		}
	}
	return size
}
