/**
 * The id of the element in the built page that holds the third-party notices
 * as plain text (scripts/notices.ts writes it; the cheat sheet reads it).
 */
export const NOTICES_ID = 'third-party-notices';

/** The notices in this page, or null when it wasn't built with them (the dev server). */
export function thirdPartyNotices(): string | null {
  return document.getElementById(NOTICES_ID)?.textContent.trim() || null;
}
