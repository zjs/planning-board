import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv, parseCsvRows } from './csv.ts';

describe('parseCsvRows', () => {
  it('reads quoted fields, doubled quotes, and line breaks inside quotes', () => {
    const text = 'a,b,c\n"one, two","say ""hi""","line 1\nline 2"\n';
    expect(parseCsvRows(text)).toEqual([
      ['a', 'b', 'c'],
      ['one, two', 'say "hi"', 'line 1\nline 2'],
    ]);
  });

  it('handles CRLF, a byte-order mark, empty fields, and blank lines', () => {
    expect(parseCsvRows('﻿a,b\r\n1,\r\n\r\n,2')).toEqual([
      ['a', 'b'],
      ['1', ''],
      ['', '2'],
    ]);
  });

  it('keeps a quote in the middle of an unquoted field as text', () => {
    expect(parseCsvRows('a\n5" screen')).toEqual([['a'], ['5" screen']]);
  });
});

describe('detectDelimiter', () => {
  it('picks the delimiter used most on the header line, ignoring quoted text', () => {
    expect(detectDelimiter('a,b,c\n')).toBe(',');
    expect(detectDelimiter('a;b;"c,d,e"\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\n')).toBe('\t');
    expect(detectDelimiter('single')).toBe(',');
  });
});

describe('parseCsv', () => {
  it('keeps repeated headers and pads short rows to the header width', () => {
    expect(parseCsv('Summary,Component/s,Component/s\nA,SSO\nB,SSO,MFA,extra')).toEqual({
      header: ['Summary', 'Component/s', 'Component/s'],
      rows: [
        ['A', 'SSO', ''],
        ['B', 'SSO', 'MFA'],
      ],
    });
  });

  it('reads an empty file as no columns', () => {
    expect(parseCsv('')).toEqual({ header: [], rows: [] });
  });
});
