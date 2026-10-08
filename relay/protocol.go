package main

// The wire protocol (relay/PROTOCOL.md). Every WebSocket message is one
// binary frame: a type byte, then that type's fields in order. Integers are
// unsigned varints; byte strings are a varint length, then the bytes.
//
// The relay reads only what it needs to number, store and forward frames.
// Every `data` field is ciphertext made by a client, which the relay stores
// and forwards exactly as given.

import (
	"encoding/binary"
	"errors"
)

// ProtocolVersion is the version this relay speaks. A client says which it
// speaks in `hello`; a mismatch is answered with ErrOutdated.
const ProtocolVersion = 1

// Frames a client sends.
const (
	FrameHello     byte = 0x01
	FrameUpdate    byte = 0x02
	FrameSnapshot  byte = 0x03
	FrameEphemeral byte = 0x04
)

// Frames the relay sends.
const (
	FrameSnapshotOut  byte = 0x81
	FrameUpdateOut    byte = 0x82
	FrameSynced       byte = 0x83
	FrameAck          byte = 0x84
	FrameEphemeralOut byte = 0x85
	FrameLeft         byte = 0x86
	FrameError        byte = 0x87
)

// Hello flags.
const (
	// HelloCreate asks the relay to make the room if it doesn't exist, with
	// the hello's write token as its own. Asking again with the same token
	// is harmless, so a client that crashed mid-share can simply retry.
	HelloCreate uint64 = 1 << 0
	// HelloReplay asks for every update the relay still keeps, ignoring the
	// snapshot: for a client that couldn't read the snapshot.
	HelloReplay uint64 = 1 << 1
)

// Error codes, in FrameError.
const (
	ErrOutdatedRelay  uint64 = 1  // the client speaks a newer protocol
	ErrOutdatedClient uint64 = 2  // the client speaks an older protocol
	ErrUnknownRoom    uint64 = 3  // no such room, and the hello didn't ask to create it
	ErrRoomTaken      uint64 = 4  // create asked for a room that exists with another token
	ErrReadOnly       uint64 = 5  // a write from a connection without the room's write token
	ErrTooLarge       uint64 = 6  // a frame over the message limit
	ErrRoomFull       uint64 = 7  // the room is at its size limit
	ErrRelayFull      uint64 = 8  // the relay is at its data or room limit
	ErrRateLimited    uint64 = 9  // too many updates, connections or new rooms
	ErrBadFrame       uint64 = 10 // a frame the relay can't parse
	ErrHelloFirst     uint64 = 11 // anything but hello before the hello
	ErrInternal       uint64 = 12 // the relay couldn't store something
)

var errShort = errors.New("frame ends early")

// Writer builds a frame.
type Writer struct{ b []byte }

func NewFrame(kind byte) *Writer { return &Writer{b: []byte{kind}} }

func (w *Writer) Uint(v uint64) *Writer {
	w.b = binary.AppendUvarint(w.b, v)
	return w
}

func (w *Writer) Bytes(v []byte) *Writer {
	w.b = binary.AppendUvarint(w.b, uint64(len(v)))
	w.b = append(w.b, v...)
	return w
}

func (w *Writer) String(v string) *Writer { return w.Bytes([]byte(v)) }

func (w *Writer) Done() []byte { return w.b }

// Reader takes a frame apart. The first error sticks, so a caller can read
// every field and check Err once.
type Reader struct {
	b   []byte
	err error
}

// NewReader returns the frame's type and a reader for its fields.
func NewReader(frame []byte) (byte, *Reader) {
	if len(frame) == 0 {
		return 0, &Reader{err: errShort}
	}
	return frame[0], &Reader{b: frame[1:]}
}

func (r *Reader) Uint() uint64 {
	if r.err != nil {
		return 0
	}
	v, n := binary.Uvarint(r.b)
	if n <= 0 {
		r.err = errShort
		return 0
	}
	r.b = r.b[n:]
	return v
}

func (r *Reader) Bytes() []byte {
	n := r.Uint()
	if r.err != nil {
		return nil
	}
	if uint64(len(r.b)) < n {
		r.err = errShort
		return nil
	}
	v := r.b[:n]
	r.b = r.b[n:]
	return v
}

func (r *Reader) Err() error { return r.err }

// errorFrame is FrameError: a code the client acts on, and words for a person.
func errorFrame(code uint64, message string) []byte {
	return NewFrame(FrameError).Uint(code).String(message).Done()
}
