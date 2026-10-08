// The relay's wire protocol, version 1 (relay/PROTOCOL.md): one binary frame
// per WebSocket message, a type byte and then fields. Integers are unsigned
// varints; bytes are a varint length, then the bytes.

export const PROTOCOL_VERSION = 1;

export const Frame = {
  Hello: 0x01,
  Update: 0x02,
  Snapshot: 0x03,
  Ephemeral: 0x04,
  SnapshotOut: 0x81,
  UpdateOut: 0x82,
  Synced: 0x83,
  Ack: 0x84,
  EphemeralOut: 0x85,
  Left: 0x86,
  Error: 0x87,
} as const;

export const HelloFlag = { Create: 1, Replay: 2, Retire: 4 } as const;

/** Error codes the relay sends (relay/PROTOCOL.md). */
export const RelayError = {
  OutdatedRelay: 1,
  OutdatedClient: 2,
  UnknownRoom: 3,
  RoomTaken: 4,
  ReadOnly: 5,
  TooLarge: 6,
  RoomFull: 7,
  RelayFull: 8,
  RateLimited: 9,
  BadFrame: 10,
  HelloFirst: 11,
  Internal: 12,
  Replaced: 13,
} as const;

export class FrameWriter {
  private parts: number[] = [];
  private chunks: Uint8Array[] = [];
  constructor(kind: number) {
    this.parts.push(kind);
  }
  uint(v: number): this {
    let n = v;
    while (n >= 0x80) {
      this.parts.push((n % 0x80) | 0x80);
      n = Math.floor(n / 0x80);
    }
    this.parts.push(n);
    return this;
  }
  bytes(v: Uint8Array): this {
    this.uint(v.length);
    this.flush();
    this.chunks.push(v);
    return this;
  }
  private flush() {
    if (this.parts.length > 0) {
      this.chunks.push(Uint8Array.from(this.parts));
      this.parts = [];
    }
  }
  done(): Uint8Array {
    this.flush();
    const out = new Uint8Array(this.chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

/** Reads a frame's fields in order. Running out of bytes throws. */
export class FrameReader {
  readonly kind: number;
  private at = 1;
  constructor(private readonly b: Uint8Array) {
    if (b.length === 0) throw new Error('empty frame');
    this.kind = b[0]!;
  }
  uint(): number {
    let v = 0;
    let scale = 1;
    for (;;) {
      if (this.at >= this.b.length) throw new Error('frame ends early');
      const byte = this.b[this.at++]!;
      v += (byte & 0x7f) * scale;
      if (byte < 0x80) return v;
      scale *= 0x80;
    }
  }
  bytes(): Uint8Array {
    const n = this.uint();
    if (this.at + n > this.b.length) throw new Error('frame ends early');
    const v = this.b.slice(this.at, this.at + n);
    this.at += n;
    return v;
  }
  text(): string {
    return new TextDecoder().decode(this.bytes());
  }
  /** Whether a field follows: for trailing fields added within a version. */
  more(): boolean {
    return this.at < this.b.length;
  }
}
