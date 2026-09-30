// A small CSV reader (ADR 0010): quoted fields, doubled quotes, line breaks
// inside quotes, CRLF, a byte-order mark, and comma, semicolon, or tab
// delimiters. Pure, so it's tested without a browser.

export interface CsvTable {
  /** The first row: column headers, repeated names included (Jira repeats "Component/s"). */
  header: string[];
  /** Every other non-blank row, padded or trimmed to the header's width. */
  rows: string[][];
}

const DELIMITERS = [',', ';', '\t'] as const;

/** The delimiter used most on the first line, outside quotes. Commas win ties. */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  let best = ',';
  for (const d of DELIMITERS) if (counts.get(d)! > counts.get(best)!) best = d;
  return best;
}

/** Split CSV text into rows of fields. */
export function parseCsvRows(text: string, delimiter = detectDelimiter(text)): string[][] {
  const input = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (ch === '\r' && input[i + 1] === '\n') i++;
    } else field += ch;
    i++;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** Read a CSV file with a header row. */
export function parseCsv(text: string): CsvTable {
  const [header = [], ...rest] = parseCsvRows(text);
  const width = header.length;
  const rows = rest.map((r) => (r.length >= width ? r.slice(0, width) : [...r, ...Array<string>(width - r.length).fill('')]));
  return { header: header.map((h) => h.trim()), rows };
}
