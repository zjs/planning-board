import { describe, expect, it } from 'vitest';
import { Frame, FrameReader, FrameWriter } from './frames.ts';

describe('relay frames (relay/PROTOCOL.md)', () => {
  it('round-trips integers of every size, and bytes', () => {
    const big = 2 ** 40 + 12345;
    const f = new FrameWriter(Frame.Update).uint(0).uint(127).uint(128).uint(300).uint(big).bytes(new Uint8Array([1, 2, 3])).bytes(new Uint8Array()).done();
    const r = new FrameReader(f);
    expect(r.kind).toBe(Frame.Update);
    expect([r.uint(), r.uint(), r.uint(), r.uint(), r.uint()]).toEqual([0, 127, 128, 300, big]);
    expect([...r.bytes()]).toEqual([1, 2, 3]);
    expect(r.bytes()).toHaveLength(0);
    expect(r.more()).toBe(false);
  });

  it('encodes varints as Go does', () => {
    // binary.AppendUvarint(nil, 300) is [0xac, 0x02].
    expect([...new FrameWriter(Frame.Hello).uint(300).done()]).toEqual([Frame.Hello, 0xac, 0x02]);
  });

  it('throws on a frame that ends early', () => {
    const f = new FrameWriter(Frame.Ack).uint(1).bytes(new Uint8Array(10)).done();
    const r = new FrameReader(f.slice(0, f.length - 4));
    r.uint();
    expect(() => r.bytes()).toThrow();
    expect(() => new FrameReader(new Uint8Array())).toThrow();
  });
});
