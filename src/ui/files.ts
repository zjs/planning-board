// Moving files in and out of the page. Works from a page opened from disk,
// where there's no server to download from.

/** Offer `text` as a download named `name`. */
export function downloadText(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Some browsers start the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "planning-board-2026-09-30.json", in the viewer's own time zone. */
export function datedFileName(prefix: string, extension: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${extension}`;
}
