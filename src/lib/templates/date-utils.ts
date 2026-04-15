// ── DATE UTILITIES FOR DEED GENERATION ──────────────────────────────────────
// Ported from backend/docGenerator/dateUtils.js

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * Converts an ISO date string (e.g. '2026-03-27') to a legal-friendly format.
 * Output: '27th March 2026'
 */
export function formatDate(isoStr: string | null | undefined): string {
  if (!isoStr) return '';
  const d = new Date(isoStr + 'T00:00:00');
  if (isNaN(d.getTime())) return isoStr;

  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();

  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';

  return `${day}${suffix} ${month} ${year}`;
}

/**
 * Converts a number to its ordinal form (e.g. 1 -> "1st", 2 -> "2nd").
 */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'] as const;
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
